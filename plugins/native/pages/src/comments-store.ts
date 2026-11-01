import { randomUUID } from "node:crypto";
import type { PagesCommentAnchor, PagesCommentMessage, PagesCommentThread, PagesRecord } from "./contract.js";
import { pagesErrors } from "./error.js";
import { cutCharacters } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import type { PagesSql } from "./store.js";

type StoredThread = Omit<PagesCommentThread, "detached">;
export interface AppendPagesComment {
  page_id: string;
  thread_id: string;
  request_id: string;
  body: string;
  reply_to?: string;
  anchor?: { kind: "document" | "text"; mark_id?: string };
  expected_version?: number;
}


/** Reads the current document's marks; there is no text-search reattachment. */
export function pageAnnotations(body: PagesRecord["body"]): Map<string, { text: string; excerpt: string }> {
  const marks = new Map<string, { text: string; excerpt: string }>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    const node = value as { text?: string; marks?: Array<{ type: string; attrs?: { id?: string; text?: string } }>; content?: unknown[] };
    for (const mark of node.marks ?? []) if (mark.type === "comment" && mark.attrs?.id) {
      const previous = marks.get(mark.attrs.id);
      marks.set(mark.attrs.id, { text: String(mark.attrs.text ?? ""), excerpt: cutCharacters((previous?.excerpt ?? "") + (node.text ?? ""), 2000) });
    }
    node.content?.forEach(visit);
  };
  visit(body);
  return marks;
}

/** The Pages-owned discussion log is independent of document versions, so replies cannot overwrite edits. */
export class PagesComments {
  constructor(private readonly db: PagesSql, private readonly atomically: <T>(run: () => T) => T,
    private readonly page: (id: string, projectId: string) => PagesRecord) {}

  list(pageId: string, projectId: string): PagesCommentThread[] {
    const page = this.page(pageId, projectId);
    const marks = pageAnnotations(page.body);
    return this.db.all("SELECT body FROM page_comments WHERE page_id=? ORDER BY created_at,thread_id", [pageId])
      .map(row => this.present(JSON.parse(String(row.body)) as StoredThread, marks));
  }

  get(pageId: string, threadId: string, projectId: string): PagesCommentThread {
    const page = this.page(pageId, projectId);
    const row = this.db.get("SELECT body FROM page_comments WHERE page_id=? AND thread_id=?", [pageId, threadId]);
    if (!row) throw pagesErrors.not_found("找不到这条评论");
    return this.present(JSON.parse(String(row.body)) as StoredThread, pageAnnotations(page.body));
  }

  append(input: AppendPagesComment, projectId: string): PagesCommentThread {
    return this.atomically(() => {
      const page = this.page(input.page_id, projectId);
      let thread = this.read(input.page_id, input.thread_id);
      const body = input.body.trim();
      if (!body || [...body].length > 20000) throw pagesErrors.invalid("评论须为 1 到 20000 个字");
      const prior = thread?.messages.find(message => message.author === "user" && message.request_id === input.request_id);
      if (prior) {
        if (prior.body !== body || prior.reply_to !== input.reply_to) throw pagesErrors.invalid("这次发送的内容已改变，请重新发送");
        return this.present(thread!, pageAnnotations(page.body));
      }
      if (!thread) {
        if (page.version !== input.expected_version) throw pagesErrors.invalid("正文已改变，请保存后重新发起评论");
        if (!input.anchor) throw pagesErrors.invalid("新评论缺少引用范围");
        const mark = input.anchor.kind === "text" ? pageAnnotations(page.body).get(input.anchor.mark_id ?? "") : null;
        if (input.anchor.kind === "text" && !mark) throw pagesErrors.invalid("所选原文已不存在，请重新选择");
        const anchor: PagesCommentAnchor = { kind: input.anchor.kind, excerpt: mark?.excerpt ?? page.title,
          ...(input.anchor.kind === "text" ? { mark_id: input.anchor.mark_id } : {}) };
        thread = { thread_id: input.thread_id, page_id: page.id, revision: 0, anchor, messages: [] };
        // An explicit reply starts a discussion about an existing annotation; its text remains in the document.
        if (mark?.text) thread = { ...thread, messages: [{ message_id: `annotation-${input.anchor.mark_id}`, author: "annotation",
          body: mark.text, created_at: page.updated_at, request_id: `annotation-${input.anchor.mark_id}` }] };
      }
      if (input.reply_to && !thread.messages.some(message => message.message_id === input.reply_to)) throw pagesErrors.invalid("被回复的消息不在这条评论里");
      const next: StoredThread = { ...thread, revision: thread.revision + 1, messages: [...thread.messages, {
        message_id: randomUUID(), author: "user", body, request_id: input.request_id, created_at: new Date().toISOString(),
        ...(input.reply_to ? { reply_to: input.reply_to } : {}),
      }] };
      this.save(next);
      return this.present(next, pageAnnotations(page.body));
    });
  }

  reply(pageId: string, threadId: string, projectId: string, message: PagesCommentMessage): PagesCommentThread {
    return this.atomically(() => {
      const page = this.page(pageId, projectId);
      const thread = this.read(pageId, threadId);
      if (!thread) throw pagesErrors.not_found("原评论已不存在");
      const prior = thread.messages.find(item => item.author === "assistant" && item.request_id === message.request_id && item.run_id === message.run_id);
      if (prior) return this.present(thread, pageAnnotations(page.body));
      if (!message.body.trim() || !message.run_id || !message.work_id || !thread.messages.some(item => item.message_id === message.reply_to)) throw pagesErrors.invalid("助理回复缺少有效的原消息或运行来源");
      const next = { ...thread, revision: thread.revision + 1, messages: [...thread.messages, message] };
      this.save(next);
      return this.present(next, pageAnnotations(page.body));
    });
  }

  private read(pageId: string, threadId: string): StoredThread | null {
    const row = this.db.get("SELECT body FROM page_comments WHERE page_id=? AND thread_id=?", [pageId, threadId]);
    return row ? JSON.parse(String(row.body)) as StoredThread : null;
  }
  private save(thread: StoredThread): void {
    this.db.run("INSERT INTO page_comments(page_id,thread_id,body,created_at) VALUES (?,?,?,?) ON CONFLICT(page_id,thread_id) DO UPDATE SET body=excluded.body",
      [thread.page_id, thread.thread_id, JSON.stringify(thread), new Date().toISOString()]);
  }
  private present(thread: StoredThread, marks: ReturnType<typeof pageAnnotations>): PagesCommentThread {
    return { ...thread, detached: thread.anchor.kind === "text" && !marks.has(thread.anchor.mark_id ?? "") };
  }
}

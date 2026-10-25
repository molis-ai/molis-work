import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { ActionService, CapabilityRegistry } from "@molis-ai/molis-work-kernel";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PagesBody, PagesCommentThread } from "@molis-ai/molis-work-contracts/modules/pages";
import type { AssistantThreadContext } from "@molis-ai/molis-work-contracts/services/assistant";
import { createPagesCommentHandlers, ownPagesStores, pagesCommentActions } from "@molis-ai/molis-work-plugin-pages";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { projectDeletedHooksFor } from "@molis-ai/molis-work-app-local-host";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";

const body = (marked: boolean): PagesBody => ({ type: "doc", content: [{ type: "paragraph", attrs: { note: "保留块备注" }, content: [{ type: "text", text: "可定位的原文", ...(marked ? { marks: [{ type: "comment", attrs: { id: "mark-1", text: "保留原批注" } }] } : {}) }] }] });

test("PAS-02 PAS-09: Pages persists scoped threads, preserves annotations and notes, detaches deleted anchors and deduplicates retries", async () => {
  const home = await mkdtemp(join(tmpdir(), "pages-comments-"));
  let store = openPagesStore(home);
  try {
    const page = store.create({ project_id: "a", title: "评论来源", body: body(true) });
    const input = { page_id: page.id, thread_id: "thread-1", request_id: "send-1", body: "请比较这段", expected_version: page.version, anchor: { kind: "text" as const, mark_id: "mark-1" } };
    const first = store.comments.append(input, "a");
    assert.equal(first.messages.length, 2);assert.equal(first.messages[0]!.author, "annotation");
    assert.equal(first.messages[0]!.body, "保留原批注");assert.equal(first.anchor.excerpt, "可定位的原文");
    assert.deepEqual(store.get(page.id, "a").body, body(true));
    assert.deepEqual(store.comments.append(input, "a"), first);
    assert.throws(() => store.comments.append({ ...input, body: "不同内容" }, "a"), /内容已改变/);
    assert.throws(() => store.comments.list(page.id, "b"), /不存在|找不到/);
    assert.throws(() => store.comments.append({ ...input, thread_id: "bad-version", expected_version: 99 }, "a"), /正文已改变/);
    assert.throws(() => store.comments.append({ ...input, thread_id: "missing-mark", anchor: { kind: "text", mark_id: "absent" } }, "a"), /原文已不存在/);
    const changed = store.update(page.id, { body: body(false), expected_version: page.version }, "a");
    assert.equal(store.comments.get(page.id, first.thread_id, "a").detached, true);
    const response = { message_id: randomUUID(), author: "assistant" as const, body: "基于引用的答复", reply_to: first.messages.at(-1)!.message_id, request_id: "send-1", work_id: "work-1", run_id: "run-1", created_at: new Date().toISOString() };
    const replied = store.comments.reply(page.id, first.thread_id, "a", response);
    assert.equal(replied.messages.length, 3);assert.equal(replied.detached, true);
    assert.deepEqual(store.comments.reply(page.id, first.thread_id, "a", { ...response, message_id: randomUUID() }), replied);
    assert.deepEqual(store.get(page.id, "a"), changed, "reply cannot overwrite a document edited during the run");
    store.close();store = openPagesStore(home);assert.deepEqual(store.comments.get(page.id, first.thread_id, "a"), replied);
    assert.equal(await projectDeletedHooksFor(home).clear("pages", "a"), true);assert.throws(() => store.comments.list(page.id, "a"), /不存在|找不到/);
    const raw = openHomeSqliteDatabase(home, "pages");
    try { assert.equal(raw.prepare("SELECT count(*) AS n FROM page_comments").get()!.n, 0, "project deletion removes the discussion rows, not just their visible parent"); }
    finally { raw.close(); }
  } finally { store.close();await rm(home, { recursive: true, force: true }); }
});

test("PAS-08 PAS-10: real action dispatcher refuses forged authorship, wrong target, revoked permissions and expired delivery", async () => {
  const home = await mkdtemp(join(tmpdir(), "pages-comments-actions-")), store = openPagesStore(home);
  const service = new ActionService(new CapabilityRegistry<ActionCallContext>());
  service.registerProvider({ provider: { provider_id: "io.molis.work.pages", kind: "plugin", title: "Pages" }, definitions: Object.values(pagesCommentActions), handlers: createPagesCommentHandlers(ownPagesStores(run => run(store))) });
  const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: ["pages:read", "pages:write"] };
  try {
    assert.deepEqual(inspectActionDeclarations(Object.values(pagesCommentActions), undefined), []);
    const page = store.create({ project_id: "a", title: "原评论", body: body(true) });
    const input = { page_id: page.id, thread_id: "thread", request_id: "send", body: "请助理回答", expected_version: page.version, anchor: { kind: "document" } };
    await assert.rejects(service.invoke(caller, pagesCommentActions.append, { ...input, author: "assistant" }), /输入|schema|author/i);
    const { thread } = await service.invoke(caller, pagesCommentActions.append, input) as { thread: PagesCommentThread };
    const target = { subject_id: page.id, thread_id: thread.thread_id };
    const contextInput = { ...target, message_id: thread.messages[0]!.message_id, draft: { text: "用户明确附上的未保存内容", revision: String(page.version) } };
    const context = await service.invoke(caller, pagesCommentActions.context, contextInput) as AssistantThreadContext;
    assert.match(context.text, /用户明确附上的未保存草稿/);assert.match(context.text, /未保存内容/);
    assert.doesNotMatch(context.text, /可定位的原文/);assert.deepEqual(store.get(page.id, "a").body, body(true));
    await assert.rejects(service.invoke(caller, pagesCommentActions.context, { ...contextInput, draft: { ...contextInput.draft, revision: "99" } }), /正文已改变/);
    await assert.rejects(service.invoke({ ...caller, project_id: "b" }, pagesCommentActions.context, contextInput), /不存在|找不到/);
    await assert.rejects(service.invoke(caller, pagesCommentActions.reply, target), /只能由宿主/);
    const delivery = { target: { provider_id: "io.molis.work.pages", subject_kind: "pages_document", ...target, title: "原评论" }, message_id: thread.messages[0]!.message_id, request_id: "send", work_id: "work", run_id: "run", body: "助理回答" };
    await assert.rejects(service.invoke({ ...caller, assistant_reply: { ...delivery, target: { ...delivery.target, thread_id: "wrong" } } }, pagesCommentActions.reply, target), /只能由宿主/);
    await assert.rejects(service.invoke({ ...caller, assistant_reply: delivery, permissions: ["pages:read"] }, pagesCommentActions.reply, target), /权限|不可|需要/);
    const abort = new AbortController();
    await assert.rejects(service.invoke({ ...caller, assistant_reply: delivery, signal: abort.signal, validate_authority: async () => { abort.abort(new Error("revoked")); } }, pagesCommentActions.reply, target), /revoked/);
    assert.equal(store.comments.get(page.id, thread.thread_id, "a").messages.length, 1);
    await service.invoke({ ...caller, assistant_reply: delivery }, pagesCommentActions.reply, target);
    assert.equal(store.comments.get(page.id, thread.thread_id, "a").messages.at(-1)!.body, "助理回答");
  } finally { store.close();await rm(home, { recursive: true, force: true }); }
});

test("PAS-08: generic thread declarations refuse agent audience, Home scope, wrong kind and mismatched role", () => {
  const context = pagesCommentActions.context;
  for (const action of [
    { ...context.action, audiences: ["agent"] },
    { ...context.action, scope: "home" },
    { ...context.action, thread_source: { role: "context", subject_kind: "unrelated" } },
    { ...context.action, thread_source: { role: "reply", subject_kind: "pages_document" } },
  ]) assert.ok(inspectActionDeclarations([{ ...context, action }], undefined).some(problem => problem.includes("评论协议")));
});

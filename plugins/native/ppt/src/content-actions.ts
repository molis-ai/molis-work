import { bindWorkflowContentHandlers, defineWorkflowContentActions, workflowDeliveryKey, type ActionCallContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PptRecord, PptSlideInput } from "@molis-ai/molis-work-contracts/modules/ppt";
import { PptError } from "./error.js";
import type { PptStore } from "./store.js";

/** A deck is a workflow content station: it hands its outline on as Markdown and turns Markdown it receives into slides. */
export const pptContentActions = defineWorkflowContentActions({ id: "ppt", title: "演示稿", icon: "image", create: true,
  read_permissions: ["ppt:read"], write_permissions: ["ppt:read", "ppt:write"] });

/** The deck as an outline: one `##` per slide, its bullets, notes as a quote. */
export function pptMarkdown(record: PptRecord): string {
  const lines = [`# ${record.title}`];
  if (record.description) lines.push("", record.description);
  for (const slide of record.slides) {
    lines.push("", `## ${slide.title || "（未命名一页）"}`);
    for (const bullet of slide.bullets) lines.push(`- ${bullet}`);
    if (slide.notes) lines.push("", ...slide.notes.split(/\r?\n/u).map(line => `> ${line}`));
  }
  return lines.join("\n") + "\n";
}

/**
 * Slides from an outline someone hands over (a document, a spark): `#`/`##` headings start slides, list items and
 * short lines become bullets, quotes become speaker notes. Without headings, paragraphs are grouped six bullets a slide.
 */
export function slidesFromMarkdown(markdown: string, fallbackTitle: string): { title: string; slides: PptSlideInput[] } {
  const clean = (value: string) => value.replace(/[*_`~]/gu, "").replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1").trim();
  const lines = markdown.replace(/\r\n?/gu, "\n").split("\n");
  let title = "";
  const slides: { title: string; bullets: string[]; notes: string[] }[] = [];
  let current: { title: string; bullets: string[]; notes: string[] } | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const heading = /^(#{1,3})\s+(.*)$/u.exec(line);
    if (heading) {
      const text = clean(heading[2]!);
      if (heading[1] === "#" && !title && !slides.length) { title = text; continue; }
      current = { title: text, bullets: [], notes: [] };
      slides.push(current);
      continue;
    }
    if (!current) { current = { title: "", bullets: [], notes: [] }; slides.push(current); }
    if (line.startsWith(">")) { current.notes.push(clean(line.replace(/^>\s?/u, ""))); continue; }
    const bullet = clean(line.replace(/^([-*+]|\d+[.)])\s+/u, "").replace(/^\[[ xX]\]\s+/u, ""));
    if (!bullet) continue;
    if (current.bullets.length >= 6 && !/^#{1,3}\s/u.test(raw)) { current = { title: "", bullets: [], notes: [] }; slides.push(current); }
    current.bullets.push(bullet.slice(0, 200));
  }
  const chosen = slides.filter(slide => slide.title || slide.bullets.length || slide.notes.length).slice(0, 40);
  if (!chosen.length) throw new PptError("ppt.invalid", "收到的内容里没有可以做成幻灯片的文字");
  return { title: (title || fallbackTitle || "未命名演示稿").slice(0, 80),
    slides: chosen.map(slide => ({ title: slide.title.slice(0, 80), bullets: slide.bullets.slice(0, 12), notes: slide.notes.join("\n").slice(0, 2000) })) };
}

export function createPptContentHandlers(withStore: <T>(run: (store: PptStore) => T) => T): ActionHandlerBinding[] {
  const project = (caller: ActionCallContext) => { if (!caller.project_id) throw new PptError("ppt.invalid", "缺少项目"); return caller.project_id; };
  return bindWorkflowContentHandlers(pptContentActions, {
    list: caller => withStore(store => store.list(project(caller)).map(deck => ({ item_id: deck.id, title: deck.title, caption: deck.slides.length + " 页", at: deck.updated_at }))),
    read: ({ item_id }, caller) => withStore(store => { const deck = store.get(item_id, project(caller)); return { title: deck.title, body: pptMarkdown(deck), source: "演示稿" }; }),
    receive: ({ payload, context }, caller) => withStore(store => {
      const outline = slidesFromMarkdown(payload.body, payload.title);
      const deck = store.receive(project(caller), workflowDeliveryKey(context), outline.title, outline.slides);
      return { plugin: "ppt", item_id: deck.id, title: deck.title };
    }),
    create: ({ title }, caller) => withStore(store => { const deck = store.create({ title, project_id: project(caller) }); return { plugin: "ppt", item_id: deck.id, title: deck.title }; }),
  });
}

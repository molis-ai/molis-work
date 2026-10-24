import { openGeneric } from "./dialog.js";
import { queueSave } from "./notes.js";
import { showNote } from "./page.js";
import { esc, uid } from "./util.js";
import type { JellyBlock, JellyBlockKind, JellyPage } from "./types.js";

type Span = NonNullable<JellyBlock["inline_spans"]>[number];
type Mark = Span["marks"][number];
const LINK = /^https?:\/\//i;
const BLOCKS = "[data-jelly-blocks]";
const FORMATS: readonly (readonly [JellyBlockKind, string])[] = [["paragraph", "jelly.block.paragraph"], ["heading1", "H1"], ["heading2", "H2"], ["heading3", "H3"], ["bullet", "jelly.block.bullet"], ["numbered", "jelly.block.numbered"], ["task", "jelly.kind.task"], ["quote", "jelly.block.quote"], ["code", "jelly.block.code"], ["link", "jelly.block.link"], ["divider", "jelly.block.divider"]];
const FORMAT_CHOICES: readonly (readonly [JellyBlockKind, string])[] = [["paragraph", "jelly.block.paragraph"], ["heading1", "jelly.block.heading1"], ["heading2", "jelly.block.heading2"], ["heading3", "jelly.block.heading3"], ["bullet", "jelly.block.bullet"], ["numbered", "jelly.block.numbered"], ["task", "jelly.kind.task"], ["quote", "jelly.block.quote"], ["code", "jelly.block.code"], ["link", "jelly.block.link"], ["divider", "jelly.block.divider"]];

export const newBlock = (kind: JellyBlockKind = "paragraph", text = ""): JellyBlock => ({ id: uid(), kind, text, indent: 0, completed_at: null, completion_description: "" });

export function inlineHtml(block: JellyBlock): string {
  const spans = block.inline_spans;
  if (!spans?.length || spans.map((span) => span.text).join("") !== block.text) return esc(block.text);
  return spans.map((span) => {
    let html = esc(span.text);
    for (const mark of span.marks || []) {
      if (mark === "bold") html = `<strong>${html}</strong>`;
      if (mark === "italic") html = `<em>${html}</em>`;
      if (mark === "code") html = `<code>${html}</code>`;
    }
    if (span.link_url && LINK.test(span.link_url)) html = `<a href="${esc(span.link_url)}" target="_blank" rel="noopener noreferrer">${html}</a>`;
    return html;
  }).join("");
}

export function blockHtml(page: JellyPage, block: JellyBlock, index: number): string {
  const { btn, tx } = page;
  const taskLink = page.ws().task_links.find((link) => link.note_id === page.selected?.id && link.block_id === block.id);
  const lead = block.kind === "task" ? `<input type="checkbox" class="mw-check" data-jelly-task-check="${esc(block.id)}" aria-label="${tx("jelly.block.complete-task")}" ${block.completed_at ? "checked" : ""}>`
    : block.kind === "bullet" ? '<span class="jelly-block-mark">•</span>' : block.kind === "numbered" ? `<span class="jelly-block-mark">${index + 1}.</span>` : "";
  const tools = btn("jelly.block.move-up", `data-jelly-block-up="${esc(block.id)}"`, "chevron-up") + btn("jelly.block.delete", `data-jelly-block-delete="${esc(block.id)}"`, "x")
    + (block.kind === "task" ? btn(taskLink ? "jelly.block.scheduled-view" : "jelly.block.schedule", `data-jelly-schedule-block="${esc(block.id)}" ${taskLink ? 'class="jelly-linked-task"' : ""}`, "calendar") : "");
  const text = block.kind === "divider" ? '<hr class="jelly-block-divider">'
    : `<div class="jelly-block-text" contenteditable="true" role="textbox" aria-multiline="true" data-jelly-block-text="${esc(block.id)}" data-placeholder="${tx("jelly.block.placeholder")}" spellcheck="true">${inlineHtml(block)}</div>`;
  return `<div class="jelly-block${block.completed_at ? " is-completed" : ""}" data-jelly-block="${esc(block.id)}" data-kind="${esc(block.kind)}" style="margin-left:${Math.min(8, block.indent || 0) * 18}px">${lead}${text}<div class="jelly-block-tools">${tools}</div></div>`;
}

export const renderBlocks = (page: JellyPage): void => {
  page.$(BLOCKS).innerHTML = page.draftBlocks.map((block, index) => blockHtml(page, block, index)).join("");
};

export function formatBar(page: JellyPage): string {
  const { btn } = page;
  return `<div class="jelly-format-bar" role="toolbar" aria-label="${page.tx("jelly.format.label")}">${FORMATS.map(([kind, label]) => btn(label, `data-jelly-format="${kind}"`)).join("")}`
    + `${btn("jelly.format.bold", 'data-jelly-inline="bold"')}${btn("jelly.format.italic", 'data-jelly-inline="italic"')}${btn("jelly.format.code", 'data-jelly-inline="code"')}${btn("jelly.format.link", 'data-jelly-inline="link"')}</div>`;
}

function readInline(element: HTMLElement): { text: string; inline_spans: Span[] } {
  const spans: Span[] = [];
  const visit = (node: Node, marks: Mark[] = [], url?: string): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) spans.push({ text: node.textContent, marks: [...marks], ...(url ? { link_url: url } : {}) });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") { spans.push({ text: "\n", marks: [...marks] }); return; }
    const next = [...marks];
    if (tag === "strong" || tag === "b") next.push("bold");
    if (tag === "em" || tag === "i") next.push("italic");
    if (tag === "code") next.push("code");
    const href = tag === "a" && LINK.test(el.getAttribute("href") || "") ? el.getAttribute("href") ?? undefined : url;
    [...el.childNodes].forEach((child) => visit(child, [...new Set(next)], href));
    if ((tag === "div" || tag === "p") && el !== element && el.nextSibling) spans.push({ text: "\n", marks: [] });
  };
  visit(element);
  const merged: Span[] = [];
  for (const span of spans) {
    const prior = merged.at(-1);
    if (prior && JSON.stringify(prior.marks) === JSON.stringify(span.marks) && prior.link_url === span.link_url) prior.text += span.text;
    else merged.push(span);
  }
  return { text: merged.map((span) => span.text).join(""), inline_spans: merged };
}

export const collectBlocks = (page: JellyPage): JellyBlock[] => page.draftBlocks.map((block) => {
  const textEl = page.root.querySelector<HTMLElement>(`[data-jelly-block-text="${CSS.escape(block.id)}"]`);
  return textEl ? { ...block, ...readInline(textEl) } : block;
});

export const readDraft = (page: JellyPage): { title: string; blocks: JellyBlock[] } => ({ title: page.$<HTMLInputElement>("[data-jelly-record-title]").value, blocks: collectBlocks(page) });

export function focusBlock(page: JellyPage, id: string, end = true): void {
  const element = page.root.querySelector<HTMLElement>(`[data-jelly-block-text="${CSS.escape(id)}"]`);
  if (!element) return;
  element.focus();
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(!end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  page.focusedBlock = id;
}

export function insertBlock(page: JellyPage, afterId: string | undefined, kind: JellyBlockKind = "paragraph", text = ""): void {
  page.draftBlocks = collectBlocks(page);
  const block = newBlock(kind, text);
  const index = page.draftBlocks.findIndex((entry) => entry.id === afterId);
  page.draftBlocks.splice(index < 0 ? page.draftBlocks.length : index + 1, 0, block);
  renderBlocks(page);
  focusBlock(page, block.id, false);
  queueSave(page);
}

const selectedBlock = (page: JellyPage): JellyBlock | undefined => page.draftBlocks.find((entry) => entry.id === page.focusedBlock) || page.draftBlocks.at(-1);
export const hasTaskLink = (page: JellyPage, blockId: string): boolean => page.ws().task_links.some((entry) => entry.note_id === page.selected?.id && entry.block_id === blockId);

export function changeBlockKind(page: JellyPage, kind: JellyBlockKind): void {
  page.draftBlocks = collectBlocks(page);
  const block = selectedBlock(page);
  if (!block) return;
  if (block.kind === "task" && kind !== "task" && hasTaskLink(page, block.id)) { showNote(page, page.L("jelly.block.unlink-first-convert"), true); return; }
  block.kind = kind;
  renderBlocks(page);
  if (kind === "divider") insertBlock(page, block.id); else focusBlock(page, block.id);
  queueSave(page);
}

export function openBlockFormat(page: JellyPage, id: string): void {
  page.focusedBlock = id;
  openGeneric(page, "jelly.format.title", `<div class="jelly-choice-row">${FORMAT_CHOICES.map(([kind, label]) => page.btn(label, `data-jelly-choose-format="${kind}"`)).join("")}</div>`, "", null);
}

export const rangesForSelection = (page: JellyPage, range: Range): { node: HTMLElement; range: Range }[] =>
  page.$$("[data-jelly-block-text]").filter((node) => range.intersectsNode(node)).map((node) => {
    const part = document.createRange();
    part.selectNodeContents(node);
    if (node.contains(range.startContainer)) part.setStart(range.startContainer, range.startOffset);
    if (node.contains(range.endContainer)) part.setEnd(range.endContainer, range.endOffset);
    return { node, range: part };
  }).filter((entry) => !entry.range.collapsed);

const wrapperFor = (kind: string, href?: string): HTMLElement => {
  const element = document.createElement(kind === "bold" ? "strong" : kind === "italic" ? "em" : kind === "code" ? "code" : "a");
  if (kind === "link" && element instanceof HTMLAnchorElement) {
    element.href = href ?? "";
    element.target = "_blank";
    element.rel = "noopener noreferrer";
  }
  return element;
};

export function applyInline(page: JellyPage, kind: string, href?: string): void {
  const last = page.lastRange;
  if (!last || last.collapsed) { showNote(page, page.L("jelly.format.select-first")); return; }
  if (!page.documentEl.contains(last.commonAncestorContainer)) return;
  const badLink = kind === "link" && !LINK.test(href || "");
  const ranges = rangesForSelection(page, last);
  if (ranges.length > 1) {
    if (badLink) throw new Error(page.L("jelly.format.link-scheme"));
    for (const entry of [...ranges].reverse()) {
      const wrap = wrapperFor(kind, href);
      wrap.appendChild(entry.range.extractContents());
      entry.range.insertNode(wrap);
    }
    window.getSelection()?.removeAllRanges();
    page.lastRange = null;
    queueSave(page);
    return;
  }
  const range = last.cloneRange();
  if (badLink) throw new Error(page.L("jelly.format.link-scheme"));
  const element = wrapperFor(kind, href);
  element.appendChild(range.extractContents());
  range.insertNode(element);
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  page.lastRange = range.cloneRange();
  queueSave(page);
}

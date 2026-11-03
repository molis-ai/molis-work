import { applyInline, collectBlocks, hasTaskLink, insertBlock, focusBlock, openBlockFormat, renderBlocks } from "./blocks.js";
import { completeTaskBlock, importNoteFile } from "./note-actions.js";
import { queueSave } from "./notes.js";
import { run, showNote } from "./page.js";
import { above } from "./dom.js";
import type { JellyBlock, JellyPage } from "./types.js";

const LIST_KINDS = new Set(["bullet", "numbered", "task"]);

function indentBlock(page: JellyPage, textEl: HTMLElement, id: string, outdent: boolean): void {
  page.draftBlocks = collectBlocks(page);
  const current = page.draftBlocks.find((entry) => entry.id === id);
  if (!current) return;
  current.indent = Math.max(0, Math.min(8, current.indent + (outdent ? -1 : 1)));
  const row = textEl.closest<HTMLElement>("[data-jelly-block]");
  if (row) row.style.marginLeft = `${current.indent * 18}px`;
  queueSave(page);
}

/** Enter splits the block at the caret; a list block continues the list. */
function splitBlock(page: JellyPage, textEl: HTMLElement, block: JellyBlock): void {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  let tail = "";
  if (range && textEl.contains(range.startContainer)) {
    range.deleteContents();
    const trailing = range.cloneRange();
    trailing.selectNodeContents(textEl);
    trailing.setStart(range.startContainer, range.startOffset);
    tail = trailing.toString();
    trailing.deleteContents();
  }
  insertBlock(page, block.id, LIST_KINDS.has(block.kind) ? block.kind : "paragraph", tail);
}

/** Backspace at the very start joins the block to the one above (unless a calendar task hangs on it). */
function mergeBackward(page: JellyPage, textEl: HTMLElement, id: string, event: KeyboardEvent): void {
  const selection = window.getSelection();
  if (!selection?.isCollapsed || !selection.anchorNode) return;
  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(textEl);
  range.setEnd(selection.anchorNode, selection.anchorOffset);
  const index = page.draftBlocks.findIndex((entry) => entry.id === id);
  if (range.toString().length !== 0 || index <= 0) return;
  event.preventDefault();
  if (hasTaskLink(page, id)) { showNote(page, page.L("jelly.block.unlink-first-delete"), true); return; }
  page.draftBlocks = collectBlocks(page);
  const prior = page.draftBlocks[index - 1];
  const current = page.draftBlocks[index];
  if (!prior || !current) return;
  prior.text += current.text;
  delete prior.inline_spans;
  page.draftBlocks.splice(index, 1);
  renderBlocks(page);
  focusBlock(page, prior.id);
  queueSave(page);
}

function onKeydown(page: JellyPage, event: KeyboardEvent): void {
  const textEl = above(event, "[data-jelly-block-text]");
  if (!textEl || page.composing || event.isComposing) return;
  const id = textEl.dataset.jellyBlockText ?? "";
  const block = page.draftBlocks.find((entry) => entry.id === id);
  const key = event.key.toLowerCase();
  if ((event.metaKey || event.ctrlKey) && (key === "b" || key === "i")) { event.preventDefault(); applyInline(page, key === "b" ? "bold" : "italic"); return; }
  if (event.key === "Tab") { event.preventDefault(); indentBlock(page, textEl, id, event.shiftKey); return; }
  if (event.key === "Enter" && !event.shiftKey && block && block.kind !== "code") { event.preventDefault(); splitBlock(page, textEl, block); return; }
  if (event.key === "Backspace") mergeBackward(page, textEl, id, event);
  if (event.key === "/" && (textEl.textContent ?? "").trim() === "") { event.preventDefault(); openBlockFormat(page, id); }
}

/** Pasted text goes in as plain text, wherever the caret is in the block. */
function onPaste(page: JellyPage, event: ClipboardEvent): void {
  if (!above(event, "[data-jelly-block-text]")) return;
  event.preventDefault();
  const text = event.clipboardData?.getData("text/plain") ?? "";
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  queueSave(page);
}

function trackSelection(page: JellyPage): void {
  const selection = window.getSelection();
  const anchor = selection?.anchorNode;
  if (!selection?.rangeCount || !anchor || !page.documentEl.contains(anchor)) return;
  page.lastRange = selection.getRangeAt(0).cloneRange();
  const element = anchor.nodeType === Node.ELEMENT_NODE ? anchor as Element : anchor.parentElement;
  const block = element?.closest<HTMLElement>("[data-jelly-block-text]");
  if (block) page.focusedBlock = block.dataset.jellyBlockText ?? "";
}

/** Typing, composing, the caret and the keyboard in the note's document, plus the "import into this note" file input. */
export function installNoteEvents(page: JellyPage): void {
  const doc = page.documentEl;
  doc.addEventListener("input", (event) => { if (above(event, "[data-jelly-record-title],[data-jelly-block-text]")) queueSave(page); });
  doc.addEventListener("compositionstart", () => { page.composing = true; clearTimeout(page.saveTimer); });
  doc.addEventListener("compositionend", () => { page.composing = false; if (page.dirty) queueSave(page); });
  doc.addEventListener("focusin", (event) => {
    const block = above(event, "[data-jelly-block-text]");
    if (block) page.focusedBlock = block.dataset.jellyBlockText ?? "";
  });
  document.addEventListener("selectionchange", () => trackSelection(page));
  doc.addEventListener("mousedown", (event) => { if (above(event, "[data-jelly-format],[data-jelly-inline]")) event.preventDefault(); });
  doc.addEventListener("keydown", (event) => onKeydown(page, event));
  doc.addEventListener("paste", (event) => onPaste(page, event));
  doc.addEventListener("change", (event) => {
    const checkbox = above<HTMLInputElement>(event, "[data-jelly-task-check]");
    if (checkbox) completeTaskBlock(page, checkbox);
  });
  const file = page.$<HTMLInputElement>("[data-jelly-note-file]");
  file.addEventListener("change", () => {
    const chosen = file.files?.[0];
    file.value = "";
    void run(page, () => importNoteFile(page, chosen));
  });
}

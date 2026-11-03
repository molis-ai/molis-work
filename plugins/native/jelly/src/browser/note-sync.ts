import { inlineHtml } from "./blocks.js";
import { recordFor } from "./notes.js";
import { esc, dateLabel } from "./util.js";
import type { JellyPage } from "./types.js";

export function renderBacklinks(page: JellyPage): void {
  const target = page.root.querySelector("[data-jelly-backlinks]");
  if (!target || !page.selected) return;
  const state = page.ws();
  const { btn, tx } = page;
  const id = page.selected.id;
  const relations = state.relations.filter((entry) => entry.note_id === id);
  const links = state.task_links.filter((entry) => entry.note_id === id);
  if (!relations.length && !links.length) { target.innerHTML = ""; return; }
  const related = relations.map((relation) => {
    const item = state.items.find((entry) => entry.id === relation.owner_id) || state.series.find((entry) => entry.id === relation.owner_id);
    return item ? btn(item.title, `data-jelly-open-linked-item="${esc(item.id)}"`, "calendar") : "";
  }).join("");
  const tasks = links.map((link) => {
    const item = state.items.find((entry) => entry.id === link.item_id);
    return item ? btn(`${item.title} · ${dateLabel(item.start_date, true)}`, `data-jelly-open-linked-item="${esc(item.id)}"`, "check") + btn("jelly.relation.unlink-task", `data-jelly-unlink-task="${esc(link.block_id)}"`, "link") : "";
  }).join("");
  target.innerHTML = `<p class="jelly-muted">${tx("jelly.relation.items")}</p>${related}${tasks}`;
}

/** After a command changed task blocks: the open editor takes their completion (and text, when nothing is unsaved) from the stored note. */
export function syncTaskIndicators(page: JellyPage): void {
  if (page.selected?.kind !== "note") return;
  const note = recordFor(page, "note", page.selected.id);
  if (!note) return;
  page.editorRevision = note.revision;
  for (const block of page.draftBlocks) {
    const stored = note.blocks.find((entry) => entry.id === block.id);
    if (!stored) continue;
    block.completed_at = stored.completed_at;
    block.completion_description = stored.completion_description;
    const key = CSS.escape(block.id);
    if (!page.dirty && stored.text !== block.text) {
      block.text = stored.text;
      block.inline_spans = stored.inline_spans;
      const text = page.root.querySelector(`[data-jelly-block-text="${key}"]`);
      if (text) text.innerHTML = inlineHtml(stored);
    }
    const checkbox = page.root.querySelector<HTMLInputElement>(`[data-jelly-task-check="${key}"]`);
    if (checkbox) checkbox.checked = Boolean(stored.completed_at);
    page.root.querySelector(`[data-jelly-block="${key}"]`)?.classList.toggle("is-completed", Boolean(stored.completed_at));
  }
  renderBacklinks(page);
}

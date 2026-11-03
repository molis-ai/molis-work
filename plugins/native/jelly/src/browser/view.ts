import { renderCalendar } from "./calendar.js";
import { flushEditor, renderRecords } from "./notes.js";
import { renderProgress } from "./progress.js";
import { closeWorkspace } from "./page.js";
import { esc } from "./util.js";
import type { JellyPage, View } from "./types.js";

export function renderFilters(page: JellyPage): void {
  const { $, $$, L, btn, state } = page;
  if (!state) return;
  const filters = btn("jelly.filter.all", `data-jelly-filter="" aria-pressed="${!page.filterCategory}"`)
    + state.categories.map((entry) => `<button type="button" class="mw-btn mw-btn--ghost" data-jelly-filter="${esc(entry.id)}" aria-pressed="${entry.id === page.filterCategory}">${page.categoryDot(entry.id)}${page.catName(entry)}</button>`).join("");
  $("[data-jelly-category-filters]").innerHTML = filters;
  const inCalendar = page.view === "calendar";
  $("[data-jelly-period]").hidden = !inCalendar && page.view !== "progress";
  $("[data-jelly-calendar-modes]").hidden = !inCalendar;
  $("[data-jelly-hide-completed]").hidden = !inCalendar;
  $("[data-jelly-archived]").hidden = inCalendar || page.view === "progress";
  $("[data-jelly-archived]").setAttribute("aria-pressed", String(page.archived));
  $("[data-jelly-hide-completed]").setAttribute("aria-pressed", String(page.hideCompleted));
  const create = $("[data-jelly-new]");
  create.hidden = page.view === "progress";
  const label = L(page.view === "notes" ? "jelly.note.new" : "jelly.item.new");
  const span = create.querySelector("span");
  if (span) span.textContent = label;
  create.setAttribute("aria-label", label);
  $$("[data-jelly-view]").forEach((node) => {
    if (node.dataset.jellyView === page.view) node.setAttribute("aria-current", "page"); else node.removeAttribute("aria-current");
  });
  $$("[data-jelly-mode]").forEach((node) => node.setAttribute("aria-pressed", String(node.dataset.jellyMode === page.mode)));
}

export async function renderView(page: JellyPage): Promise<void> {
  if (!page.state) return;
  renderFilters(page);
  if (page.view === "calendar") await renderCalendar(page);
  else if (page.view === "progress") await renderProgress(page);
  else renderRecords(page);
}

export async function switchView(page: JellyPage, next: View): Promise<void> {
  await flushEditor(page);
  closeWorkspace(page);
  page.view = next;
  page.archived = false;
  await renderView(page);
}

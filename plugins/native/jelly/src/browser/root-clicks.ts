import { handleCalendarClick } from "./calendar-clicks.js";
import { openCategories } from "./categories.js";
import { openItem } from "./item.js";
import { openModelSettings } from "./model.js";
import { handleContentClick } from "./note-clicks.js";
import { createNote, flushEditor, openRecord } from "./notes.js";
import { closeWorkspace, download, run, showNote } from "./page.js";
import { handlePlanClick } from "./plan.js";
import { API } from "./request.js";
import { renderView, switchView } from "./view.js";
import { addDays, civil, dayDate } from "./util.js";
import { command, loadList } from "./workspace.js";
import type { JellyPage, Mode, View } from "./types.js";

type Click = (page: JellyPage, target: HTMLElement) => void;
const data = (target: HTMLElement, name: string): string => target.getAttribute(name) ?? "";
const repaint = (page: JellyPage): void => { void run(page, () => renderView(page)); };
const task = (fn: (page: JellyPage, target: HTMLElement) => unknown): Click => (page, target) => { void run(page, () => fn(page, target)); };
const toggleMenu = (page: JellyPage, menu: string, target: HTMLElement): void => {
  const node = page.$(menu);
  node.hidden = !node.hidden;
  target.setAttribute("aria-expanded", String(!node.hidden));
};

function step(page: JellyPage, target: HTMLElement): void {
  const by = Number(data(target, "data-jelly-step"));
  if ((page.mode === "week" && page.view === "calendar") || (page.view === "progress" && page.reviewPeriod === "week")) page.anchor = addDays(page.anchor, by * 7);
  else {
    const date = dayDate(page.anchor);
    date.setDate(1);
    date.setMonth(date.getMonth() + by);
    page.anchor = civil(date);
  }
  repaint(page);
}

async function undoRedo(page: JellyPage, target: HTMLElement): Promise<void> {
  await flushEditor(page);
  await command(page, { type: target.hasAttribute("data-jelly-undo") ? "undo" : "redo" });
  if (page.selected) openRecord(page, page.selected.kind, page.selected.id);
  showNote(page, page.L("jelly.workspace.updated"));
}

async function exportWorkspace(page: JellyPage): Promise<void> {
  await flushEditor(page);
  const result = await page.request<{ workspace: unknown }>("GET", `${API}/export`);
  await download(page, `Jelly-${civil()}.json`, JSON.stringify(result.workspace, null, 2), "application/json");
  showNote(page, page.L("jelly.workspace.exported"));
}

const closeMenu = (page: JellyPage): void => { page.$("[data-jelly-menu]").hidden = true; };

const CORE: readonly (readonly [string, Click])[] = [
  ["[data-jelly-close-dialog]", (page, target) => page.$<HTMLDialogElement>(data(target, "data-jelly-close-dialog") === "item" ? "[data-jelly-item-dialog]" : "[data-jelly-dialog]").close()],
  ["[data-jelly-view]", task((page, target) => switchView(page, data(target, "data-jelly-view") as View))],
  ["[data-jelly-filter]", (page, target) => { page.filterCategory = data(target, "data-jelly-filter"); repaint(page); }],
  ["[data-jelly-new]", task(async (page) => { await flushEditor(page); if (page.view === "notes") await createNote(page); else openItem(page, null, page.anchor); })],
  ["[data-jelly-mode]", (page, target) => { page.mode = data(target, "data-jelly-mode") as Mode; repaint(page); }],
  ["[data-jelly-step]", step],
  ["[data-jelly-today]", (page) => { page.anchor = civil(); repaint(page); }],
  ["[data-jelly-hide-completed]", (page) => { page.hideCompleted = !page.hideCompleted; repaint(page); }],
  ["[data-jelly-archived]", task(async (page) => { page.archived = !page.archived; await flushEditor(page); closeWorkspace(page); await renderView(page); })],
  ["[data-jelly-more]", (page, target) => toggleMenu(page, "[data-jelly-menu]", target)],
  ["[data-jelly-editor-more]", (page, target) => toggleMenu(page, "[data-jelly-editor-menu]", target)],
  ["[data-jelly-undo],[data-jelly-redo]", task(undoRedo)],
  ["[data-jelly-categories]", task((page) => { closeMenu(page); return openCategories(page); })],
  ["[data-jelly-model]", task((page) => { closeMenu(page); return openModelSettings(page); })],
  ["[data-jelly-export]", task((page) => exportWorkspace(page))],
  ["[data-jelly-import]", (page) => { closeMenu(page); page.$("[data-jelly-import-file]").click(); }],
  ["[data-jelly-back]", task(async (page) => { await flushEditor(page); closeWorkspace(page); await loadList(page); })],
  ["[data-jelly-record]", task(async (page, target) => { await flushEditor(page); openRecord(page, "note", data(target, "data-jelly-record")); })],
  ["[data-jelly-retry]", task((page) => loadList(page))],
];

/** One listener on the page's root: the toolbar and list buttons answer here, everything else goes to the calendar, note and plan buttons. */
export function installRootClicks(page: JellyPage): void {
  page.root.addEventListener("click", (event) => {
    const origin = event.target as Element | null;
    const target = origin && "closest" in origin ? origin.closest<HTMLElement>("button,[data-jelly-view]") : null;
    if (!target) return;
    const core = CORE.find(([selector]) => target.matches(selector));
    if (core) { core[1](page, target); return; }
    handleCalendarClick(page, target);
    handleContentClick(page, target);
    handlePlanClick(page, target);
  });
}

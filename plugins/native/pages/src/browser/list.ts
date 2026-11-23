import { dateArg } from "@molis-ai/molis-work-plugin-sdk/ui";
import { chosen, paintPicked, reportFocus, togglePicked } from "./context.js";
import { ICON, make } from "./dom.js";
import { closeMove } from "./menus.js";
import type { PagesPage } from "./page.js";
import type { PagesRecord } from "./types.js";

const uiText = globalThis.t;

type ActiveCell = { readonly kind: "page" | "folder"; readonly id: string; readonly cell: number };
const activeCells = new WeakMap<PagesPage, ActiveCell>();

function formatTime(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return uiText.text("common.generated.formatted", { value: dateArg(date.toISOString(), sameYear ? "month-day" : "date") });
}

const fixedCell = (_page: PagesPage, record: PagesRecord) => {
  if (!record.publication_pending && !(record.artifact_version > 0)) return null;
  const node = make("span", "mw-status mw-status--plain mw-entry-status " + (record.publication_pending ? "mw-status--attention" : "mw-status--done"));
  node.dataset.mwState = record.publication_pending ? "unsaved" : "saved"; node.textContent = record.publication_pending ? uiText.text("pages.version.unfinished") : uiText.text("pages.version.pinned") + " v" + record.artifact_version;
  return node;
};

const actionCell = (button: HTMLButtonElement) => {
  const cell = make("span", "pages-row-act-cell");
  cell.setAttribute("role", "gridcell");
  cell.append(button);
  return cell;
};

const renderRow = (page: PagesPage, record: PagesRecord, level: 1 | 2) => {
  const { folders } = page;
  const item = make("article", "mw-stage-item pages-doc-row creative-artifact-row");
  item.setAttribute("role", "row");
  item.setAttribute("aria-level", String(level));
  item.setAttribute("aria-selected", String(chosen(page, record.id)));
  item.draggable = folders.length > 0;
  item.dataset.pageId = record.id;
  if (page.picked.has(record.id)) item.classList.add("is-picked");
  const primaryCell = make("span", "pages-doc-cell");
  primaryCell.setAttribute("role", "gridcell");
  const row = document.createElement("button");
  row.type = "button";
  row.tabIndex = -1;
  row.draggable = folders.length > 0;
  row.className = "mw-stage-entry directory-list-row" + (page.sel?.id === record.id ? " is-selected" : "");
  row.dataset.pageId = record.id;
  const leading = make("span", "mw-stage-leading");
  const mark = make("span", "pages-doc-mark");
  mark.setAttribute("aria-hidden", "true");
  mark.innerHTML = ICON("note");
  const title = document.createElement("strong");
  title.title = record.title;
  title.textContent = record.title;
  leading.append(mark, title);
  const meta = make("span", "plugin-stage-meta");
  meta.textContent = formatTime(record.updated_at);
  row.append(leading, meta);
  const fixed = fixedCell(page, record);
  if (fixed) row.append(fixed);
  primaryCell.append(row);
  const actions = make("span", "pages-row-actions");
  actions.setAttribute("role", "none");
  if (folders.length) {
    const move = document.createElement("button");
    move.type = "button";
    move.tabIndex = -1;
    move.className = "pages-row-act";
    move.dataset.pagesMove = record.id;
    move.setAttribute("aria-label", uiText.text("pages.folder.move"));
    move.setAttribute("title", uiText.text("pages.folder.move"));
    move.setAttribute("aria-haspopup", "true");
    move.setAttribute("aria-expanded", "false");
    move.innerHTML = ICON("folder");
    actions.append(actionCell(move));
  }
  const star = document.createElement("button");
  star.type = "button";
  star.tabIndex = -1;
  star.className = "pages-row-act pages-star" + (record.starred ? " is-on" : "");
  star.dataset.pagesStar = record.id;
  star.setAttribute("aria-label", record.starred ? uiText.text("pages.star.remove") : uiText.text("pages.star.add"));
  star.innerHTML = ICON("star");
  actions.append(actionCell(star));
  item.append(primaryCell, actions);
  return item;
};

const renderFold = (page: PagesPage, key: string, label: string, items: readonly PagesRecord[], open: boolean, actions?: HTMLElement) => {
  const fold = make("div", "goal-collection-fold pages-folder-group");
  fold.setAttribute("role", "rowgroup");
  fold.dataset.folderId = key;
  fold.dataset.folderOpen = String(open);
  if (key !== "starred") fold.dataset.pagesDrop = "folder";
  const header = make("div", "pages-folder-row");
  header.setAttribute("role", "row");
  header.setAttribute("aria-level", "1");
  header.setAttribute("aria-expanded", String(open));
  header.dataset.pagesFolderRow = key;
  const labelCell = make("span", "pages-folder-cell");
  labelCell.setAttribute("role", "gridcell");
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.tabIndex = -1;
  toggle.className = "pages-folder-toggle";
  toggle.dataset.pagesFolderToggle = key;
  const caret = make("span", "goal-collection-caret");
  caret.setAttribute("aria-hidden", "true");
  caret.innerHTML = ICON("chevron-down");
  const strong = document.createElement("strong");
  strong.textContent = label;
  const small = document.createElement("small");
  small.textContent = String(items.length);
  toggle.append(caret, strong, small);
  labelCell.append(toggle);
  header.append(labelCell);
  if (actions) header.append(actions);
  fold.append(header);
  if (!items.length) {
    const emptyRow = make("div", "pages-folder-empty-row");
    emptyRow.setAttribute("role", "row");
    emptyRow.setAttribute("aria-level", "2");
    emptyRow.hidden = !open;
    const vacant = make("span", "goal-collection-empty");
    vacant.setAttribute("role", "gridcell");
    vacant.textContent = uiText.text("pages.list.empty");
    emptyRow.append(vacant);
    fold.append(emptyRow);
  } else {
    items.forEach((record) => {
      const row = renderRow(page, record, 2);
      row.hidden = !open;
      fold.append(row);
    });
  }
  return fold;
};

const folderActions = (_page: PagesPage, folder: { readonly id: string }) => {
  const wrap = make("span", "pages-folder-actions");
  wrap.setAttribute("role", "none");
  const button = (dataset: "pagesFolderNew" | "pagesFolderRename" | "pagesFolderDelete", label: string, icon: string) => {
    const node = document.createElement("button");
    node.type = "button";
    node.tabIndex = -1;
    node.dataset[dataset] = folder.id;
    node.setAttribute("aria-label", label);
    node.innerHTML = ICON(icon);
    return actionCell(node);
  };
  wrap.append(button("pagesFolderNew", uiText.text("pages.folder.new-here"), "plus"), button("pagesFolderRename", uiText.text("pages.folder.rename"), "edit"), button("pagesFolderDelete", uiText.text("pages.folder.delete"), "x"));
  return wrap;
};

const rowButtons = (row: HTMLElement) => [...row.querySelectorAll<HTMLButtonElement>("button")].filter((node) => !node.disabled);

const visibleRows = (rowsEl: HTMLElement) =>
  [...rowsEl.querySelectorAll<HTMLElement>('[role="row"]')].filter((row) => !row.hidden && rowButtons(row).length > 0);

const cellDescriptor = (button: HTMLElement): ActiveCell | null => {
  const row = button.closest<HTMLElement>('[role="row"]');
  if (!row) return null;
  const cells = rowButtons(row);
  const cell = Math.max(0, cells.indexOf(button as HTMLButtonElement));
  if (row.dataset.pageId) return { kind: "page", id: row.dataset.pageId, cell };
  if (row.dataset.pagesFolderRow !== undefined) return { kind: "folder", id: row.dataset.pagesFolderRow, cell };
  return null;
};

const findCell = (rowsEl: HTMLElement, active: ActiveCell | undefined): HTMLButtonElement | null => {
  const rows = visibleRows(rowsEl);
  if (!rows.length) return null;
  if (active) {
    const match = rows.find((row) => (active.kind === "page" ? row.dataset.pageId === active.id : row.dataset.pagesFolderRow === active.id));
    if (match) {
      const cells = rowButtons(match);
      return cells[Math.min(active.cell, cells.length - 1)] || cells[0] || null;
    }
  }
  return rowButtons(rows[0]!)[0] || null;
};

export const syncTreegridTabStops = (page: PagesPage): HTMLButtonElement | null => {
  const all = [...page.rowsEl.querySelectorAll<HTMLButtonElement>("button")];
  if (!all.length) return null;
  const target = findCell(page.rowsEl, activeCells.get(page)) || all[0]!;
  all.forEach((button) => { button.tabIndex = button === target ? 0 : -1; });
  const descriptor = cellDescriptor(target);
  if (descriptor) activeCells.set(page, descriptor);
  return target;
};

const focusCell = (page: PagesPage, button: HTMLButtonElement | undefined | null) => {
  if (!button) return;
  const descriptor = cellDescriptor(button);
  if (descriptor) activeCells.set(page, descriptor);
  syncTreegridTabStops(page);
  button.focus();
};

export const setFolderOpen = (page: PagesPage, fold: HTMLElement, open: boolean) => {
  fold.dataset.folderOpen = String(open);
  fold.querySelector<HTMLElement>("[data-pages-folder-row]")?.setAttribute("aria-expanded", String(open));
  fold.querySelectorAll<HTMLElement>('[role="row"][aria-level="2"]').forEach((child) => { child.hidden = !open; });
  syncTreegridTabStops(page);
};

export const toggleFolder = (page: PagesPage, key: string) => {
  const fold = [...page.rowsEl.querySelectorAll<HTMLElement>("[data-folder-id]")].find((node) => (node.dataset.folderId ?? "") === key);
  if (!fold) return;
  setFolderOpen(page, fold, fold.dataset.folderOpen !== "true");
};

/** Composite treegrid keyboard navigation: arrows move across rows/cells and expand/collapse folders; Space picks documents; Tab enters and leaves once. */
export const bindListKeyboard = (page: PagesPage) => {
  page.rowsEl.addEventListener("focusin", (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
    if (!button || !page.rowsEl.contains(button)) return;
    const descriptor = cellDescriptor(button);
    if (descriptor) activeCells.set(page, descriptor);
    syncTreegridTabStops(page);
  });
  page.rowsEl.addEventListener("keydown", (event) => {
    if (event.altKey) return;
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
    const row = button?.closest<HTMLElement>('[role="row"]');
    if (!button || !row || !page.rowsEl.contains(row)) return;
    const rows = visibleRows(page.rowsEl);
    const rowIndex = rows.indexOf(row);
    const cells = rowButtons(row);
    const cellIndex = cells.indexOf(button);
    if (rowIndex < 0 || cellIndex < 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = rows[Math.min(rowIndex + 1, rows.length - 1)];
      if (next) {
        const nextCells = rowButtons(next);
        focusCell(page, nextCells[Math.min(cellIndex, nextCells.length - 1)] || nextCells[0]);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const prev = rows[Math.max(rowIndex - 1, 0)];
      if (prev) {
        const prevCells = rowButtons(prev);
        focusCell(page, prevCells[Math.min(cellIndex, prevCells.length - 1)] || prevCells[0]);
      }
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      const expanded = row.getAttribute("aria-expanded");
      if (cellIndex === 0 && expanded === "false") {
        const fold = row.closest<HTMLElement>("[data-folder-id]");
        if (fold) setFolderOpen(page, fold, true);
        return;
      }
      if (cellIndex < cells.length - 1) {
        focusCell(page, cells[cellIndex + 1]);
        return;
      }
      if (cellIndex === 0 && expanded === "true") {
        const next = rows[rowIndex + 1];
        if (next && next.getAttribute("aria-level") === "2") focusCell(page, rowButtons(next)[0]);
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (cellIndex > 0) {
        focusCell(page, cells[cellIndex - 1]);
        return;
      }
      if (row.getAttribute("aria-expanded") === "true") {
        const fold = row.closest<HTMLElement>("[data-folder-id]");
        if (fold) setFolderOpen(page, fold, false);
        return;
      }
      if (row.getAttribute("aria-level") === "2") {
        const toggle = row.closest<HTMLElement>("[data-folder-id]")?.querySelector<HTMLButtonElement>("[data-pages-folder-toggle]");
        if (toggle) focusCell(page, toggle);
      }
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusCell(page, event.ctrlKey || event.metaKey || cellIndex === 0 ? rowButtons(rows[0]!)[0] : cells[0]);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusCell(page, event.ctrlKey || event.metaKey || cellIndex === cells.length - 1 ? rowButtons(rows[rows.length - 1]!)[0] : cells[cells.length - 1]);
      return;
    }
    if ((event.key === " " || event.code === "Space") && button.dataset.pageId) {
      event.preventDefault();
      togglePicked(page, button.dataset.pageId);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      visibleRecords(page).forEach((record) => page.picked.add(record.id));
      paintPicked(page);
      reportFocus(page);
    }
  });
};

/** The records the search box lets through. */
export const visibleRecords = (page: PagesPage) => {
  const needle = page.query.trim().toLowerCase();
  if (!needle) return page.records;
  return page.records.filter((record) => String(record.title || "").toLowerCase().includes(needle));
};

export const renderList = (page: PagesPage) => {
  const top = page.list?.scrollTop || 0;
  paintList(page);
  if (page.list) page.list.scrollTop = top;
};

const paintList = (page: PagesPage) => {
  const { rowsEl, empty, searchEmpty } = page;
  const hadFocus = rowsEl.contains(document.activeElement);
  closeMove(page);
  const shown = visibleRecords(page);
  const searching = Boolean(page.query.trim());
  empty.hidden = page.records.length > 0 || searching || page.folders.length > 0;
  searchEmpty.hidden = !(searching && shown.length === 0);
  const closed = new Set([...rowsEl.querySelectorAll<HTMLElement>('[data-folder-id][data-folder-open="false"]')].map((node) => node.dataset.folderId ?? ""));
  rowsEl.replaceChildren();
  const grouped = page.folders.length > 0 || page.records.some((record) => record.starred);
  if (searching || !grouped) {
    shown.forEach((record) => rowsEl.append(renderRow(page, record, 1)));
  } else {
    const starred = shown.filter((record) => record.starred);
    if (starred.length) rowsEl.append(renderFold(page, "starred", uiText.text("pages.star.add"), starred, !closed.has("starred")));
    page.folders.forEach((folder) => {
      const items = shown.filter((record) => record.folder_id === folder.id);
      rowsEl.append(renderFold(page, folder.id, folder.title, items, !closed.has(folder.id), folderActions(page, folder)));
    });
    const unfiled = shown.filter((record) => !record.folder_id);
    if (unfiled.length) rowsEl.append(renderFold(page, "", uiText.text("pages.folder.unfiled"), unfiled, !closed.has("")));
  }
  const active = syncTreegridTabStops(page);
  if (hadFocus && active) active.focus();
};

/** The list could not be read: an error box with a retry in its place. */
export function listFailed(page: PagesPage, error: { message?: string } | null | undefined, loadList: () => Promise<void>): void {
  const { empty, rowsEl } = page;
  empty.hidden = true;
  const box = document.createElement("div");
  box.className = "mw-empty mw-empty--error";
  box.setAttribute("role", "alert");
  box.innerHTML = `<span class="mw-empty__mark">${ICON("circle-alert")}</span><strong></strong><p></p><button class="mw-btn mw-btn--secondary" type="button"></button>`;
  const text = box.querySelector("p")!, retry = box.querySelector("button")!;
  box.querySelector("strong")!.textContent = uiText.text("pages.list.unreadable");
  text.textContent = error?.message || uiText.text("pages.list.try-later");
  retry.textContent = uiText.text("pages.action.retry");
  retry.addEventListener("click", () => {
    retry.disabled = true;
    void loadList().then(() => box.remove(), (next: { message?: string } | null) => {
      retry.disabled = false;
      text.textContent = next?.message || uiText.text("pages.list.try-later");
    });
  });
  rowsEl.replaceChildren(box);
}

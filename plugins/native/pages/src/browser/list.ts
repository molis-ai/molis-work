import { dateArg } from "@molis-ai/molis-work-plugin-sdk/ui";
import { chosen, paintPicked, reportFocus, togglePicked } from "./context.js";
import { ICON, make } from "./dom.js";
import { closeMove } from "./menus.js";
import type { PagesPage } from "./page.js";
import type { PagesRecord } from "./types.js";

const uiText = globalThis.t;

type ActiveCell = {
  readonly kind: "page" | "folder";
  readonly id: string;
  readonly group: string | undefined;
  readonly action: string | undefined;
  readonly column: number;
};
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
  toggle.setAttribute("aria-expanded", String(open));
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

const rowButtons = (row: HTMLElement) => [...row.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];

const visibleRows = (rowsEl: HTMLElement) =>
  [...rowsEl.querySelectorAll<HTMLElement>('[role="row"]:not([hidden]):is([data-page-id], [data-pages-folder-row])')];

const groupOf = (row: HTMLElement) => row.closest<HTMLElement>("[data-folder-id]")?.dataset.folderId;

const cellDescriptor = (button: HTMLButtonElement): ActiveCell | null => {
  const row = button.closest<HTMLElement>('[role="row"]');
  if (!row) return null;
  const column = rowButtons(row).indexOf(button);
  const action = Object.keys(button.dataset).find((key) => key === "pageId" || key.startsWith("pages"));
  const id = row.dataset.pageId ?? row.dataset.pagesFolderRow;
  if (id === undefined) return null;
  return { kind: row.dataset.pageId ? "page" : "folder", id, group: groupOf(row), action, column };
};

const buttonInColumn = (row: HTMLElement | undefined, column: number, action?: string): HTMLButtonElement | undefined => {
  if (!row) return;
  const cells = rowButtons(row);
  return (action ? cells.find((cell) => Object.hasOwn(cell.dataset, action)) : undefined) ?? cells[column] ?? cells.at(-1);
};

const setTabStop = (page: PagesPage, button: HTMLButtonElement) => {
  const previous = page.rowsEl.querySelector<HTMLButtonElement>('button[tabindex="0"]');
  if (previous === button) return;
  if (previous) previous.tabIndex = -1;
  button.tabIndex = 0;
  const descriptor = cellDescriptor(button);
  if (descriptor) activeCells.set(page, descriptor);
};

const restoreTabStop = (page: PagesPage): HTMLButtonElement | undefined => {
  const rows = visibleRows(page.rowsEl);
  const active = activeCells.get(page);
  const matching = active
    ? rows.filter((row) => (active.kind === "page" ? row.dataset.pageId : row.dataset.pagesFolderRow) === active.id)
    : [];
  // A starred document may appear twice. The action also has to survive a Move button being inserted or removed.
  const row = matching.find((candidate) => groupOf(candidate) === active?.group) ?? matching[0];
  const button = buttonInColumn(row, active?.column ?? 0, active?.action) ?? buttonInColumn(rows[0], 0);
  if (!button) return;
  setTabStop(page, button);
  return button;
};

const setFolderOpen = (page: PagesPage, fold: HTMLElement, open: boolean) => {
  const header = fold.querySelector<HTMLElement>("[data-pages-folder-row]");
  const toggle = header?.querySelector<HTMLButtonElement>("[data-pages-folder-toggle]");
  const stop = fold.querySelector<HTMLButtonElement>('button[tabindex="0"]');
  if (!open && toggle && stop && !header?.contains(stop)) {
    setTabStop(page, toggle);
    if (document.activeElement === stop) toggle.focus();
  }
  fold.dataset.folderOpen = String(open);
  header?.setAttribute("aria-expanded", String(open));
  toggle?.setAttribute("aria-expanded", String(open));
  fold.querySelectorAll<HTMLElement>('[role="row"][aria-level="2"]').forEach((child) => { child.hidden = !open; });
  if (page.picked.size > 1) reportFocus(page);
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
    if (button?.closest('[role="row"]')) setTabStop(page, button);
  });
  page.rowsEl.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.isComposing || event.altKey) return;
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
    const row = button?.closest<HTMLElement>('[role="row"]');
    if (!button || !row) return;
    const key = event.key;
    if ((key === " " || event.code === "Space") && button.dataset.pageId) {
      event.preventDefault();
      if (!event.repeat) togglePicked(page, button.dataset.pageId);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === "a") {
      event.preventDefault();
      for (const visible of visibleRows(page.rowsEl)) {
        if (visible.dataset.pageId) page.picked.add(visible.dataset.pageId);
      }
      paintPicked(page);
      reportFocus(page);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Home", "End"].includes(key)) return;
    const rows = visibleRows(page.rowsEl);
    const rowIndex = rows.indexOf(row);
    const cells = rowButtons(row);
    const column = cells.indexOf(button);
    if (rowIndex < 0 || column < 0) return;
    event.preventDefault();
    if (key === "ArrowDown" || key === "ArrowUp") {
      const next = rows[rowIndex + (key === "ArrowDown" ? 1 : -1)];
      buttonInColumn(next, column)?.focus();
      return;
    }
    if (key === "ArrowRight") {
      const expanded = row.getAttribute("aria-expanded");
      if (column === 0 && expanded === "false") {
        const fold = row.closest<HTMLElement>("[data-folder-id]");
        if (fold) setFolderOpen(page, fold, true);
        return;
      }
      if (column < cells.length - 1) {
        cells[column + 1]?.focus();
        return;
      }
      if (column === 0 && expanded === "true") {
        const next = rows[rowIndex + 1];
        if (next?.closest("[data-folder-id]") === row.closest("[data-folder-id]")) buttonInColumn(next, 0)?.focus();
      }
      return;
    }
    if (key === "ArrowLeft") {
      if (column > 0) {
        cells[column - 1]?.focus();
        return;
      }
      if (row.getAttribute("aria-expanded") === "true") {
        const fold = row.closest<HTMLElement>("[data-folder-id]");
        if (fold) setFolderOpen(page, fold, false);
        return;
      }
      if (row.getAttribute("aria-level") === "2") {
        const toggle = row.closest<HTMLElement>("[data-folder-id]")?.querySelector<HTMLButtonElement>("[data-pages-folder-toggle]");
        toggle?.focus();
      }
      return;
    }
    const edge = key === "Home" ? 0 : -1;
    if (event.ctrlKey || event.metaKey) buttonInColumn(rows.at(edge), column)?.focus();
    else cells.at(edge)?.focus();
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
  const focus = paintList(page);
  if (page.list) page.list.scrollTop = top;
  focus?.focus();
};

const paintList = (page: PagesPage) => {
  const { rowsEl, empty, searchEmpty } = page;
  closeMove(page);
  const hadFocus = rowsEl.contains(document.activeElement);
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
  const button = restoreTabStop(page);
  return hadFocus ? button : undefined;
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

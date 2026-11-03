import { chosen } from "./context.js";
import { ICON, formatTime, make } from "./dom.js";
import { closeMove } from "./menus.js";
import type { PagesPage } from "./page.js";
import type { PagesRecord } from "./types.js";

const fixedCell = (page: PagesPage, record: PagesRecord) => {
  const { L } = page;
  if (!record.publication_pending && !(record.artifact_version > 0)) return null;
  const node = make("span", "mw-status mw-status--plain feed-entry-status " + (record.publication_pending ? "mw-status--attention" : "mw-status--done"));
  node.dataset.mwState = record.publication_pending ? "unsaved" : "saved"; node.textContent = record.publication_pending ? L("pages.version.unfinished") : L("pages.version.pinned") + " v" + record.artifact_version;
  return node;
};

const renderRow = (page: PagesPage, record: PagesRecord) => {
  const { L, folders } = page;
  const item = make("article", "feed-stage-item pages-doc-row creative-artifact-row");
  item.setAttribute("role", "none");
  item.draggable = folders.length > 0;
  item.dataset.pageId = record.id;
  const row = document.createElement("button");
  row.type = "button";
  row.draggable = folders.length > 0;
  row.className = "feed-stage-entry directory-list-row" + (page.sel?.id === record.id ? " is-selected" : "");
  row.dataset.pageId = record.id;
  row.setAttribute("role", "option");
  row.setAttribute("aria-selected", String(chosen(page, record.id)));
  if (page.picked.has(record.id)) item.classList.add("is-picked");
  const leading = make("span", "feed-stage-leading");
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
  const actions = make("span", "pages-row-actions");
  if (folders.length) {
    const move = document.createElement("button");
    move.type = "button";
    move.className = "pages-row-act";
    move.dataset.pagesMove = record.id;
    move.setAttribute("aria-label", L("pages.folder.move"));
    move.setAttribute("title", L("pages.folder.move"));
    move.setAttribute("aria-haspopup", "true");
    move.setAttribute("aria-expanded", "false");
    move.innerHTML = ICON("folder");
    actions.append(move);
  }
  const star = document.createElement("button");
  star.type = "button";
  star.className = "pages-row-act pages-star" + (record.starred ? " is-on" : "");
  star.dataset.pagesStar = record.id;
  star.setAttribute("aria-label", record.starred ? L("pages.star.remove") : L("pages.star.add"));
  star.innerHTML = ICON("star");
  actions.append(star);
  item.append(row, actions);
  return item;
};

const renderFold = (page: PagesPage, key: string, label: string, items: readonly PagesRecord[], actions?: HTMLElement) => {
  const fold = make("details", "goal-collection-fold");
  fold.open = true;
  fold.dataset.folderId = key;
  const summary = document.createElement("summary");
  const caret = make("span", "goal-collection-caret");
  caret.setAttribute("aria-hidden", "true");
  caret.innerHTML = ICON("chevron-down");
  const strong = document.createElement("strong");
  strong.textContent = label;
  const small = document.createElement("small");
  small.textContent = String(items.length);
  summary.append(caret, strong, small);
  if (actions) summary.append(actions);
  if (key !== "starred") fold.dataset.pagesDrop = "folder";
  fold.append(summary);
  if (!items.length) {
    const vacant = make("p", "goal-collection-empty");
    vacant.textContent = page.L("pages.list.empty");
    fold.append(vacant);
  } else items.forEach((record) => fold.append(renderRow(page, record)));
  return fold;
};

const folderActions = (page: PagesPage, folder: { readonly id: string }) => {
  const { L } = page;
  const wrap = make("span", "pages-folder-actions");
  const button = (dataset: "pagesFolderNew" | "pagesFolderRename" | "pagesFolderDelete", label: string, icon: string) => {
    const node = document.createElement("button");
    node.type = "button";
    node.dataset[dataset] = folder.id;
    node.setAttribute("aria-label", label);
    node.innerHTML = ICON(icon);
    return node;
  };
  wrap.append(button("pagesFolderNew", L("pages.folder.new-here"), "plus"), button("pagesFolderRename", L("pages.folder.rename"), "edit"), button("pagesFolderDelete", L("pages.folder.delete"), "x"));
  return wrap;
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
  const { L, rowsEl, empty, searchEmpty } = page;
  closeMove(page);
  const shown = visibleRecords(page);
  const searching = Boolean(page.query.trim());
  empty.hidden = page.records.length > 0 || searching || page.folders.length > 0;
  searchEmpty.hidden = !(searching && shown.length === 0);
  const open = new Set([...rowsEl.querySelectorAll<HTMLElement>("details[data-folder-id][open]")].map((node) => node.dataset.folderId));
  rowsEl.replaceChildren();
  const grouped = page.folders.length > 0 || page.records.some((record) => record.starred);
  if (searching || !grouped) {
    shown.forEach((record) => rowsEl.append(renderRow(page, record)));
    return;
  }
  const starred = shown.filter((record) => record.starred);
  if (starred.length) rowsEl.append(renderFold(page, "starred", L("pages.star.add"), starred));
  page.folders.forEach((folder) => {
    const items = shown.filter((record) => record.folder_id === folder.id);
    const fold = renderFold(page, folder.id, folder.title, items, folderActions(page, folder));
    if (open.size) fold.open = open.has(folder.id);
    rowsEl.append(fold);
  });
  const unfiled = shown.filter((record) => !record.folder_id);
  if (unfiled.length) rowsEl.append(renderFold(page, "", L("pages.folder.unfiled"), unfiled));
};

/** The list could not be read: an error box with a retry in its place. */
export function listFailed(page: PagesPage, error: { message?: string } | null | undefined, loadList: () => Promise<void>): void {
  const { L, empty, rowsEl } = page;
  empty.hidden = true;
  const box = document.createElement("div");
  box.className = "mw-empty mw-empty--error";
  box.setAttribute("role", "alert");
  box.innerHTML = `<span class="mw-empty__mark">${ICON("circle-alert")}</span><strong></strong><p></p><button class="mw-btn mw-btn--secondary" type="button"></button>`;
  const text = box.querySelector("p")!, retry = box.querySelector("button")!;
  box.querySelector("strong")!.textContent = L("pages.list.unreadable");
  text.textContent = error?.message || L("pages.list.try-later");
  retry.textContent = L("pages.action.retry");
  retry.addEventListener("click", () => {
    retry.disabled = true;
    void loadList().then(() => box.remove(), (next: { message?: string } | null) => {
      retry.disabled = false;
      text.textContent = next?.message || L("pages.list.try-later");
    });
  });
  rowsEl.replaceChildren(box);
}

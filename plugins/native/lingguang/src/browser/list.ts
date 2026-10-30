import type { PlacementDescription } from "@molis-ai/molis-work-contracts/services/placement";
import { textCell } from "./dom.js";
import type { LingguangPage, Spark } from "./types.js";

/** The list: rows, selection, and where each spark went. */
export function installList(page: LingguangPage): void {
  const { L, el, s, request } = page;
  const previewOf = (record: Spark) => {
    const line = (record.body || "").trim().split(/\r?\n/)[0] || "";
    return line && line !== record.title ? line : L("lingguang.list.no-body");
  };
  const whenOf = (iso: string) => {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const now = new Date();
    const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
    if (sameDay) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    return (date.getMonth() + 1) + "/" + date.getDate();
  };
  // A row is selected while it is picked or open, and the list (a listbox that picks several) says so.
  const paintRow = (row: Element, on: boolean) => {
    row.classList.toggle("is-selected", on);
    row.setAttribute("aria-selected", String(on));
  };
  const fateLabel = (description: PlacementDescription) => {
    const derived = (description.associations || []).filter((item) => item.type === "derived_into");
    if (!derived.length) return "";
    // Where it went is named by whoever keeps the object (the placement service reads it from the owner); nothing here knows other plugins' kinds.
    const target = derived[derived.length - 1].target;
    const keeper = target.kind === "object" ? target.plugin : null;
    return keeper ? L("lingguang.fate.into", { plugin: keeper.title }) : L("lingguang.fate.other");
  };
  const annotateFates = async (items: readonly Spark[]) => {
    const pending = items.filter((record) => !s.fates.has(record.id)).slice(0, 30);
    await Promise.all(pending.map(async (record) => {
      try { s.fates.set(record.id, fateLabel(await request<PlacementDescription>("POST", "/api/placement/describe", { object: { kind: "lingguang_spark", id: record.id, project_id: record.project_id } }))); }
      catch { s.fates.set(record.id, ""); }
    }));
    el.rowsEl.querySelectorAll<HTMLElement>("[data-lingguang-fate]").forEach((cell) => {
      const label = s.fates.get(cell.dataset.lingguangFate || "") || "";
      cell.textContent = label;
      cell.hidden = !label;
    });
  };
  const renderRow = (record: Spark) => {
    const item = document.createElement("article");
    item.className = "feed-stage-item";
    item.setAttribute("role", "none");
    const row = document.createElement("button");
    row.type = "button";
    row.setAttribute("role", "option");
    row.className = "feed-stage-entry directory-list-row";
    row.dataset.lingguangId = record.id;
    paintRow(row, s.picks.has(record.id) || s.selected?.id === record.id);
    const leading = document.createElement("span");
    leading.className = "feed-stage-leading";
    const title = document.createElement("strong");
    title.dataset.lingguangPreview = "true";
    title.title = record.title;
    title.textContent = record.title;
    leading.append(title);
    const snippet = textCell("plugin-stage-fact", previewOf(record));
    snippet.dataset.lingguangSnippet = "true";
    // Where the spark went (a document, a Goal, a todo) is filled in after paint from the placement ledger.
    const fate = document.createElement("span");
    fate.className = "mw-status mw-status--plain mw-status--done feed-entry-status";
    fate.dataset.lingguangFate = record.id;
    fate.textContent = s.fates.get(record.id) || "";
    fate.hidden = !fate.textContent;
    row.append(leading, snippet, fate, textCell("plugin-stage-meta", whenOf(record.created_at)));
    item.append(row);
    return item;
  };
  const paintList = () => {
    el.empty.hidden = s.records.length > 0;
    el.rowsEl.replaceChildren();
    s.records.forEach((record) => el.rowsEl.append(renderRow(record)));
    void annotateFates(s.records);
    page.syncSelectionBar();
  };
  const patchPreview = (record: Spark) => {
    const row = el.rowsEl.querySelector(`[data-lingguang-id="${record.id}"]`);
    if (!row) return;
    const title = row.querySelector("[data-lingguang-preview]");
    if (title) title.textContent = record.title;
    const preview = row.querySelector("[data-lingguang-snippet]");
    if (preview) preview.textContent = previewOf(record);
  };

  page.renderList = () => {
    const top = el.list.scrollTop || 0;
    paintList();
    el.list.scrollTop = top;
  };
  page.markSelected = (id) => {
    el.rowsEl.querySelectorAll<HTMLElement>("[data-lingguang-id]").forEach((row) => paintRow(row, s.picks.has(row.dataset.lingguangId || "") || row.dataset.lingguangId === id));
  };
  page.selectedRecords = () => s.records.filter((item) => s.picks.has(item.id));
  page.syncSelectionBar = () => {
    const count = s.picks.size;
    el.selectionBar.hidden = count < 2;
    el.selectedCountEl.textContent = count >= 2 ? L("lingguang.list.selected", { count }) : "";
  };
  page.remember = (record, base) => {
    const index = s.records.findIndex((item) => item.id === record.id);
    if (index >= 0) s.records[index] = record;
    else s.records.unshift(record);
    if (s.selected?.id === record.id && s.editorBase === base) {
      s.selected = record;
      el.titleEl.textContent = record.title;
    }
    page.renderList();
    patchPreview(record);
  };
}

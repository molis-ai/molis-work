import { mergeDatasetDraftRows } from "../row-merge.js";
import type { Column, Dataset, DatasetPage } from "./types.js";

const emptyCells = (columns: readonly Column[]) => Object.fromEntries(columns.map((column) => [column.id, ""]));

/** Adds a column at the table's edge. The first column starts a grid with three empty rows. */
export function addColumn(page: DatasetPage, open: Dataset): void {
  const { L, el, s } = page;
  const draft = page.readDraft();
  const firstColumn = draft.columns.length === 0;
  draft.columns.push({
    id: "col-" + crypto.randomUUID(),
    name: (el.columnName?.value || "").trim() || L("dataset.column.default-name", { n: draft.columns.length + 1 }),
    type: (el.columnType?.value as Column["type"] | undefined) || "text",
    order: draft.columns.length + 1,
  });
  if (el.columnName) el.columnName.value = "";
  if (firstColumn && draft.rows.length === 0) {
    for (let index = 0; index < 3; index += 1) draft.rows.push({ id: "row-" + crypto.randomUUID(), cells: emptyCells(draft.columns) });
  }
  s.selected = { ...open, ...draft };
  page.renderTable(s.selected);
  const columns = el.tableEl.querySelectorAll<HTMLElement>("[data-dataset-column]");
  const last = columns[columns.length - 1] as HTMLElement | undefined;
  page.arrive(last);
  last?.querySelector<HTMLInputElement>("[data-column-name]")?.select();
  page.queueSave();
}

export function addRow(page: DatasetPage, open: Dataset): void {
  const { el, s } = page;
  const draft = page.readDraft();
  draft.rows.push({ id: "row-" + crypto.randomUUID(), cells: emptyCells(draft.columns) });
  s.selected = { ...open, ...draft };
  page.renderTable(s.selected);
  const rows = el.tableEl.querySelectorAll<HTMLElement>("[data-dataset-row]");
  const last = rows[rows.length - 1] as HTMLElement | undefined;
  page.arrive(last);
  last?.querySelector<HTMLElement>("[data-cell]")?.focus();
  page.queueSave();
}

export function openPaste(page: DatasetPage): void {
  const panel = page.el.bench.querySelector<HTMLDetailsElement>(".dataset-panel");
  if (panel) panel.open = true;
  page.el.csvInput.focus();
}

export function removeColumn(page: DatasetPage, open: Dataset, button: Element): void {
  button.closest("[data-dataset-column]")?.remove();
  const draft = page.readDraft();
  page.s.selected = { ...open, ...draft };
  page.renderTable(page.s.selected);
  page.queueSave();
}

export function removeRow(page: DatasetPage, open: Dataset, button: Element): void {
  const { el, s } = page;
  const row = button.closest<HTMLElement>("[data-dataset-row]");
  if (!row) return;
  const id = row.dataset.rowId;
  row.remove();
  s.selected = {
    ...open,
    rows: mergeDatasetDraftRows((open.rows || []).filter((item) => item.id !== id), page.rowsFromDom(), page.columnsFromDom(), s.filterSeen),
  };
  if (el.filterEmpty) {
    const query = (el.filterInput.value || "").trim();
    const noMatch = Boolean(query && !el.tableEl.querySelector("[data-dataset-row]"));
    el.filterEmpty.hidden = !noMatch;
    el.tableEl.hidden = noMatch;
  }
  page.queueSave();
}

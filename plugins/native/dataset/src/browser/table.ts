import { mergeDatasetDraftRows } from "../row-merge.js";
import { required } from "./dom.js";
import type { Column, Dataset, DatasetPage, Row, Translate } from "./types.js";

type CellInput = HTMLInputElement | HTMLTextAreaElement;
const isTextarea = (node: Element): node is HTMLTextAreaElement => node.tagName === "TEXTAREA";

/** A cell's input. A date or number input that cannot hold what the cell holds (the cells are strings) falls back to a textarea. */
function cellInput(column: Column, value: string): CellInput {
  let input: CellInput;
  if (column.type === "text") input = document.createElement("textarea");
  else {
    input = document.createElement("input");
    input.type = column.type === "number" ? "number" : "date";
    input.value = value;
    if (input.value !== value) input = document.createElement("textarea");
  }
  input.className = "mw-input";
  input.dataset.cell = "true";
  input.dataset.columnId = column.id;
  if (isTextarea(input)) input.rows = Math.min(4, value.split("\n").length);
  input.value = value;
  return input;
}

function headCell(L: Translate, column: Column): HTMLTableCellElement {
  const th = document.createElement("th");
  th.dataset.datasetColumn = "true";
  th.dataset.columnId = column.id;
  th.innerHTML = '<div class="dataset-col-head"><input class="mw-input" data-column-name autocomplete="off">'
    + '<select class="mw-select dataset-col-type" data-column-type>'
    + '<option value="text">' + L("dataset.column.type-text") + '</option>'
    + '<option value="number">' + L("dataset.column.type-number") + '</option>'
    + '<option value="date">' + L("dataset.column.type-date") + '</option>'
    + '</select><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-column-remove aria-label="' + L("dataset.column.remove") + '"><svg aria-hidden="true"><use href="#icon-x"></use></svg></button></div>';
  required<HTMLInputElement>(th, "[data-column-name]").value = column.name || "";
  required<HTMLSelectElement>(th, "[data-column-type]").value = column.type || "text";
  return th;
}

function tableHead(L: Translate, columns: readonly Column[]): HTMLTableSectionElement {
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach((column) => headRow.append(headCell(L, column)));
  const addColumnCell = document.createElement("th");
  addColumnCell.className = "dataset-add-column-cell";
  addColumnCell.innerHTML = '<button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-dataset-add-column aria-label="' + L("dataset.column.add") + '" title="' + L("dataset.column.add") + '"><svg aria-hidden="true"><use href="#icon-plus"></use></svg></button>';
  headRow.append(addColumnCell);
  thead.append(headRow);
  return thead;
}

function bodyRow(L: Translate, columns: readonly Column[], row: Row): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.dataset.datasetRow = "true";
  tr.dataset.rowId = row.id;
  columns.forEach((column) => {
    const td = document.createElement("td");
    td.append(cellInput(column, row.cells?.[column.id] ?? ""));
    tr.append(td);
  });
  const remove = document.createElement("td");
  remove.innerHTML = '<button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-row-remove aria-label="' + L("dataset.row.remove") + '"><svg aria-hidden="true"><use href="#icon-x"></use></svg></button>';
  tr.append(remove);
  return tr;
}

function addRowLine(L: Translate, columns: readonly Column[]): HTMLTableRowElement {
  const addRow = document.createElement("tr");
  addRow.className = "dataset-add-row";
  const cell = document.createElement("td");
  cell.colSpan = columns.length + 1;
  cell.innerHTML = '<button class="mw-btn mw-btn--ghost" type="button" data-dataset-add-row><svg aria-hidden="true"><use href="#icon-plus"></use></svg><span>' + L("dataset.row.add") + '</span></button>';
  addRow.append(cell);
  return addRow;
}

/** The table on screen: reading it back into a draft, drawing a record into it, and the version list. */
export function installTable(page: DatasetPage): void {
  const { L, el, s } = page;

  page.columnsFromDom = () => [...el.tableEl.querySelectorAll<HTMLElement>("[data-dataset-column]")].map((cell, index) => ({
    id: cell.dataset.columnId ?? "",
    name: required<HTMLInputElement>(cell, "[data-column-name]").value.trim() || L("dataset.column.default-name", { n: index + 1 }),
    type: required<HTMLSelectElement>(cell, "[data-column-type]").value as Column["type"],
    order: index + 1,
  }));

  // Textareas normalize line endings; preserve unchanged CSV bytes.
  page.rowsFromDom = () => [...el.tableEl.querySelectorAll<HTMLElement>("[data-dataset-row]")].map((row) => ({
    id: row.dataset.rowId ?? "",
    cells: Object.fromEntries([...row.querySelectorAll<CellInput>("[data-cell]")].map((input) => {
      const columnId = input.dataset.columnId ?? "";
      const previous = s.selected?.rows.find((item) => item.id === row.dataset.rowId)?.cells[columnId];
      const value = typeof previous === "string" && previous.replace(/\r\n?/g, "\n") === input.value ? previous : input.value;
      return [columnId, value];
    })),
  }));

  page.readDraft = () => {
    const columns = page.columnsFromDom();
    const rows = mergeDatasetDraftRows(s.selected?.rows || [], page.rowsFromDom(), columns, s.filterSeen);
    return { title: el.titleInput.value, description: el.descInput.value, columns, rows };
  };

  const noColumns = () => {
    el.tableEl.replaceChildren();
    el.tableEl.hidden = true;
    if (el.toolbar) el.toolbar.hidden = !el.filterInput.value;
    if (el.tableEmpty) el.tableEmpty.hidden = false;
    if (el.filterEmpty) el.filterEmpty.hidden = true;
    s.filterSeen = el.filterInput.value;
  };

  // Existing cells are strings, including values a date/number input cannot represent.
  page.renderTable = (record: Dataset) => {
    const columns = record.columns || [];
    if (!columns.length) { noColumns(); return; }
    el.tableEl.hidden = false;
    if (el.tableEmpty) el.tableEmpty.hidden = true;
    const query = (el.filterInput.value || "").trim().toLowerCase();
    const tbody = document.createElement("tbody");
    (record.rows || []).forEach((row) => {
      const match = !query || columns.some((column) => String(row.cells?.[column.id] ?? "").toLowerCase().includes(query));
      if (match) tbody.append(bodyRow(L, columns, row));
    });
    const noMatch = Boolean(query && !tbody.childElementCount);
    // Grow from the table edge, with a "+" after the last column and below the last row.
    if (!query) tbody.append(addRowLine(L, columns));
    el.tableEl.replaceChildren(tableHead(L, columns), tbody);
    // Offer filtering once there is something to filter through.
    if (el.toolbar) el.toolbar.hidden = !((record.rows || []).length >= 8 || query);
    el.tableEl.hidden = noMatch;
    if (el.filterEmpty) el.filterEmpty.hidden = !noMatch;
    s.filterSeen = el.filterInput.value;
  };

  page.renderVersions = (versions) => {
    el.versionsEl.replaceChildren();
    versions.forEach((item) => {
      const row = document.createElement("div");
      row.className = "dataset-version";
      row.dataset.versionId = item.id;
      const label = document.createElement("span");
      label.textContent = (item.note || L("dataset.version.snapshot")) + " · " + item.created_at.slice(0, 19).replace("T", " ");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mw-btn mw-btn--ghost";
      button.dataset.datasetRollback = "true";
      button.textContent = L("dataset.version.rollback");
      row.append(label, button);
      el.versionsEl.append(row);
    });
  };
}

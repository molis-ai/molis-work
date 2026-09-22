import { Node, ResolvedPos } from "prosemirror-model";
import { EditorState, TextSelection, Transaction } from "prosemirror-state";
import { pagesSchema } from "./schema.js";

export interface TableHit {
  readonly tablePos: number;
  readonly table: Node;
  readonly rowIndex: number;
  readonly colIndex: number;
  readonly rowDepth: number;
}

/** The table cell under the selection, if the caret is inside one. */
export function tableHit(state: EditorState): TableHit | null {
  const $from = state.selection.$from;
  return hitAt($from);
}

function hitAt($from: ResolvedPos): TableHit | null {
  let cellDepth = 0;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name;
    if (name === "table_cell" || name === "table_header") {
      cellDepth = depth;
      break;
    }
  }
  if (cellDepth < 2) return null;
  const rowDepth = cellDepth - 1;
  const tableDepth = rowDepth - 1;
  const table = $from.node(tableDepth);
  if (table.type.name !== "table" || $from.node(rowDepth).type.name !== "table_row") return null;
  return {
    tablePos: $from.before(tableDepth),
    table,
    rowIndex: $from.index(tableDepth),
    colIndex: $from.index(rowDepth),
    rowDepth,
  };
}

function emptyCell(header: boolean): Node {
  const paragraph = pagesSchema.nodes.paragraph.create();
  return (header ? pagesSchema.nodes.table_header : pagesSchema.nodes.table_cell).create(null, paragraph);
}

function blankRow(columnCount: number): Node {
  const cells = Array.from({ length: Math.max(1, columnCount) }, () => emptyCell(false));
  return pagesSchema.nodes.table_row.create(null, cells);
}

function caretNear(tr: Transaction, pos: number): Transaction {
  const clamped = Math.max(0, Math.min(pos, tr.doc.content.size));
  return tr.setSelection(TextSelection.near(tr.doc.resolve(clamped), 1));
}

/** Insert a body row under the current one. Without a cell caret, append to the table at `tablePos`. */
export function addTableRow(state: EditorState, tablePos?: number): Transaction | null {
  const hit = tableHit(state);
  const table = hit?.table ?? (tablePos != null ? state.doc.nodeAt(tablePos) : null);
  const at = hit?.tablePos ?? tablePos;
  if (!table || table.type.name !== "table" || at == null) return null;
  const rowIndex = hit?.rowIndex ?? table.childCount - 1;
  const width = table.child(Math.max(0, rowIndex)).childCount;
  const row = blankRow(width);
  let insertAt = at + 1;
  for (let i = 0; i <= rowIndex && i < table.childCount; i += 1) insertAt += table.child(i).nodeSize;
  return caretNear(state.tr.insert(insertAt, row), insertAt + 1);
}

/** Insert a column to the right of the current cell, or at the end of `tablePos`. */
export function addTableColumn(state: EditorState, tablePos?: number): Transaction | null {
  const hit = tableHit(state);
  const table = hit?.table ?? (tablePos != null ? state.doc.nodeAt(tablePos) : null);
  const at = hit?.tablePos ?? tablePos;
  if (!table || table.type.name !== "table" || at == null) return null;
  const colIndex = hit?.colIndex ?? Math.max(0, table.child(0).childCount - 1);
  const rows: Node[] = [];
  table.forEach((row) => {
    const cells: Node[] = [];
    row.forEach((cell, _offset, index) => {
      cells.push(cell);
      if (index === colIndex || (index === row.childCount - 1 && colIndex >= row.childCount)) {
        cells.push(emptyCell(cell.type.name === "table_header"));
      }
    });
    rows.push(row.type.create(row.attrs, cells));
  });
  const next = table.type.create(table.attrs, rows);
  const tr = state.tr.replaceWith(at, at + table.nodeSize, next);
  return caretNear(tr, at + 1);
}

function tableAt(state: EditorState, tablePos?: number): { pos: number; table: Node } | null {
  const hit = tableHit(state);
  if (hit) return { pos: hit.tablePos, table: hit.table };
  if (tablePos == null) return null;
  const table = state.doc.nodeAt(tablePos);
  if (table?.type.name !== "table") return null;
  return { pos: tablePos, table };
}

/** Drop the current row, or the last row when the menu only knows the table. The final row leaves an empty paragraph. */
export function deleteTableRow(state: EditorState, tablePos?: number): Transaction | null {
  const located = tableAt(state, tablePos);
  const hit = tableHit(state);
  if (!located) return null;
  const rowIndex = hit && hit.tablePos === located.pos ? hit.rowIndex : located.table.childCount - 1;
  if (located.table.childCount <= 1) {
    const paragraph = pagesSchema.nodes.paragraph.create();
    const tr = state.tr.replaceWith(located.pos, located.pos + located.table.nodeSize, paragraph);
    return caretNear(tr, located.pos + 1);
  }
  let rowPos = located.pos + 1;
  for (let i = 0; i < rowIndex; i += 1) rowPos += located.table.child(i).nodeSize;
  const row = located.table.child(rowIndex);
  const tr = state.tr.delete(rowPos, rowPos + row.nodeSize);
  return caretNear(tr, rowPos);
}

/** Drop the current column, or the last column when the menu only knows the table. */
export function deleteTableColumn(state: EditorState, tablePos?: number): Transaction | null {
  const located = tableAt(state, tablePos);
  const hit = tableHit(state);
  if (!located) return null;
  const rowIndex = hit && hit.tablePos === located.pos ? hit.rowIndex : 0;
  const colIndex = hit && hit.tablePos === located.pos
    ? hit.colIndex
    : located.table.child(0).childCount - 1;
  const width = located.table.child(rowIndex).childCount;
  if (width <= 1) {
    const paragraph = pagesSchema.nodes.paragraph.create();
    const tr = state.tr.replaceWith(located.pos, located.pos + located.table.nodeSize, paragraph);
    return caretNear(tr, located.pos + 1);
  }
  const rows: Node[] = [];
  located.table.forEach((row) => {
    const cells: Node[] = [];
    row.forEach((cell, _offset, index) => {
      if (index !== colIndex) cells.push(cell);
    });
    rows.push(row.type.create(row.attrs, cells.length ? cells : [emptyCell(false)]));
  });
  const next = located.table.type.create(located.table.attrs, rows);
  const tr = state.tr.replaceWith(located.pos, located.pos + located.table.nodeSize, next);
  return caretNear(tr, located.pos + 1);
}

/** True when the caret is in the bottom-right cell, where Tab should grow the table. */
export function atLastTableCell(state: EditorState): boolean {
  const hit = tableHit(state);
  if (!hit) return false;
  const lastRow = hit.rowIndex === hit.table.childCount - 1;
  const lastCol = hit.colIndex === hit.table.child(hit.rowIndex).childCount - 1;
  return lastRow && lastCol;
}

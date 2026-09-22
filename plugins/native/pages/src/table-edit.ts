import { Node, ResolvedPos } from "prosemirror-model";
import { Command, EditorState, TextSelection, Transaction } from "prosemirror-state";
import { pagesSchema, safePagesColumnWidth } from "./schema.js";

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

/** Set every cell in one column to the same pixel width. Zero lets that column share the row again. */
export function setColumnWidth(state: EditorState, tablePos: number, colIndex: number, width: number) {
  const table = tablePos >= 0 && tablePos <= state.doc.content.size ? state.doc.nodeAt(tablePos) : null;
  if (!table || table.type !== pagesSchema.nodes.table || colIndex < 0) return null;
  const next = safePagesColumnWidth(width);
  const tr = state.tr;
  let changed = false;
  let rowPos = tablePos + 1;
  table.forEach((row) => {
    if (colIndex < row.childCount) {
      const cell = row.child(colIndex);
      if (safePagesColumnWidth(cell.attrs.colwidth) !== next) {
        let cellPos = rowPos + 1;
        for (let i = 0; i < colIndex; i += 1) cellPos += row.child(i).nodeSize;
        tr.setNodeMarkup(cellPos, undefined, { ...cell.attrs, colwidth: next });
        changed = true;
      }
    }
    rowPos += row.nodeSize;
  });
  return changed ? tr : null;
}

type TableEdge = "left" | "right" | "up" | "down";

function cellDepthOf($from: ResolvedPos): number {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name;
    if (name === "table_cell" || name === "table_header") return depth;
  }
  return 0;
}

function atCellEdge($from: ResolvedPos, cellDepth: number, end: boolean): boolean {
  if ($from.parentOffset !== (end ? $from.parent.content.size : 0)) return false;
  const cell = $from.node(cellDepth);
  const childIndex = $from.index(cellDepth);
  if (end ? childIndex !== cell.childCount - 1 : childIndex !== 0) return false;
  for (let depth = cellDepth + 1; depth < $from.depth; depth += 1) {
    const index = $from.index(depth);
    const parent = $from.node(depth);
    if (end ? index !== parent.childCount - 1 : index !== 0) return false;
  }
  return true;
}

function cellOrigin(table: Node, tablePos: number, rowIndex: number, colIndex: number): number | null {
  if (rowIndex < 0 || rowIndex >= table.childCount) return null;
  const row = table.child(rowIndex);
  if (colIndex < 0 || colIndex >= row.childCount) return null;
  let pos = tablePos + 1;
  for (let rowAt = 0; rowAt < rowIndex; rowAt += 1) pos += table.child(rowAt).nodeSize;
  pos += 1;
  for (let colAt = 0; colAt < colIndex; colAt += 1) pos += row.child(colAt).nodeSize;
  return pos;
}

/**
 * Where the caret should go when an arrow key hits the edge of a table cell.
 * Left and right move across the row, then wrap to the next row.
 * Up and down stay in the same column. `null` means the key should keep moving inside the cell.
 */
export function tableEdgeTarget(state: EditorState, edge: TableEdge): number | null {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock) return null;
  const hit = tableHit(state);
  const cellDepth = cellDepthOf($from);
  if (!hit || !cellDepth) return null;
  const atStart = atCellEdge($from, cellDepth, false);
  const atEnd = atCellEdge($from, cellDepth, true);
  if ((edge === "left" || edge === "up") && !atStart) return null;
  if ((edge === "right" || edge === "down") && !atEnd) return null;
  const { table, tablePos, rowIndex, colIndex } = hit;
  const row = table.child(rowIndex);
  if (edge === "left" && colIndex > 0) {
    const origin = cellOrigin(table, tablePos, rowIndex, colIndex - 1);
    const cell = row.child(colIndex - 1);
    return origin == null ? null : origin + cell.nodeSize - 1;
  }
  if (edge === "right" && colIndex < row.childCount - 1) {
    const origin = cellOrigin(table, tablePos, rowIndex, colIndex + 1);
    return origin == null ? null : origin + 1;
  }
  if (edge === "up" && rowIndex > 0) {
    const origin = cellOrigin(table, tablePos, rowIndex - 1, colIndex);
    const above = table.child(rowIndex - 1);
    if (origin == null || colIndex >= above.childCount) return null;
    return origin + above.child(colIndex).nodeSize - 1;
  }
  if (edge === "down" && rowIndex < table.childCount - 1) {
    const origin = cellOrigin(table, tablePos, rowIndex + 1, colIndex);
    const below = table.child(rowIndex + 1);
    if (origin == null || colIndex >= below.childCount) return null;
    return origin + 1;
  }
  if (edge === "left" && rowIndex > 0) {
    const prev = table.child(rowIndex - 1);
    const origin = cellOrigin(table, tablePos, rowIndex - 1, prev.childCount - 1);
    return origin == null ? null : origin + prev.lastChild!.nodeSize - 1;
  }
  if (edge === "right" && rowIndex < table.childCount - 1) {
    const origin = cellOrigin(table, tablePos, rowIndex + 1, 0);
    return origin == null ? null : origin + 1;
  }
  if (edge === "left" || edge === "up") return tablePos > 0 ? tablePos : null;
  const after = tablePos + table.nodeSize;
  return after < state.doc.content.size ? after : null;
}

/** Move across a table cell edge. Returns false so a normal arrow key still runs inside the cell. */
export function moveTableEdge(edge: TableEdge): Command {
  return (state, dispatch) => {
    const target = tableEdgeTarget(state, edge);
    if (target == null) return false;
    if (!dispatch) return true;
    const bias = edge === "left" || edge === "up" ? -1 : 1;
    dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(target), bias)).scrollIntoView());
    return true;
  };
}

/** Move the column under the caret left or right. The caret stays in the same cell. */
export function moveTableColumn(state: EditorState, direction: -1 | 1): Transaction | null {
  const hit = tableHit(state);
  if (!hit) return null;
  const target = hit.colIndex + direction;
  if (target < 0) return null;
  const rows: Node[] = [];
  let movable = true;
  hit.table.forEach((row) => {
    if (hit.colIndex >= row.childCount || target >= row.childCount) {
      movable = false;
      return;
    }
    const cells: Node[] = [];
    row.forEach((cell) => cells.push(cell));
    const from = Math.min(hit.colIndex, target);
    const to = Math.max(hit.colIndex, target);
    const swap = cells[from];
    cells[from] = cells[to];
    cells[to] = swap;
    rows.push(row.type.create(row.attrs, cells));
  });
  if (!movable) return null;
  const next = hit.table.type.create(hit.table.attrs, rows);
  const tr = state.tr.replaceWith(hit.tablePos, hit.tablePos + hit.table.nodeSize, next);
  const origin = cellOrigin(next, hit.tablePos, hit.rowIndex, target);
  if (origin == null) return tr;
  const inside = Math.min(origin + 2, tr.doc.content.size);
  try {
    return tr.setSelection(TextSelection.create(tr.doc, inside));
  } catch {
    return caretNear(tr, origin + 1);
  }
}

/** Move the row under the caret up or down. The caret stays in the same cell. */
export function moveTableRow(state: EditorState, direction: -1 | 1): Transaction | null {
  const hit = tableHit(state);
  if (!hit) return null;
  const target = hit.rowIndex + direction;
  if (target < 0 || target >= hit.table.childCount) return null;
  const rows: Node[] = [];
  hit.table.forEach((row) => rows.push(row));
  const [row] = rows.splice(hit.rowIndex, 1);
  if (!row) return null;
  rows.splice(target, 0, row);
  const next = hit.table.type.create(hit.table.attrs, rows);
  const tr = state.tr.replaceWith(hit.tablePos, hit.tablePos + hit.table.nodeSize, next);
  const origin = cellOrigin(next, hit.tablePos, target, hit.colIndex);
  if (origin == null) return tr;
  const inside = Math.min(origin + 2, tr.doc.content.size);
  try {
    return tr.setSelection(TextSelection.create(tr.doc, inside));
  } catch {
    return caretNear(tr, origin + 1);
  }
}

/** Flip the first row between header cells and ordinary cells. Text and column width stay. */
export function toggleHeaderRow(state: EditorState, tablePos?: number): Transaction | null {
  const hit = tableHit(state);
  const table = hit?.table ?? (tablePos != null && tablePos >= 0 && tablePos <= state.doc.content.size ? state.doc.nodeAt(tablePos) : null);
  const at = hit?.tablePos ?? tablePos;
  if (!table || table.type !== pagesSchema.nodes.table || at == null || table.childCount < 1) return null;
  const row = table.child(0);
  const header = pagesSchema.nodes.table_header;
  const cell = pagesSchema.nodes.table_cell;
  const makeHeader = row.firstChild?.type !== header;
  const cells: Node[] = [];
  row.forEach((child) => {
    cells.push((makeHeader ? header : cell).create({ colwidth: safePagesColumnWidth(child.attrs.colwidth) }, child.content));
  });
  const rowPos = at + 1;
  return state.tr.replaceWith(rowPos, rowPos + row.nodeSize, row.type.create(row.attrs, cells));
}

/** True when the caret is in the bottom-right cell, where Tab should grow the table. */
export function atLastTableCell(state: EditorState): boolean {
  const hit = tableHit(state);
  if (!hit) return false;
  const lastRow = hit.rowIndex === hit.table.childCount - 1;
  const lastCol = hit.colIndex === hit.table.child(hit.rowIndex).childCount - 1;
  return lastRow && lastCol;
}

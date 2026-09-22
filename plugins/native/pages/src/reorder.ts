import { Fragment, Node, Slice } from "prosemirror-model";
import { pagesSchema } from "./schema.js";

/** Move a top-level block so it sits before `insertBefore` (use `doc.childCount` to append). */
export function reorderTopLevel(doc: Node, fromIndex: number, insertBefore: number): Node {
  const count = doc.childCount;
  if (fromIndex < 0 || fromIndex >= count) return doc;
  let dest = Math.max(0, Math.min(insertBefore, count));
  if (fromIndex === dest || fromIndex + 1 === dest) return doc;
  const nodes: Node[] = [];
  doc.forEach((child) => {
    nodes.push(child);
  });
  const [moved] = nodes.splice(fromIndex, 1);
  if (!moved) return doc;
  if (fromIndex < dest) dest -= 1;
  nodes.splice(dest, 0, moved);
  return doc.type.create(doc.attrs, Fragment.from(nodes));
}

/** One draggable row. Lists themselves are not rows — their items are. */
export interface DragRow {
  pos: number;
  parentPos: number | null;
  index: number;
  indent: number;
  topIndex: number;
  canHaveChildren: boolean;
}

export interface DropSlot {
  parentPos: number | null;
  index: number;
  wrapList?: ListKind;
}

type ListKind = "bullet_list" | "ordered_list" | "task_list";

const LIST = new Set(["bullet_list", "ordered_list", "task_list"]);
const ITEM = new Set(["list_item", "task_item"]);
const CONTAINER = new Set(["callout", "toggle", "blockquote"]);

function nodesOf(node: Node): Node[] {
  const out: Node[] = [];
  node.forEach((child) => out.push(child));
  return out;
}

/** Flat visual order of rows a grip can grab, parents before their children. */
export function dragRows(doc: Node): DragRow[] {
  const rows: DragRow[] = [];
  doc.forEach((child, offset, index) => {
    walk(child, offset, null, index, index, 0, rows);
  });
  return rows;
}

function walk(
  node: Node,
  pos: number,
  parentPos: number | null,
  index: number,
  topIndex: number,
  indent: number,
  rows: DragRow[],
): void {
  if (LIST.has(node.type.name)) {
    let childPos = pos + 1;
    node.forEach((item, _offset, itemIndex) => {
      walk(item, childPos, pos, itemIndex, topIndex, indent + 1, rows);
      childPos += item.nodeSize;
    });
    return;
  }
  const canHaveChildren = ITEM.has(node.type.name) || CONTAINER.has(node.type.name);
  rows.push({ pos, parentPos, index, indent, topIndex, canHaveChildren });
  if (!canHaveChildren) return;
  let childPos = pos + 1;
  node.forEach((child, _offset, childIndex) => {
    const skipLead = (ITEM.has(node.type.name) || node.type.name === "toggle")
      && childIndex === 0
      && child.type.name === "paragraph";
    if (!skipLead && child.isBlock) {
      const childIndent = LIST.has(child.type.name) ? indent : indent + 1;
      walk(child, childPos, pos, childIndex, topIndex, childIndent, rows);
    }
    childPos += child.nodeSize;
  });
}

export function dropLevelRange(rows: readonly DragRow[], gap: number): { min: number; max: number } {
  const prev = gap > 0 ? rows[gap - 1] : undefined;
  const next = gap < rows.length ? rows[gap] : undefined;
  if (prev) return { min: 0, max: prev.indent + (prev.canHaveChildren ? 1 : 0) };
  return { min: 0, max: next ? next.indent : 0 };
}

function contains(doc: Node, row: DragRow, inner: DragRow): boolean {
  const node = doc.nodeAt(row.pos);
  if (!node) return false;
  return inner.pos > row.pos && inner.pos < row.pos + node.nodeSize;
}

function listKindOf(doc: Node, row: DragRow): ListKind {
  if (row.parentPos == null) return "bullet_list";
  const name = doc.nodeAt(row.parentPos)?.type.name;
  if (name === "ordered_list") return "ordered_list";
  if (name === "task_list" || name === "task_item") return "task_list";
  return "bullet_list";
}

function nestInto(doc: Node, prev: DragRow, dragged: Node): DropSlot | null {
  const node = doc.nodeAt(prev.pos);
  if (!node) return null;
  const kind: ListKind | null = node.type.name === "task_item"
    ? "task_list"
    : node.type.name === "list_item"
      ? listKindOf(doc, prev)
      : null;
  if (kind && toItems(dragged, kind)) {
    const last = node.lastChild;
    if (last && last.type.name === kind) {
      const lastPos = prev.pos + node.nodeSize - 1 - last.nodeSize;
      return { parentPos: lastPos, index: last.childCount };
    }
    return { parentPos: prev.pos, index: node.childCount, wrapList: kind };
  }
  if (node.type.name === "list_item" || node.type.name === "task_item" || CONTAINER.has(node.type.name)) {
    return { parentPos: prev.pos, index: node.childCount };
  }
  return null;
}

/** Where a row lands when dropped at `gap` (0..rows.length) and visual `level`. */
export function dropSlot(doc: Node, rows: readonly DragRow[], gap: number, level: number, dragged: Node): DropSlot | null {
  if (gap < 0 || gap > rows.length) return null;
  const range = dropLevelRange(rows, gap);
  const want = Math.max(range.min, Math.min(level, range.max));
  const prev = gap > 0 ? rows[gap - 1] : undefined;
  const next = gap < rows.length ? rows[gap] : undefined;
  if (!prev) {
    if (!next || want === 0) return { parentPos: null, index: 0 };
    if (want === next.indent) return { parentPos: next.parentPos, index: next.index };
    return { parentPos: null, index: next.topIndex };
  }
  if (want === 0) {
    if (next && next.indent === 0) return { parentPos: null, index: next.topIndex };
    return { parentPos: null, index: prev.topIndex + 1 };
  }
  if (want > prev.indent && prev.canHaveChildren) {
    if (next && next.indent === want && contains(doc, prev, next)) {
      return { parentPos: next.parentPos, index: next.index };
    }
    return nestInto(doc, prev, dragged);
  }
  if (want === prev.indent) return { parentPos: prev.parentPos, index: prev.index + 1 };
  for (let i = gap - 1; i >= 0; i -= 1) {
    if (rows[i].indent === want) return { parentPos: rows[i].parentPos, index: rows[i].index + 1 };
  }
  return { parentPos: null, index: prev.topIndex + 1 };
}

function paragraphOf(content: Fragment | Node): Node {
  return pagesSchema.nodes.paragraph.create(null, content);
}

function toListItem(node: Node): Node | null {
  const s = pagesSchema.nodes;
  if (node.type === s.list_item) return node;
  if (node.type === s.task_item) return s.list_item.create(null, node.content);
  if (node.type === s.paragraph) return s.list_item.create(null, node);
  if (node.type === s.heading) return s.list_item.create(null, paragraphOf(node.content));
  return null;
}

function toTaskItem(node: Node): Node | null {
  const s = pagesSchema.nodes;
  if (node.type === s.task_item) return node;
  if (node.type === s.list_item) return s.task_item.create({ checked: false }, node.content);
  if (node.type === s.paragraph) return s.task_item.create(null, node);
  if (node.type === s.heading) return s.task_item.create(null, paragraphOf(node.content));
  return null;
}

function toItems(node: Node, kind: ListKind): Node[] | null {
  const convert = kind === "task_list" ? toTaskItem : toListItem;
  if (LIST.has(node.type.name)) {
    const items = nodesOf(node).map((child) => convert(child)).filter((item): item is Node => Boolean(item));
    return items.length ? items : null;
  }
  const one = convert(node);
  return one ? [one] : null;
}

function toBlock(node: Node): Node | null {
  const s = pagesSchema.nodes;
  if (node.type === s.list_item) return s.bullet_list.create(null, node);
  if (node.type === s.task_item) return s.task_list.create(null, node);
  return node.isBlock ? node : null;
}

function fragmentFor(parent: Node, dragged: Node, wrapList?: ListKind): Fragment | null {
  const s = pagesSchema.nodes;
  if (wrapList) {
    const items = toItems(dragged, wrapList);
    if (!items) return null;
    return Fragment.from(s[wrapList].create(null, items));
  }
  if (parent.type === s.bullet_list || parent.type === s.ordered_list) {
    const kind: ListKind = parent.type === s.ordered_list ? "ordered_list" : "bullet_list";
    const items = toItems(dragged, kind);
    return items ? Fragment.from(items) : null;
  }
  if (parent.type === s.task_list) {
    const items = toItems(dragged, "task_list");
    return items ? Fragment.from(items) : null;
  }
  if (parent.type === s.doc && (dragged.type === s.list_item || dragged.type === s.task_item)) {
    return dragged.content;
  }
  const block = toBlock(dragged);
  return block ? Fragment.from(block) : null;
}

function childPosition(doc: Node, parentPos: number | null, index: number): number | null {
  const parent = parentPos == null ? doc : doc.nodeAt(parentPos);
  if (!parent || index < 0 || index > parent.childCount) return null;
  let pos = parentPos == null ? 0 : parentPos + 1;
  for (let i = 0; i < index; i += 1) pos += parent.child(i).nodeSize;
  return pos;
}

interface Removal {
  from: number;
  to: number;
  replacement: Fragment;
}

function emptyParagraph(): Node {
  return pagesSchema.nodes.paragraph.create();
}

function removalPlan(doc: Node, pos: number): Removal | null {
  const node = doc.nodeAt(pos);
  if (!node) return null;
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;
  const s = pagesSchema.nodes;
  const listParent = parent.type === s.bullet_list || parent.type === s.ordered_list || parent.type === s.task_list;
  if (listParent && parent.childCount === 1 && $pos.depth >= 1) {
    const parentPos = $pos.before($pos.depth);
    return { from: parentPos, to: parentPos + parent.nodeSize, replacement: Fragment.empty };
  }
  if (parent.type === s.callout && parent.childCount === 1) {
    return { from: pos, to: pos + node.nodeSize, replacement: Fragment.from(emptyParagraph()) };
  }
  if (parent.type === s.doc && parent.childCount === 1) {
    return { from: 0, to: doc.content.size, replacement: Fragment.from(emptyParagraph()) };
  }
  return { from: pos, to: pos + node.nodeSize, replacement: Fragment.empty };
}

function isNoOp(doc: Node, fromPos: number, slot: DropSlot, fragment: Fragment, dragged: Node): boolean {
  if (slot.wrapList || fragment.childCount !== 1 || !fragment.firstChild?.eq(dragged)) return false;
  const $pos = doc.resolve(fromPos);
  const parentPos = $pos.depth === 0 ? null : $pos.before($pos.depth);
  if (parentPos !== slot.parentPos) return false;
  const index = $pos.index();
  return slot.index === index || slot.index === index + 1;
}

function replace(doc: Node, from: number, to: number, fragment: Fragment): Node {
  return doc.replace(from, to, new Slice(fragment, 0, 0));
}

/** Move the node at `fromPos` into `slot`. `null` means the drop is illegal or a no-op. */
export function moveToSlot(doc: Node, fromPos: number, slot: DropSlot): Node | null {
  try {
    const dragged = doc.nodeAt(fromPos);
    if (!dragged) return null;
    if (slot.parentPos != null && slot.parentPos >= fromPos && slot.parentPos < fromPos + dragged.nodeSize) return null;
    const parent = slot.parentPos == null ? doc : doc.nodeAt(slot.parentPos);
    if (!parent) return null;
    const fragment = fragmentFor(parent, dragged, slot.wrapList);
    if (!fragment?.size) return null;
    if (slot.index < 0 || slot.index > parent.childCount) return null;
    if (!parent.canReplace(slot.index, slot.index, fragment)) return null;
    if (isNoOp(doc, fromPos, slot, fragment, dragged)) return null;
    const insertPos = childPosition(doc, slot.parentPos, slot.index);
    const removal = removalPlan(doc, fromPos);
    if (insertPos == null || !removal) return null;
    if (insertPos > removal.from && insertPos < removal.to) return null;
    const emptiesDoc = removal.replacement.size === 0 && removal.from === 0 && removal.to === doc.content.size;
    const insertFirst = insertPos <= removal.from || emptiesDoc;
    const next = insertFirst
      ? replace(
        replace(doc, insertPos, insertPos, fragment),
        removal.from + fragment.size,
        removal.to + fragment.size,
        removal.replacement,
      )
      : replace(
        replace(doc, removal.from, removal.to, removal.replacement),
        insertPos + removal.replacement.size - (removal.to - removal.from),
        insertPos + removal.replacement.size - (removal.to - removal.from),
        fragment,
      );
    return next.eq(doc) ? null : next;
  } catch {
    return null;
  }
}

export function previewDrop(doc: Node, fromPos: number, gap: number, level: number): { level: number; doc: Node } | null {
  const dragged = doc.nodeAt(fromPos);
  if (!dragged) return null;
  const rows = dragRows(doc);
  if (gap < 0 || gap > rows.length) return null;
  const range = dropLevelRange(rows, gap);
  let cursor = Math.max(range.min, Math.min(level, range.max));
  for (; cursor >= range.min; cursor -= 1) {
    const slot = dropSlot(doc, rows, gap, cursor, dragged);
    if (!slot) continue;
    const next = moveToSlot(doc, fromPos, slot);
    if (next) return { level: cursor, doc: next };
  }
  return null;
}

/** Apply the deepest legal drop at this gap. `null` when nothing would change. */
export function placeDragged(doc: Node, fromPos: number, gap: number, level: number): Node | null {
  return previewDrop(doc, fromPos, gap, level)?.doc ?? null;
}

export function deleteAtPos(doc: Node, pos: number): Node | null {
  try {
    const removal = removalPlan(doc, pos);
    if (!removal) return null;
    const replacement = removal.replacement.size === 0 && removal.from === 0 && removal.to === doc.content.size
      ? Fragment.from(emptyParagraph())
      : removal.replacement;
    const next = replace(doc, removal.from, removal.to, replacement);
    return next.eq(doc) ? null : next;
  } catch {
    return null;
  }
}

export function duplicateAtPos(doc: Node, pos: number): Node | null {
  try {
    const node = doc.nodeAt(pos);
    if (!node) return null;
    const at = pos + node.nodeSize;
    return replace(doc, at, at, Fragment.from(node));
  } catch {
    return null;
  }
}

/** Rows from `anchor` through `head`, inclusive, in visual order. */
export function spanRows(doc: Node, anchor: number, head: number): DragRow[] {
  const rows = dragRows(doc);
  const start = rows.findIndex((row) => row.pos === anchor);
  const end = rows.findIndex((row) => row.pos === head);
  if (start < 0 || end < 0) return [];
  const [from, to] = start < end ? [start, end] : [end, start];
  return rows.slice(from, to + 1);
}

/** Selected rows that aren't already inside another selected row. */
export function spanRoots(doc: Node, anchor: number, head: number): DragRow[] {
  const rows = spanRows(doc, anchor, head);
  return rows.filter((row) => {
    const node = doc.nodeAt(row.pos);
    if (!node) return false;
    return !rows.some((other) => {
      if (other.pos === row.pos) return false;
      const parent = doc.nodeAt(other.pos);
      return Boolean(parent && row.pos > other.pos && row.pos < other.pos + parent.nodeSize);
    });
  });
}

function groupFragment(parent: Node, nodes: readonly Node[], wrapList?: ListKind): Fragment | null {
  if (wrapList) {
    const items: Node[] = [];
    for (const node of nodes) {
      const converted = toItems(node, wrapList);
      if (!converted) return null;
      items.push(...converted);
    }
    return items.length ? Fragment.from(pagesSchema.nodes[wrapList].create(null, items)) : null;
  }
  const parts: Node[] = [];
  for (const node of nodes) {
    const frag = fragmentFor(parent, node);
    if (!frag) return null;
    frag.forEach((child) => parts.push(child));
  }
  return parts.length ? Fragment.from(parts) : null;
}

function groupNoOp(doc: Node, roots: readonly DragRow[], slot: DropSlot, fragment: Fragment): boolean {
  if (slot.wrapList || fragment.childCount !== roots.length) return false;
  for (let i = 0; i < roots.length; i += 1) {
    const node = doc.nodeAt(roots[i].pos);
    if (!node || !fragment.child(i).eq(node)) return false;
  }
  const $first = doc.resolve(roots[0].pos);
  const parentPos = $first.depth === 0 ? null : $first.before($first.depth);
  if (parentPos !== slot.parentPos) return false;
  const first = $first.index();
  const last = doc.resolve(roots[roots.length - 1].pos).index();
  if (last - first + 1 !== roots.length) return false;
  return slot.index === first || slot.index === last + 1;
}

function moveRootsToSlot(doc: Node, roots: readonly DragRow[], slot: DropSlot): Node | null {
  const parent = slot.parentPos == null ? doc : doc.nodeAt(slot.parentPos);
  if (!parent) return null;
  const nodes: Node[] = [];
  for (const root of roots) {
    const node = doc.nodeAt(root.pos);
    if (!node) return null;
    if (slot.parentPos != null && slot.parentPos >= root.pos && slot.parentPos < root.pos + node.nodeSize) return null;
    nodes.push(node);
  }
  const fragment = groupFragment(parent, nodes, slot.wrapList);
  if (!fragment?.size) return null;
  if (slot.index < 0 || slot.index > parent.childCount) return null;
  if (!parent.canReplace(slot.index, slot.index, fragment)) return null;
  if (groupNoOp(doc, roots, slot, fragment)) return null;
  const insertPos = childPosition(doc, slot.parentPos, slot.index);
  if (insertPos == null) return null;
  for (let i = 0; i < nodes.length; i += 1) {
    const pos = roots[i].pos;
    if (insertPos > pos && insertPos < pos + nodes[i].nodeSize) return null;
  }
  let next = doc;
  let insert = insertPos;
  const sorted = [...roots].sort((a, b) => b.pos - a.pos);
  for (const root of sorted) {
    if (!next.nodeAt(root.pos)) continue;
    const plan = removalPlan(next, root.pos);
    if (!plan) return null;
    if (insert > plan.from && insert < plan.to) return null;
    if (plan.replacement.size === 0 && plan.from === 0 && plan.to === next.content.size) {
      return next.type.create(next.attrs, fragment);
    }
    const removed = plan.to - plan.from;
    next = replace(next, plan.from, plan.to, plan.replacement);
    if (plan.to <= insert) insert += plan.replacement.size - removed;
  }
  if (insert < 0 || insert > next.content.size) return null;
  const placed = replace(next, insert, insert, fragment);
  return placed.eq(doc) ? null : placed;
}

/** Move every selected row. A single row behaves like `previewDrop`. */
export function previewSpan(doc: Node, anchor: number, head: number, gap: number, level: number): { level: number; doc: Node } | null {
  try {
    const roots = spanRoots(doc, anchor, head);
    if (roots.length === 0) return null;
    if (roots.length === 1) return previewDrop(doc, roots[0].pos, gap, level);
    const first = doc.nodeAt(roots[0].pos);
    if (!first) return null;
    const rows = dragRows(doc);
    if (gap < 0 || gap > rows.length) return null;
    const range = dropLevelRange(rows, gap);
    let cursor = Math.max(range.min, Math.min(level, range.max));
    for (; cursor >= range.min; cursor -= 1) {
      const slot = dropSlot(doc, rows, gap, cursor, first);
      if (!slot) continue;
      const next = moveRootsToSlot(doc, roots, slot);
      if (next) return { level: cursor, doc: next };
    }
    return null;
  } catch {
    return null;
  }
}

export function placeSpan(doc: Node, anchor: number, head: number, gap: number, level: number): Node | null {
  return previewSpan(doc, anchor, head, gap, level)?.doc ?? null;
}

export function deleteSpan(doc: Node, anchor: number, head: number): Node | null {
  const roots = spanRoots(doc, anchor, head);
  if (roots.length === 0) return null;
  let next = doc;
  for (const pos of roots.map((row) => row.pos).sort((a, b) => b - a)) {
    const removed = deleteAtPos(next, pos);
    if (removed) next = removed;
  }
  return next.eq(doc) ? null : next;
}

/** Copy the selected rows as one group after the last selected row. */
function siblingIndex(doc: Node, rows: readonly DragRow[], from: number, step: -1 | 1): number {
  const origin = rows[from];
  if (!origin) return -1;
  const originNode = doc.nodeAt(origin.pos);
  for (let i = from + step; i >= 0 && i < rows.length; i += step) {
    const candidate = rows[i];
    if (candidate.indent < origin.indent) return -1;
    if (step > 0 && originNode && candidate.pos > origin.pos && candidate.pos < origin.pos + originNode.nodeSize) continue;
    if (candidate.parentPos === origin.parentPos && candidate.indent === origin.indent) return i;
  }
  return -1;
}

function gapAfterRow(doc: Node, rows: readonly DragRow[], index: number): number {
  const row = rows[index];
  const node = row ? doc.nodeAt(row.pos) : null;
  let gap = index + 1;
  if (!row || !node) return gap;
  while (gap < rows.length && rows[gap].pos > row.pos && rows[gap].pos < row.pos + node.nodeSize) gap += 1;
  return gap;
}

/**
 * Move the selected rows one slot among their siblings.
 * Returns the new document and where the same rows landed, so the selection can follow them.
 */
export function nudgeSpan(doc: Node, anchor: number, head: number, direction: -1 | 1): { doc: Node; anchor: number; head: number } | null {
  try {
    const roots = spanRoots(doc, anchor, head);
    if (!roots.length) return null;
    const parentPos = roots[0].parentPos;
    const indent = roots[0].indent;
    if (roots.some((row) => row.parentPos !== parentPos || row.indent !== indent)) return null;
    const rows = dragRows(doc);
    const first = rows.findIndex((row) => row.pos === roots[0].pos);
    const last = rows.findIndex((row) => row.pos === roots[roots.length - 1].pos);
    if (first < 0 || last < 0) return null;
    const neighbor = siblingIndex(doc, rows, direction < 0 ? first : last, direction);
    if (neighbor < 0) return null;
    const gap = direction < 0 ? neighbor : gapAfterRow(doc, rows, neighbor);
    const next = placeSpan(doc, anchor, head, gap, indent);
    if (!next) return null;
    const located = roots.map((root) => {
      const node = doc.nodeAt(root.pos);
      return node ? dragRows(next).find((row) => next.nodeAt(row.pos) === node)?.pos ?? -1 : -1;
    });
    if (located.some((pos) => pos < 0)) return { doc: next, anchor: -1, head: -1 };
    return { doc: next, anchor: located[0], head: located[located.length - 1] };
  } catch {
    return null;
  }
}

export function duplicateSpan(doc: Node, anchor: number, head: number): Node | null {
  try {
    const roots = spanRoots(doc, anchor, head);
    if (roots.length === 0) return null;
    const copies: Node[] = [];
    for (const root of roots) {
      const node = doc.nodeAt(root.pos);
      if (!node) return null;
      copies.push(node);
    }
    const last = roots[roots.length - 1];
    const lastNode = doc.nodeAt(last.pos);
    if (!lastNode) return null;
    const at = last.pos + lastNode.nodeSize;
    return replace(doc, at, at, Fragment.from(copies));
  } catch {
    return null;
  }
}

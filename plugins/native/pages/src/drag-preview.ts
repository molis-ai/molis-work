import type { Node } from "prosemirror-model";
import { closeHistory } from "prosemirror-history";
import { EditorState, type Plugin, type Transaction } from "prosemirror-state";
import { Decoration, DecorationSet, EditorView } from "prosemirror-view";
import { dragRows, spanRoots } from "./reorder.js";
import { copyDragSpan, moveSpan } from "./commands.js";

/** One document write, isolated from both the preceding and following typing. */
export function commitDrag(view: Pick<EditorView, "state" | "dispatch">, anchor: number, head: number, gap: number, level: number,
  decorate?: (tr: Transaction) => Transaction, copy = false): boolean {
  const command = copy ? copyDragSpan(anchor, head, gap, level) : moveSpan(anchor, head, gap, level);
  return command(view.state, tr => {
    view.dispatch(closeHistory(decorate ? decorate(tr) : tr));
    view.dispatch(closeHistory(view.state.tr));
  });
}

function firstLeaf(node: Node): Node {
  return node.firstChild ? firstLeaf(node.firstChild) : node;
}

/** Session-local correspondence; no IDs or intermediate state enter the document. */
export function previewRowPairs(source: Node, next: Node): Array<{ from: number; to: number }> {
  const before = dragRows(source).map(row => ({ pos: row.pos, node: source.nodeAt(row.pos)! }));
  const after = dragRows(next).map(row => ({ pos: row.pos, node: next.nodeAt(row.pos)! }));
  const used = new Set<number>();
  const matches = new Map<number, number>();
  const match = (same: (old: Node, next: Node) => boolean) => {
    for (const old of before) {
      if (matches.has(old.pos)) continue;
      const index = after.findIndex((row, i) => !used.has(i) && same(old.node, row.node));
      if (index < 0) continue;
      used.add(index);
      matches.set(old.pos, after[index].pos);
    }
  };
  // Reserve unchanged children before a reconstructed ancestor can match their text.
  match((old, node) => old === node);
  match((old, node) => old.type === node.type && firstLeaf(old) === firstLeaf(node));
  match((old, node) => firstLeaf(old) === firstLeaf(node) && old.textContent === node.textContent);
  return before.flatMap(row => matches.has(row.pos) ? [{ from: row.pos, to: matches.get(row.pos)! }] : []);
}

/** Copied blocks may share immutable Node objects. Give each occurrence its own
 * identity for this gesture, without adding document attributes. */
export function dragLayoutSource(doc: Node): Node {
  if (doc.isText) return doc.type.schema.text(doc.text!, doc.marks);
  const children: Node[] = [];
  doc.forEach(child => children.push(dragLayoutSource(child)));
  return doc.type.create(doc.attrs, children, doc.marks);
}

type Box = { left: number; top: number; width: number; height: number };
type Frame = Map<number, Box>;
const ease = "cubic-bezier(0.16, 1, 0.3, 1)";

function elements(view: EditorView, source: Node): Map<number, HTMLElement> {
  return elementsAt(view, previewRowPairs(source, view.state.doc));
}

function elementsAt(view: EditorView, pairs: Array<{ from: number; to: number }>): Map<number, HTMLElement> {
  return new Map(pairs.flatMap(pair => {
    const dom = view.nodeDOM(pair.to);
    return dom instanceof HTMLElement ? [[pair.from, dom] as const] : [];
  }));
}

function measure(rows: Map<number, HTMLElement>): Frame {
  return new Map([...rows].map(([key, el]) => {
    const { left, top, width, height } = el.getBoundingClientRect();
    return [key, { left, top, width, height }];
  }));
}

/** Preview uses the same NodeViews in an inert editor. The live view never receives its transactions. */
export class DragPreview {
  readonly source: Node;
  readonly layoutSource: Node;
  readonly roots: number[];
  private readonly mirror: EditorView;
  private readonly animations = new Set<Animation>();
  private readonly origin: Frame;
  private readonly baseTop: number;
  private readonly baseLeft: number;
  private closed = false;

  constructor(private readonly live: EditorView, anchor: number, head: number, plugins: Plugin[]) {
    this.source = live.state.doc;
    this.layoutSource = dragLayoutSource(this.source);
    this.roots = spanRoots(this.source, anchor, head).map(row => row.pos);
    this.origin = measure(elements(live, this.source));
    const bounds = live.dom.getBoundingClientRect();
    this.baseTop = bounds.top;
    this.baseLeft = bounds.left;
    const nodeViews = { ...live.props.nodeViews };
    const atoms = new Map<Node, HTMLElement>();
    this.layoutSource.descendants((node, pos) => {
      if (!node.isAtom || node.isText) return;
      const dom = live.nodeDOM(pos);
      if (dom instanceof HTMLElement) atoms.set(node, dom);
    });
    for (const node of atoms.keys()) {
      const render = live.props.nodeViews?.[node.type.name];
      nodeViews[node.type.name] = (next, view, getPos, decorations, innerDecorations) => {
        const existing = atoms.get(next);
        if (existing) return { dom: existing.cloneNode(true) as HTMLElement, ignoreMutation: () => true };
        return render!(next, view, getPos, decorations, innerDecorations);
      };
    }
    this.mirror = new EditorView(live.dom.parentElement!, {
      state: EditorState.create({ doc: this.layoutSource, plugins }),
      editable: () => false,
      nodeViews,
      attributes: { class: "pages-drag-preview", "aria-hidden": "true" },
      decorations: state => DecorationSet.create(state.doc, previewRowPairs(this.layoutSource, state.doc).map(pair => {
        const node = state.doc.nodeAt(pair.to)!;
        return Decoration.node(pair.to, pair.to + node.nodeSize, {
          "data-pages-preview-source": String(pair.from),
          ...(this.roots.includes(pair.from) ? { class: "pages-drag-slot" } : {}),
        });
      })),
      dispatchTransaction: () => {},
    });
    this.mirror.dom.inert = true;
    live.dom.classList.add("pages-drag-source");
  }

  /** Natural source geometry, unaffected by the preview's animated/reflowing rows. */
  sourceBox(pos: number): Box | null {
    const box = this.origin.get(pos);
    if (!box) return null;
    const rect = this.live.dom.getBoundingClientRect();
    return { ...box, left: box.left + rect.left - this.baseLeft, top: box.top + rect.top - this.baseTop,
      width: box.width, height: box.height };
  }

  private cancelAnimations(): void {
    this.animations.forEach(animation => animation.cancel());
    this.animations.clear();
  }

  private animate(rows: Map<number, HTMLElement>, before: Frame, duration: number, landing = false): void {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const after = measure(rows);
    const shifts = new Map<HTMLElement, { x: number; y: number }>();
    for (const [key, el] of rows) {
      if (!landing && this.roots.some(pos => key >= pos && key < pos + this.source.nodeAt(pos)!.nodeSize)) continue;
      const old = before.get(key), next = after.get(key);
      if (old && next) shifts.set(el, { x: old.left - next.left, y: old.top - next.top });
    }
    for (const [el, shift] of shifts) {
      let parent = el.parentElement;
      while (parent && !shifts.has(parent)) parent = parent.parentElement;
      const inherited = parent ? shifts.get(parent) : null;
      const x = shift.x - (inherited?.x ?? 0), y = shift.y - (inherited?.y ?? 0);
      if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) continue;
      const animation = el.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: "translate(0, 0)" }], { duration, easing: ease });
      this.animations.add(animation);
      void animation.finished.then(() => this.animations.delete(animation), () => this.animations.delete(animation));
    }
  }

  update(doc: Node): void {
    if (doc.eq(this.mirror.state.doc)) return;
    const before = measure(elements(this.mirror, this.layoutSource));
    this.cancelAnimations();
    this.mirror.updateState(EditorState.create({ doc, plugins: this.mirror.state.plugins }));
    this.animate(elements(this.mirror, this.layoutSource), before, 180);
  }

  slot(): Box | null {
    const rows = elements(this.mirror, this.layoutSource);
    const boxes = this.roots.flatMap(pos => {
      const el = rows.get(pos);
      return el ? [el.getBoundingClientRect()] : [];
    });
    if (!boxes.length) return null;
    const left = Math.min(...boxes.map(box => box.left)), top = Math.min(...boxes.map(box => box.top));
    return { left, top, width: Math.max(...boxes.map(box => box.right)) - left,
      height: Math.max(...boxes.map(box => box.bottom)) - top };
  }

  finish(commit: () => void, ghost: Box | null): void {
    const rows = elements(this.mirror, this.layoutSource);
    const before = measure(rows);
    const slot = this.slot();
    if (ghost && slot) {
      // Move each selected subtree together from the pointer into its final slot.
      for (const [key, box] of before) {
        if (this.roots.some(pos => key >= pos && key < pos + this.source.nodeAt(pos)!.nodeSize)) {
          before.set(key, { ...box, left: box.left + ghost.left - slot.left, top: box.top + ghost.top - slot.top });
        }
      }
    }
    this.cancelAnimations();
    commit();
    const pairs = this.live.state.doc.eq(this.mirror.state.doc)
      ? previewRowPairs(this.layoutSource, this.mirror.state.doc)
      : previewRowPairs(this.source, this.live.state.doc);
    this.mirror.destroy();
    this.mirror.dom.remove();
    this.closed = true;
    this.live.dom.classList.remove("pages-drag-source");
    this.animate(elementsAt(this.live, pairs), before, 150, true);
  }

  destroy(): void {
    this.cancelAnimations();
    if (!this.closed) {
      this.mirror.destroy();
      this.mirror.dom.remove();
      this.closed = true;
    }
    this.live.dom.classList.remove("pages-drag-source");
  }
}

import { Fragment, type Node } from "prosemirror-model";
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { pagesSchema } from "./schema.js";

/**
 * What the person has in hand in a Pages document, and the ranges they acted on (specs/contextual-interaction §4.1).
 *
 * The editor reports its focus whenever it changes. When the person clicks something outside the editor — the bar, an
 * Assistant card, the writing menu — the range is *frozen*: it is mapped through every later edit and stays
 * highlighted, and anything applied afterwards goes to that frozen range, never to wherever the caret is by then. If
 * the frozen text itself was changed in the meantime, applying is refused rather than written somewhere else.
 */

export type PagesFocusRole = "heading" | "paragraph" | "list" | "task" | "table" | "quote" | "code";
export type PagesFocusActivity = "browsing" | "selecting" | "editing" | "comparing" | "completed";
export type PagesFocusGranularity = "word" | "range" | "block" | "blocks";

export interface PagesFocusTarget {
  readonly kind: "text_range" | "block";
  readonly role: PagesFocusRole;
  readonly text: string;
  readonly truncated?: boolean;
  readonly anchor: number;
  readonly head: number;
}

export interface PagesFocus {
  /** Local identity of this focus; the surface adds the document id and version around it. */
  readonly local_id: string;
  readonly activity: PagesFocusActivity;
  readonly granularity: PagesFocusGranularity;
  readonly targets: readonly PagesFocusTarget[];
  readonly surroundings: { readonly heading_path: readonly string[]; readonly before?: string; readonly after?: string };
}

interface FrozenRange { readonly token: string; readonly from: number; readonly to: number; readonly text: string; readonly quiet?: boolean }
interface FocusPluginState {
  readonly frozen: readonly FrozenRange[];
  /** A second range the person set aside to compare with the current selection (Alt + select). */
  readonly compare: { readonly from: number; readonly to: number } | null;
  readonly lastEditAt: number;
  /** A task the person just ticked: for a short while the focus is “刚完成一步” on it. */
  readonly completed: { readonly from: number; readonly to: number; readonly at: number } | null;
}

const COMPLETED_WINDOW_MS = 6000;

/**
 * A task this transaction ticked: a task item, inside the changed ranges, checked now and unchecked at the same place
 * before. Matching by position (mapped back through the transaction) rather than by text means renaming a task that
 * was already checked is not a completion, and only the touched part of the document is scanned.
 */
function tickedTask(tr: Transaction, before: Node, after: Node): { from: number; to: number } | null {
  const ranges: [number, number][] = [];
  tr.mapping.maps.forEach((map, index) => map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
    const rest = tr.mapping.slice(index + 1);
    ranges.push([rest.map(newStart, -1), rest.map(newEnd, 1)]);
  }));
  const back = tr.mapping.invert();
  let found: { from: number; to: number } | null = null;
  for (const [from, to] of ranges) {
    after.nodesBetween(Math.max(0, from - 1), Math.min(after.content.size, to + 1), (node, pos) => {
      if (found) return false;
      if (node.type.name !== "task_item") return true;
      if (node.attrs.checked) {
        const previous = before.nodeAt(back.map(pos, 1));
        if (previous?.type.name === "task_item" && !previous.attrs.checked) found = { from: pos + 1, to: pos + node.nodeSize - 1 };
      }
      return false;
    });
    if (found) break;
  }
  return found;
}
type FocusMeta = { freeze: FrozenRange } | { release: string } | { compare: { from: number; to: number } | null };

export const pagesFocusKey = new PluginKey<FocusPluginState>("pages-focus");

const TARGET_LIMIT = 2000;
const AROUND = 300;
const EDITING_WINDOW_MS = 2500;

function clip(text: string, max = TARGET_LIMIT): { text: string; truncated?: boolean } {
  return text.length <= max ? { text } : { text: text.slice(0, max), truncated: true };
}

function hash(value: string): string {
  let h = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function roleAt(state: EditorState, pos: number): PagesFocusRole {
  const $pos = state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const name = $pos.node(depth).type.name;
    if (name === "heading") return "heading";
    if (name === "task_item") return "task";
    if (name === "list_item") return "list";
    if (name === "table_cell" || name === "table_header") return "table";
    if (name === "blockquote") return "quote";
    if (name === "code_block") return "code";
  }
  return "paragraph";
}

function roleOfNode(node: Node): PagesFocusRole {
  const name = node.type.name;
  if (name === "heading") return "heading";
  if (name === "task_list" || name === "task_item") return "task";
  if (name === "bullet_list" || name === "ordered_list" || name === "list_item") return "list";
  if (name === "table") return "table";
  if (name === "blockquote") return "quote";
  if (name === "code_block") return "code";
  return "paragraph";
}

function headingPath(doc: Node, pos: number): string[] {
  const stack: { level: number; text: string }[] = [];
  doc.forEach((node, offset) => {
    if (offset >= pos || node.type.name !== "heading") return;
    const level = Number(node.attrs.level) || 1;
    while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
    stack.push({ level, text: node.textContent.trim().slice(0, 120) });
  });
  return stack.map(item => item.text).filter(Boolean);
}

/** Textblocks touched by [from, to), with the part of each inside the range. */
function blocksIn(doc: Node, from: number, to: number): { from: number; to: number; text: string; role: PagesFocusRole }[] {
  const out: { from: number; to: number; text: string; role: PagesFocusRole }[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    const start = Math.max(from, pos + 1), end = Math.min(to, pos + node.nodeSize - 1);
    if (end > start) out.push({ from: start, to: end, text: doc.textBetween(start, end, "\n"), role: "paragraph" });
    return false;
  });
  return out;
}

function isWord(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  return /[㐀-鿿]/.test(trimmed) ? trimmed.length <= 8 : trimmed.length <= 32;
}

/** Read the focus from the editor state. `null` means nothing in hand: the page as a whole. */
export function readPagesFocus(state: EditorState, now = Date.now()): PagesFocus | null {
  const plugin = pagesFocusKey.getState(state);
  const selection = state.selection;
  const around = (from: number, to: number) => ({
    heading_path: headingPath(state.doc, from),
    before: state.doc.textBetween(Math.max(0, from - AROUND), from, "\n").slice(-AROUND) || undefined,
    after: state.doc.textBetween(to, Math.min(state.doc.content.size, to + AROUND), "\n").slice(0, AROUND) || undefined,
  });
  let focus: Omit<PagesFocus, "local_id"> | null = null;
  const done = plugin?.completed && now - plugin.completed.at < COMPLETED_WINDOW_MS ? plugin.completed : null;
  if (done && done.to > done.from) {
    const text = state.doc.textBetween(done.from, done.to, "\n");
    focus = { activity: "completed", granularity: "block", targets: [{ kind: "block", role: "task", ...clip(text), anchor: done.from, head: done.to }], surroundings: around(done.from, done.to) };
  } else if (selection instanceof NodeSelection && selection.node.isBlock) {
    const node = selection.node;
    focus = { activity: "selecting", granularity: "block", targets: [{ kind: "block", role: roleOfNode(node), ...clip(node.textContent), anchor: selection.from, head: selection.to }], surroundings: around(selection.from, selection.to) };
  } else if (selection instanceof TextSelection && !selection.empty) {
    const { from, to } = selection;
    const blocks = blocksIn(state.doc, from, to).filter(block => block.text.trim());
    if (blocks.length > 1) {
      focus = { activity: "selecting", granularity: "blocks",
        targets: blocks.slice(0, 8).map(block => ({ kind: "text_range" as const, role: roleAt(state, block.from), ...clip(block.text), anchor: block.from, head: block.to })),
        surroundings: around(from, to) };
    } else {
      const text = state.doc.textBetween(from, to, "\n");
      if (!text.trim()) return null;
      focus = { activity: "selecting", granularity: isWord(text) ? "word" : "range",
        targets: [{ kind: "text_range", role: roleAt(state, from), ...clip(text), anchor: from, head: to }], surroundings: around(from, to) };
    }
  } else if (selection.empty && plugin && now - plugin.lastEditAt < EDITING_WINDOW_MS) {
    const $pos = selection.$from;
    if ($pos.parent.isTextblock && $pos.parent.textContent.trim()) {
      const from = $pos.start(), to = $pos.end();
      focus = { activity: "editing", granularity: "block",
        targets: [{ kind: "text_range", role: roleAt(state, from), ...clip($pos.parent.textContent), anchor: from, head: to }], surroundings: around(from, to) };
    }
  }
  if (plugin?.compare && focus && focus.activity === "selecting") {
    const { from, to } = plugin.compare;
    const text = state.doc.textBetween(from, to, "\n");
    if (text.trim()) {
      focus = { ...focus, activity: "comparing", granularity: "blocks",
        targets: [{ kind: "text_range" as const, role: roleAt(state, from), ...clip(text), anchor: from, head: to }, ...focus.targets].slice(0, 8) };
    }
  }
  if (!focus) return null;
  const local_id = hash(JSON.stringify([focus.activity, focus.granularity, focus.targets.map(target => [target.anchor, target.head, target.text])]));
  return { local_id, ...focus };
}

export interface PagesFocusPluginOptions {
  /** Called when the focus changes (by identity), and with `null` when nothing is in hand. */
  readonly onFocus?: (focus: PagesFocus | null) => void;
}

/** Tracks edits, frozen ranges and the compare range, and reports focus changes. */
export function pagesFocusPlugin(options: PagesFocusPluginOptions = {}): Plugin<FocusPluginState> {
  let lastId: string | null | undefined;
  let editTimer: ReturnType<typeof setTimeout> | undefined;
  const report = (view: EditorView) => {
    const focus = readPagesFocus(view.state);
    const id = focus?.local_id ?? null;
    if (id === lastId) return;
    lastId = id;
    options.onFocus?.(focus);
  };
  return new Plugin<FocusPluginState>({
    key: pagesFocusKey,
    state: {
      init: () => ({ frozen: [], compare: null, lastEditAt: 0, completed: null }),
      apply(tr, value, oldState, newState) {
        const meta = tr.getMeta(pagesFocusKey) as FocusMeta | undefined;
        let frozen = value.frozen, compare = value.compare, lastEditAt = value.lastEditAt, completed = value.completed;
        if (tr.docChanged) {
          frozen = frozen.map(range => ({ ...range, from: tr.mapping.map(range.from, 1), to: tr.mapping.map(range.to, -1) }));
          compare = compare ? { from: tr.mapping.map(compare.from, 1), to: tr.mapping.map(compare.to, -1) } : null;
          if (compare && compare.to <= compare.from) compare = null;
          completed = completed ? { ...completed, from: tr.mapping.map(completed.from, 1), to: tr.mapping.map(completed.to, -1) } : null;
          const ticked = tickedTask(tr, oldState.doc, newState.doc);
          if (ticked) completed = { ...ticked, at: Date.now() };
          else if (tr.getMeta("addToHistory") !== false) { lastEditAt = Date.now(); completed = null; }
        }
        if (meta && "freeze" in meta) frozen = [...frozen.filter(range => range.token !== meta.freeze.token), meta.freeze];
        if (meta && "release" in meta) frozen = frozen.filter(range => range.token !== meta.release);
        if (meta && "compare" in meta) compare = meta.compare;
        if (!tr.docChanged && tr.selectionSet && !newState.selection.empty) completed = null;
        return { frozen, compare, lastEditAt, completed };
      },
    },
    props: {
      decorations(state) {
        const plugin = pagesFocusKey.getState(state);
        if (!plugin) return null;
        const decorations = [
          ...plugin.frozen.filter(range => range.to > range.from && !range.quiet).map(range => Decoration.inline(range.from, range.to, { class: "pages-focus-frozen", "data-focus-token": range.token })),
          ...(plugin.compare && plugin.compare.to > plugin.compare.from ? [Decoration.inline(plugin.compare.from, plugin.compare.to, { class: "pages-focus-compare" })] : []),
        ];
        return decorations.length ? DecorationSet.create(state.doc, decorations) : null;
      },
      handleDOMEvents: {
        // Alt + mouse up: keep the current selection aside as the first side of a comparison.
        mouseup(view, event) {
          if (!(event as MouseEvent).altKey) return false;
          const { from, to, empty } = view.state.selection;
          if (empty) return false;
          view.dispatch(view.state.tr.setMeta(pagesFocusKey, { compare: { from, to } } satisfies FocusMeta));
          return false;
        },
      },
    },
    view(view) {
      // Without a listener nobody needs the focus: skip reading it on every change (frozen ranges still work).
      if (!options.onFocus) return {};
      report(view);
      return {
        update(current, previous) {
          if (current.state.doc !== previous.doc || !current.state.selection.eq(previous.selection)
            || pagesFocusKey.getState(current.state)?.compare !== pagesFocusKey.getState(previous)?.compare) {
            report(current);
            // Editing ends when typing pauses; report again so the focus drops back to the page.
            if (editTimer) clearTimeout(editTimer);
            if (current.state.doc !== previous.doc) {
              const window = pagesFocusKey.getState(current.state)?.completed ? COMPLETED_WINDOW_MS : EDITING_WINDOW_MS;
              editTimer = setTimeout(() => report(current), window + 50);
            }
          }
        },
        destroy() { if (editTimer) clearTimeout(editTimer); },
      };
    },
  });
}

export interface FrozenPagesFocus { readonly token: string; readonly from: number; readonly to: number; readonly text: string }

/** Freeze the current selection (or the block being edited). Returns null when nothing is in hand. */
export function freezePagesFocus(view: EditorView, token: string, range?: { from: number; to: number }, quiet = false): FrozenPagesFocus | null {
  const { selection } = view.state;
  let from = range?.from ?? selection.from, to = range?.to ?? selection.to;
  if (!range && selection.empty) {
    const $pos = selection.$from;
    if (!$pos.parent.isTextblock) return null;
    from = $pos.start(); to = $pos.end();
  }
  if (to <= from) return null;
  const frozen = { token, from, to, text: view.state.doc.textBetween(from, to, "\n"), ...(quiet ? { quiet } : {}) };
  view.dispatch(view.state.tr.setMeta(pagesFocusKey, { freeze: frozen } satisfies FocusMeta).setMeta("addToHistory", false));
  return frozen;
}

/** Where a frozen range is now, and whether its text is still what the person acted on. */
export function resolvePagesFrozen(view: EditorView, token: string): { from: number; to: number; text: string; intact: boolean } | null {
  const range = pagesFocusKey.getState(view.state)?.frozen.find(item => item.token === token);
  if (!range) return null;
  const text = range.to > range.from ? view.state.doc.textBetween(range.from, range.to, "\n") : "";
  return { from: range.from, to: range.to, text, intact: text === range.text };
}

export function releasePagesFrozen(view: EditorView, token: string): void {
  if (!pagesFocusKey.getState(view.state)?.frozen.some(item => item.token === token)) return;
  view.dispatch(view.state.tr.setMeta(pagesFocusKey, { release: token } satisfies FocusMeta).setMeta("addToHistory", false));
}

export function clearPagesCompare(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(pagesFocusKey, { compare: null } satisfies FocusMeta).setMeta("addToHistory", false));
}

function paragraph(text: string): Node {
  return pagesSchema.nodes.paragraph.create(null, text ? pagesSchema.text(text) : undefined);
}

/**
 * Write text for a frozen range: replace it, or insert after it. Refuses when the frozen text was changed meanwhile,
 * so a late result can never land on another part of the document. Within one paragraph the text replaces inline;
 * across paragraphs it becomes paragraphs.
 */
export function applyToPagesFrozen(view: EditorView, token: string, text: string, mode: "replace" | "insert_after" | "delete"):
  { ok: true; from: number; to: number } | { ok: false; reason: "missing" | "changed" } {
  const at = resolvePagesFrozen(view, token);
  if (!at) return { ok: false, reason: "missing" };
  if (!at.intact) return { ok: false, reason: "changed" };
  const $from = view.state.doc.resolve(at.from), $to = view.state.doc.resolve(at.to);
  const clean = text.trim();
  const inline = $from.sameParent($to) && $from.parent.isTextblock && !/\n/.test(clean);
  const blocks = () => {
    const parts = text.split(/\n+/).map(part => part.trim()).filter(Boolean).map(paragraph);
    return Fragment.from(parts.length ? parts : [paragraph(clean)]);
  };
  let tr = view.state.tr.setMeta(pagesFocusKey, { release: token } satisfies FocusMeta);
  let from: number, to: number;
  if (mode === "delete") {
    tr = tr.delete(at.from, at.to);
    from = to = tr.mapping.map(at.from, -1);
  } else if (mode === "replace" && inline) {
    tr = tr.insertText(clean, at.from, at.to);
    from = at.from; to = at.from + clean.length;
  } else if (mode === "replace") {
    tr = tr.replaceWith(at.from, at.to, blocks());
    from = tr.mapping.map(at.from, -1); to = tr.mapping.map(at.to, 1);
  } else {
    // A block selection ends between top-level blocks (depth 0): that boundary already is the place after it.
    const after = $to.depth === 0 ? at.to : $to.after(1), fragment = blocks();
    tr = tr.insert(after, fragment);
    from = after; to = after + fragment.size;
  }
  view.dispatch(tr.scrollIntoView());
  return { ok: true, from, to };
}

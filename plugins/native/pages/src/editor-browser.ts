import { baseKeymap, chainCommands, setBlockType } from "prosemirror-commands";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { history, redo, undo } from "prosemirror-history";
import { undoInputRule } from "prosemirror-inputrules";
import { confirmCodeFence, pagesInputRules } from "./input-rules.js";
import { commitDrag, DragPreview } from "./drag-preview.js";
import { keymap } from "prosemirror-keymap";
import { DOMSerializer, Fragment, Node, Slice } from "prosemirror-model";
import { splitListItem } from "prosemirror-schema-list";
import { Command, EditorState, NodeSelection, Plugin, PluginKey, TextSelection, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet, EditorView, ViewMutationRecord } from "prosemirror-view";
import { actionItemsFromText } from "./ai.js";
import {
  blockPos,
  deleteBlock,
  deleteRow,
  deleteSpan,
  duplicateBlock,
  duplicateEnclosingRow,
  enterHeading,
  duplicateRow,
  duplicateSpan,
  enterInToggle,
  exitWrappedBlock,
  indentListItem,
  indentUnderPrevious,
  insertCodeIndent,
  insertHardBreak,
  insertImage,
  setImageWidth,
  setImageCaption,
  setBookmarkTitle,
  insertSlashBelow,
  leaveCodeDown,
  leaveEmptyCodeLine,
  leaveCodeUp,
  continuePastEnd,
  continueBeforeStart,
  focusBelowContent,
  selectNeighborAtom,
  linkAt,
  moveColumnEdge,
  outdentListItem,
  outdentFromContainer,
  removeCodeIndent,
  revealHeading,
  headingIndexAt,
  listKindAt,
  headingLevelAt,
  addColumn,
  nudgeColumnShare,
  applyListSelection,
  applyHeading,
  applySlash,
  commitGap,
  selectBlockThenAll,
  selectEnclosingBlock,
  replaceSelectedBlock,
  replaceSpan,
  replaceSpanWithNodes,
  deleteSelectedBlock,
  docStart,
  tripleClickSelection,
  moveSelectedBlock,
  collapseSelectedBlock,
  insertAfterSelectedBlock,
  insertAfterSpan,
  hardBreakAtSpanEnd,
  menuKey,
  hoverMenuIndex,
  popEscape,
  blockMenuKey,
  handleAnchor,
  hoverPosAfter,
  blockSpanStep,
  blockSpanFromSelection,
  blockSpanFromRange,
  blockSpanToRow,
  blockMenuShortcut,
  blockMenuTarget,
  spanIsGroup,
  slashSession,
  dismissedMenuRange,
  splitTaskItem,
  setCalloutStyle,
  setRowsTone,
  setToggleOpen,
  toggleTaskChecked,
  flipTaskAt,
  toggleTaskGroup,
  setLink,
  setTone,
  toggleInlineMark,
  toggleSpanMark,
  markCovers,
  toneAt,
  turnRowInto,
  turnSpanInto,
  turnGroup,
  clearSpanMarks,
  clearInlineMarks,
  collapseEmptyColumn,
  commentAt,
  setComment,
  unwrapAtStart,
  unwrapColumns,
} from "./commands.js";
import { acceptedImageFile, bookmarkLabel, imageAlt, linkClickOpens, safePagesBookmarkTitle, safePagesHref, safePagesImageCaption, safePagesImageSrc, safePagesImageWidth } from "./link.js";
import { toneFromCssColor } from "./tone.js";
import { calloutIconFor, PAGES_CALLOUT_ICONS, safePagesCalloutTone } from "./callout.js";
import { highlightRanges } from "./code-highlight.js";
import { PAGES_CODE_LANGUAGES, safePagesLanguage } from "./code-language.js";
import { findHits, replaceAllFindHits, replaceFindHit, stepFindHit } from "./find.js";
import { placeFloating, rowGapAt, scrollChildIntoView, scrollShouldFollow, type FloatingAnchor } from "./floating.js";
import { markdownLooksStructured, nodesForSpanPaste, pasteMarkdown, pastePlain, pasteUrl } from "./paste-markdown.js";
import { nodesToMarkdown } from "./to-markdown.js";
import { pasteHtml, type PasteLeaf } from "./paste-html.js";
import { addTableColumn, addTableRow, atLastTableCell, deleteTableColumn, deleteTableRow, moveTableColumn, moveTableEdge, moveTableRow, setColumnWidth, tableHit, toggleHeaderRow } from "./table-edit.js";
import { blockPlaceholder } from "./placeholder.js";
import { dragRows, dropLevelRange, nodesInSpan, nudgeSpan, previewCopySpan, previewSpan, spanRoots, spanRows, type DragRow } from "./reorder.js";
import { PAGES_TONES } from "./tone.js";
import { emptyDoc, nodeFromUnknown, pagesSchema, safePagesColumnShare, safePagesColumnWidth } from "./schema.js";

export { emptyDoc, pagesSchema };

export interface PagesEditorHandle {
  readonly view: EditorView;
  readonly toolbar: HTMLElement;
}

export interface PagesListItem {
  readonly id: string;
  readonly title: string;
}

export interface PagesEditorMountOptions {
  doc?: unknown;
  onChange?: () => void;
  translate?: (value: string) => string;
  pages?: () => readonly PagesListItem[];
  onOpenPage?: (id: string) => void;
  runAi?: (input: { command: string; text: string; style?: string }) => Promise<{ text: string; stub?: boolean }>;
  onCreateFromAi?: (input: { title: string; text: string }) => Promise<void>;
}

type Translate = (value: string) => string;

const slashKey = new PluginKey<{ open: boolean; pos: number; query: string; index: number }>("pages-slash");
const mentionKey = new PluginKey<{ open: boolean; from: number; query: string; index: number }>("pages-mention");
const chromeKey = new PluginKey<{ after: number }>("pages-chrome");
interface FindBar {
  open: boolean;
  query: string;
  replacement: string;
  index: number;
}

const findKey = new PluginKey<FindBar>("pages-find");
type PagesHover = { pos: number; dragging: boolean; anchor: number; head: number; menuTick: number };
const hoverKey = new PluginKey<PagesHover>("pages-hover");
const EMPTY_HOVER: PagesHover = { pos: -1, dragging: false, anchor: -1, head: -1, menuTick: 0 };
const codeHighlightKey = new PluginKey<DecorationSet>("pages-code-highlight");

function commandToggle(markName: string): Command {
  return (state, dispatch, editor) => {
    if (editor) {
      const group = hoveredGroup(editor);
      if (group) {
        const tr = toggleSpanMark(state, group.anchor, group.head, markName);
        if (!tr) return false;
        if (dispatch) dispatch(tr.scrollIntoView());
        return true;
      }
    }
    return toggleInlineMark(markName)(state, dispatch);
  };
}

export function toHTML(value: unknown): string {
  const node = nodeFromUnknown(value);
  const serializer = DOMSerializer.fromSchema(pagesSchema);
  const wrap = document.createElement("div");
  wrap.append(serializer.serializeFragment(node.content));
  return wrap.innerHTML;
}

function headingCommand(level: 1 | 2 | 3): Command {
  return (state, dispatch) => {
    const grouped = applyHeading(state, level);
    if (grouped) {
      dispatch?.(grouped);
      return true;
    }
    return setBlockType(pagesSchema.nodes.heading, { level })(state, dispatch);
  };
}

function t(translate: Translate | undefined, value: string): string {
  return translate ? translate(value) : value;
}

function dsIcon(name: string): string {
  return `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

const CLIP_IMAGE = /^image\/(png|jpeg|gif|webp)$/iu;

function clipboardImage(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of data.items) {
    if (item.kind === "file" && CLIP_IMAGE.test(item.type)) return item.getAsFile();
  }
  return null;
}

function readClipboardImage(file: File, apply: (src: string) => void): void {
  const reader = new FileReader();
  reader.onload = () => {
    const src = typeof reader.result === "string" ? safePagesImageSrc(reader.result) : "";
    if (src) apply(src);
  };
  reader.readAsDataURL(file);
}

function leafFromDom(node: globalThis.Node): PasteLeaf | string | null {
  if (node.nodeType === 3) return node.textContent || null;
  if (node.nodeType !== 1) return null;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "script" || tag === "style") return null;
  const children: Array<PasteLeaf | string> = [];
  el.childNodes.forEach((child) => {
    const next = leafFromDom(child);
    if (typeof next === "string") children.push(next);
    else if (next) children.push(next);
  });
  const style = el.getAttribute("style") ?? "";
  const painted = (prop: string) => {
    const match = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i").exec(`;${style}`);
    return toneFromCssColor(match?.[1] ?? "");
  };
  const ink = el.getAttribute("data-pages-ink") ? toneFromCssColor(el.getAttribute("data-pages-ink")) : painted("color");
  const wash = el.getAttribute("data-pages-wash") ? toneFromCssColor(el.getAttribute("data-pages-wash")) : painted("background-color");
  return {
    tag,
    href: el.getAttribute("href") ?? undefined,
    src: el.getAttribute("src") ?? undefined,
    ...(ink ? { ink } : {}),
    ...(wash ? { wash } : {}),
    ...(el.hasAttribute("data-pages-bookmark") ? { bookmark: true } : {}),
    ...(el.getAttribute("alt") ? { alt: el.getAttribute("alt") ?? "" } : {}),
    ...(el.hasAttribute("data-pages-task") ? { task: true, checked: el.getAttribute("data-checked") === "true" } : {}),
    ...(el.hasAttribute("data-pages-tasks") ? { tasks: true } : {}),
    children,
  };
}

function overlayRoot(): HTMLElement {
  return document.querySelector("[data-pages-stage-workspace]")
    ?? document.querySelector("[data-pages=workbench]")
    ?? document.body;
}

function placeOverlay(el: HTMLElement, anchor: FloatingAnchor, mode: "below" | "above" | "beside"): void {
  const stage = el.closest("[data-pages-stage-workspace]")?.getBoundingClientRect();
  const left = Math.max(0, stage?.left ?? 0);
  const top = Math.max(0, stage?.top ?? 0);
  const width = Math.min(window.innerWidth, stage?.right ?? window.innerWidth) - left;
  const height = Math.min(window.innerHeight, stage?.bottom ?? window.innerHeight) - top;
  // Fit the stage, but never grow past the overlay's own CSS cap (the slash menu stays a compact scroller).
  el.style.maxWidth = ""; el.style.maxHeight = "";
  const declared = getComputedStyle(el);
  const cap = (value: string) => { const px = parseFloat(value); return Number.isFinite(px) ? px : Infinity; };
  el.style.maxWidth = Math.max(0, Math.min(width - 16, cap(declared.maxWidth))) + "px";
  el.style.maxHeight = Math.max(0, Math.min(height - 16, cap(declared.maxHeight))) + "px";
  const box = el.getBoundingClientRect();
  const spot = placeFloating(
    { left: anchor.left - left, right: anchor.right - left, top: anchor.top - top, bottom: anchor.bottom - top },
    { width: box.width, height: box.height },
    { width, height },
    mode,
  );
  el.style.left = left + spot.left + "px";
  el.style.top = top + spot.top + "px";
}

function followScroll(panel: Element, run: () => void): () => void {
  const onScroll = (event: Event) => {
    if (!scrollShouldFollow(event.target, panel)) return;
    run();
  };
  document.addEventListener("scroll", onScroll, true);
  return () => document.removeEventListener("scroll", onScroll, true);
}

function keepSelectedVisible(menu: HTMLElement): void {
  const current = menu.querySelector(".is-on");
  if (!(current instanceof HTMLElement)) return;
  menu.scrollTop = scrollChildIntoView(
    { scrollTop: menu.scrollTop, clientHeight: menu.clientHeight },
    { offsetTop: current.offsetTop, offsetHeight: current.offsetHeight },
  );
}

function paragraphNode(text = ""): Node {
  return text
    ? pagesSchema.nodes.paragraph.create(null, pagesSchema.text(text))
    : pagesSchema.nodes.paragraph.create();
}

function blockFor(id: string): Node {
  const s = pagesSchema;
  if (id === "heading1") return s.nodes.heading.create({ level: 1 });
  if (id === "heading2") return s.nodes.heading.create({ level: 2 });
  if (id === "heading3") return s.nodes.heading.create({ level: 3 });
  if (id === "bullet_list") return s.nodes.bullet_list.create(null, s.nodes.list_item.create(null, paragraphNode()));
  if (id === "ordered_list") return s.nodes.ordered_list.create({ order: 1 }, s.nodes.list_item.create(null, paragraphNode()));
  if (id === "task_list") return s.nodes.task_list.create(null, s.nodes.task_item.create({ checked: false }, paragraphNode()));
  if (id === "callout") return s.nodes.callout.create({ tone: "info" }, paragraphNode());
  if (id === "blockquote") return s.nodes.blockquote.create(null, paragraphNode());
  if (id === "code_block") return s.nodes.code_block.create();
  if (id === "toggle") return s.nodes.toggle.create({ open: true }, [paragraphNode(), paragraphNode()]);
  if (id === "horizontal_rule") return s.nodes.horizontal_rule.create();
  if (id === "toc") return s.nodes.toc.create();
  if (id === "table") {
    const header = s.nodes.table_row.create(null, [
      s.nodes.table_header.create(null, paragraphNode()),
      s.nodes.table_header.create(null, paragraphNode()),
    ]);
    const row = s.nodes.table_row.create(null, [
      s.nodes.table_cell.create(null, paragraphNode()),
      s.nodes.table_cell.create(null, paragraphNode()),
    ]);
    return s.nodes.table.create(null, [header, row]);
  }
  if (id === "page_ref") return s.nodes.page_ref.create({ page_id: "", title: "" });
  if (id === "task_card") return s.nodes.task_card.create({ title: "", description: "", status: "todo", due: "" });
  if (id === "event_card") return s.nodes.event_card.create({ title: "", at: new Date().toISOString().slice(0, 10) });
  if (id === "calendar") return s.nodes.calendar.create();
  if (id === "columns") {
    return s.nodes.column_list.create(null, [
      s.nodes.column.create(null, paragraphNode()),
      s.nodes.column.create(null, paragraphNode()),
    ]);
  }
  return paragraphNode();
}

function slashItems(translate: Translate | undefined) {
  return [
    { id: "paragraph", icon: "text", group: "basic", label: t(translate, "段落"), hint: t(translate, "正文") },
    { id: "heading1", icon: "hash", group: "basic", label: t(translate, "标题 1"), hint: "H1" },
    { id: "heading2", icon: "hash", group: "basic", label: t(translate, "标题 2"), hint: "H2" },
    { id: "heading3", icon: "hash", group: "basic", label: t(translate, "标题 3"), hint: "H3" },
    { id: "bullet_list", icon: "rows", group: "basic", label: t(translate, "无序列表"), hint: t(translate, "圆点") },
    { id: "ordered_list", icon: "list-ordered", group: "basic", label: t(translate, "有序列表"), hint: "1." },
    { id: "task_list", icon: "check", group: "basic", label: t(translate, "清单"), hint: t(translate, "待办") },
    { id: "callout", icon: "info", group: "basic", label: t(translate, "Callout"), hint: t(translate, "提示块") },
    { id: "blockquote", icon: "message", group: "basic", label: t(translate, "引用"), hint: t(translate, "摘一句") },
    { id: "code_block", icon: "code", group: "basic", label: t(translate, "代码"), hint: t(translate, "等宽") },
    { id: "table", icon: "grid", group: "basic", label: t(translate, "表"), hint: t(translate, "两列表") },
    { id: "columns", icon: "columns", group: "basic", label: t(translate, "分栏"), hint: t(translate, "并排") },
    { id: "toggle", icon: "chevron-right", group: "basic", label: t(translate, "Toggle"), hint: t(translate, "折叠") },
    { id: "image", icon: "image", group: "basic", label: t(translate, "图片"), hint: t(translate, "上传") },
    { id: "horizontal_rule", icon: "minus", group: "basic", label: t(translate, "分隔线"), hint: t(translate, "横线") },
    { id: "toc", icon: "library", group: "basic", label: t(translate, "目录"), hint: t(translate, "按标题生成") },
    { id: "page_ref", icon: "link", group: "card", label: t(translate, "引用文档"), hint: "@" },
    { id: "task_card", icon: "clipboard", group: "card", label: t(translate, "任务卡"), hint: t(translate, "待办") },
    { id: "event_card", icon: "clock", group: "card", label: t(translate, "日程卡"), hint: t(translate, "日期") },
    { id: "calendar", icon: "calendar", group: "card", label: t(translate, "月历"), hint: t(translate, "本篇事件") },
  ];
}

function replaceTopBlock(view: EditorView, node: Node): void {
  const tr = applySlash(view.state, node);
  if (!tr) return;
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

function readLocalImage(file: File, apply: (src: string) => void): void {
  if (!acceptedImageFile(file)) return;
  readClipboardImage(file, apply);
}

/** Run a block command against the view and hand focus back to the editor. */
function runBlockCommand(view: EditorView, command: Command): void {
  if (!command(view.state, view.dispatch.bind(view), view)) return;
  view.focus();
}

function rowAtSelection(state: EditorState): number {
  const pos = state.selection.from;
  let hit = -1;
  for (const row of dragRows(state.doc)) {
    const node = state.doc.nodeAt(row.pos);
    if (node && pos >= row.pos && pos < row.pos + node.nodeSize) hit = row.pos;
  }
  return hit;
}

function dropSelectedBlock(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const tr = deleteSelectedBlock(state);
  if (!tr) return false;
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
}

function hoveredGroup(view: EditorView): { anchor: number; head: number } | null {
  const hover = hoverKey.getState(view.state);
  if (!hover || !spanIsGroup(view.state.doc, hover.anchor, hover.head)) return null;
  return { anchor: hover.anchor, head: hover.head };
}

function dropHoveredGroup(view: EditorView): boolean {
  const group = hoveredGroup(view);
  if (!group) return false;
  return deleteSpan(group.anchor, group.head)(view.state, (tr) => {
    view.dispatch(tr.setMeta(hoverKey, { span: null, pos: -1 }).scrollIntoView());
  });
}

function duplicateHoveredGroup(view: EditorView): boolean {
  const group = hoveredGroup(view);
  if (!group) return false;
  const ok = duplicateSpan(group.anchor, group.head)(view.state, (tr) => {
    view.dispatch(tr.setMeta(hoverKey, { span: null }).scrollIntoView());
  });
  if (ok) view.focus();
  return ok;
}

function applySelected(tr: Transaction | null, dispatch?: (tr: Transaction) => void): boolean {
  if (!tr) return false;
  if (dispatch && (tr.docChanged || tr.selectionSet)) dispatch(tr.scrollIntoView());
  return true;
}

function writeSpanClipboard(view: EditorView, event: ClipboardEvent, cut: boolean): boolean {
  if (!event.clipboardData) return false;
  const hover = hoverKey.getState(view.state);
  const spanned = hover && hover.anchor >= 0 && hover.head >= 0
    ? nodesInSpan(view.state.doc, hover.anchor, hover.head)
    : null;
  const single = view.state.selection instanceof NodeSelection ? view.state.selection.node : null;
  const nodes = spanned ?? (single ? [single] : null);
  if (!nodes) return false;
  const copied = view.serializeForClipboard(new Slice(Fragment.from(nodes), 0, 0));
  event.clipboardData.clearData();
  event.clipboardData.setData("text/html", copied.dom.innerHTML);
  event.clipboardData.setData("text/plain", nodesToMarkdown(nodes));
  event.preventDefault();
  if (!cut) return true;
  if (spanned && hover) {
    deleteSpan(hover.anchor, hover.head)(view.state, (tr) => {
      view.dispatch(tr.setMeta(hoverKey, { span: null, pos: -1 }));
    });
    return true;
  }
  dropSelectedBlock(view.state, view.dispatch.bind(view));
  return true;
}

/** Move the selected rows, or the row holding the caret, one slot among their siblings. */
function nudgeEditor(view: EditorView, direction: -1 | 1): boolean {
  const hover = hoverKey.getState(view.state) ?? EMPTY_HOVER;
  const anchor = hover.anchor >= 0 ? hover.anchor : rowAtSelection(view.state);
  const head = hover.anchor >= 0 ? hover.head : anchor;
  if (tableHit(view.state)) {
    const rowMove = moveTableRow(view.state, direction);
    if (!rowMove) return true;
    view.dispatch(rowMove.scrollIntoView());
    view.focus();
    return true;
  }
  if (anchor < 0 || head < 0) return false;
  const moved = nudgeSpan(view.state.doc, anchor, head, direction);
  if (!moved) return false;
  const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, moved.doc.content);
  if (moved.anchor >= 0) {
    try { tr.setSelection(NodeSelection.create(tr.doc, moved.anchor)); } catch { /* the caret stays where mapping put it */ }
    tr.setMeta(hoverKey, { span: { anchor: moved.anchor, head: moved.head } });
  }
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

function nudgeTableColumn(view: EditorView, direction: -1 | 1): boolean {
  if (!tableHit(view.state)) return false;
  const moved = moveTableColumn(view.state, direction);
  if (!moved) return true;
  view.dispatch(moved.scrollIntoView());
  view.focus();
  return true;
}

function turnIntoItems(translate: Translate | undefined) {
  return [
    { id: "paragraph", icon: "text", label: t(translate, "段落") },
    { id: "heading1", icon: "hash", label: t(translate, "标题 1") },
    { id: "heading2", icon: "hash", label: t(translate, "标题 2") },
    { id: "heading3", icon: "hash", label: t(translate, "标题 3") },
    { id: "bullet_list", icon: "rows", label: t(translate, "无序列表") },
    { id: "ordered_list", icon: "list-ordered", label: t(translate, "有序列表") },
    { id: "task_list", icon: "check", label: t(translate, "清单") },
    { id: "callout", icon: "info", label: t(translate, "Callout") },
    { id: "blockquote", icon: "message", label: t(translate, "引用") },
    { id: "toggle", icon: "chevron-right", label: t(translate, "Toggle") },
    { id: "code_block", icon: "code", label: t(translate, "代码") },
  ];
}

function matchSlash(item: { id: string; label: string; hint: string }, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [item.id, item.label, item.hint].join(" ").toLowerCase().includes(needle);
}

function dismissPickerOutside<T extends { open: boolean }>(view: EditorView, menu: HTMLElement, key: PluginKey<T>): () => void {
  const dismiss = (event: PointerEvent) => {
    const target = event.target as globalThis.Node | null;
    if (!target || menu.hidden || menu.contains(target) || view.dom.contains(target)) return;
    const current = key.getState(view.state);
    if (current?.open) view.dispatch(view.state.tr.setMeta(key, { ...current, open: false }));
  };
  document.addEventListener("pointerdown", dismiss, true);
  return () => document.removeEventListener("pointerdown", dismiss, true);
}

function slashPlugin(translate: Translate | undefined) {
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "image/png,image/jpeg,image/gif,image/webp";
  picker.hidden = true;
  const pickImage = (editor: EditorView) => {
    const session = slashSession(editor.state);
    const tr = session ? editor.state.tr.delete(session.from, session.to) : editor.state.tr;
    editor.dispatch(tr.setMeta(slashKey, { open: false, pos: 0, query: "", index: 0 }));
    picker.value = "";
    picker.onchange = () => {
      const file = picker.files?.[0];
      if (!file) return;
      readLocalImage(file, (src) => {
        const placed = insertImage(editor.state, src);
        if (placed) editor.dispatch(placed.scrollIntoView());
        editor.focus();
      });
    };
    picker.click();
  };
  const choose = (editor: EditorView, id: string) => {
    if (id === "image") {
      pickImage(editor);
      return;
    }
    replaceTopBlock(editor, blockFor(id));
  };
  return new Plugin({
    key: slashKey,
    state: {
      init: () => ({ open: false, pos: 0, query: "", index: 0 }),
      apply(tr, value, _old, next) {
        const meta = tr.getMeta(slashKey);
        if (meta) return meta;
        if (!tr.docChanged && !tr.selectionSet) return value;
        const session = slashSession(next);
        if (!session) return { open: false, pos: 0, query: "", index: 0 };
        return {
          open: true,
          pos: session.rowPos,
          query: session.query,
          index: session.query === value.query ? value.index : 0,
        };
      },
    },
    appendTransaction(trs, oldState, newState) {
      const was = slashKey.getState(oldState);
      const now = slashKey.getState(newState);
      const session = slashSession(oldState);
      const range = dismissedMenuRange(
        Boolean(was?.open),
        Boolean(now?.open),
        trs.some((tr) => tr.docChanged),
        session ? { from: session.from, to: session.to } : null,
        newState.selection.from,
        newState.selection.to,
      );
      if (!range) return null;
      return newState.tr.delete(range.from, range.to);
    },
    props: {
      handleKeyDown(view, event) {
        if (view.composing || event.isComposing) return false;
        const value = slashKey.getState(view.state);
        if (!value?.open) return false;
        const items = slashItems(translate).filter((item) => matchSlash(item, value.query));
        const action = menuKey(event.key, items.length);
        if (action === "pass") return false;
        if (action === "close") {
          const session = slashSession(view.state);
          const closed = { open: false, pos: 0, query: "", index: 0 };
          const tr = session ? view.state.tr.delete(session.from, session.to) : view.state.tr;
          view.dispatch(tr.setMeta(slashKey, closed));
          return true;
        }
        if (action === "hold") {
          event.preventDefault();
          return true;
        }
        if (action === "next" || action === "prev") {
          const index = action === "next"
            ? Math.min(items.length - 1, value.index + 1)
            : Math.max(0, value.index - 1);
          view.dispatch(view.state.tr.setMeta(slashKey, { ...value, index }));
          return true;
        }
        event.preventDefault();
        const item = items[Math.min(value.index, items.length - 1)];
        if (item) choose(view, item.id);
        return true;
      },
    },
    view(editorView) {
      const menu = document.createElement("div");
      menu.className = "pages-slash";
      menu.hidden = true;
      overlayRoot().append(menu, picker);
      let rendered = "";
      const dismiss = dismissPickerOutside(editorView, menu, slashKey);
      const stopScroll = followScroll(menu, () => {
        if (menu.hidden) return;
        placeOverlay(menu, editorView.coordsAtPos(editorView.state.selection.from), "below");
      });
      return {
        update(view) {
          const value = slashKey.getState(view.state);
          if (!value?.open) {
            menu.hidden = true;
            return;
          }
          const items = slashItems(translate).filter((item) => matchSlash(item, value.query));
          menu.hidden = false;
          const renderKey = items.map((item) => item.id).join("|");
          if (renderKey !== rendered || !menu.childNodes.length) {
            rendered = renderKey;
            menu.replaceChildren();
            let lastGroup = "";
            items.forEach((item, index) => {
              if (item.group !== lastGroup) {
                lastGroup = item.group;
                const group = document.createElement("p");
                group.className = "pages-slash-group";
                group.textContent = t(translate, item.group === "card" ? "卡片" : "基础");
                menu.append(group);
              }
              const button = document.createElement("button");
              button.type = "button";
              button.className = "pages-slash-item" + (index === value.index ? " is-on" : "");
              button.innerHTML = `<span class="pages-slash-icon">${dsIcon(item.icon)}</span><span class="pages-slash-copy"><strong>${escapeHtml(item.label)}</strong><em class="pages-slash-hint">${escapeHtml(item.hint)}</em></span>`;
              button.addEventListener("mouseenter", () => {
                const current = slashKey.getState(view.state);
                if (!current?.open) return;
                const next = hoverMenuIndex(current.index, index, items.length);
                if (next == null) return;
                view.dispatch(view.state.tr.setMeta(slashKey, { ...current, index: next }));
              });
              button.addEventListener("mousedown", (event) => event.preventDefault());
              button.addEventListener("click", () => choose(view, item.id));
              menu.append(button);
            });
            if (!items.length) {
              const empty = document.createElement("p");
              empty.textContent = t(translate, "没有匹配的块");
              menu.append(empty);
            }
          }
          menu.querySelectorAll("button").forEach((button, index) => {
            button.classList.toggle("is-on", index === value.index);
            button.setAttribute("aria-current", String(index === value.index));
          });
          const coords = view.coordsAtPos(view.state.selection.from);
          placeOverlay(menu, coords, "below");
          keepSelectedVisible(menu);
        },
        destroy() { stopScroll(); dismiss(); menu.remove(); picker.remove(); },
      };
    },
  });
}

function mentionPlugin(options: PagesEditorMountOptions) {
  const translate = options.translate;
  return new Plugin({
    key: mentionKey,
    state: {
      init: () => ({ open: false, from: 0, query: "", index: 0 }),
      apply(tr, value, _old, next) {
        const meta = tr.getMeta(mentionKey);
        if (meta) return meta;
        if (!tr.docChanged && !tr.selectionSet) return value;
        const slash = slashKey.getState(next);
        if (slash?.open) return { open: false, from: 0, query: "", index: 0 };
        const $from = tr.selection.$from;
        if (!$from.parent.isTextblock) return { open: false, from: 0, query: "", index: 0 };
        const prefix = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
        const matched = /(?:^|\s)@([^\s@]*)$/u.exec(prefix);
        if (!matched) return { open: false, from: 0, query: "", index: 0 };
        const query = matched[1] ?? "";
        const from = $from.start() + (matched.index ?? 0) + (matched[0].startsWith("@") ? 0 : 1);
        return { open: true, from, query, index: query === value.query ? value.index : 0 };
      },
    },
    appendTransaction(trs, oldState, newState) {
      const was = mentionKey.getState(oldState);
      const now = mentionKey.getState(newState);
      const token = was?.open ? { from: was.from, to: was.from + 1 + was.query.length } : null;
      const range = dismissedMenuRange(
        Boolean(was?.open),
        Boolean(now?.open),
        trs.some((tr) => tr.docChanged),
        token,
        newState.selection.from,
        newState.selection.to,
      );
      if (!range) return null;
      return newState.tr.delete(range.from, range.to);
    },
    props: {
      handleKeyDown(view, event) {
        if (view.composing || event.isComposing) return false;
        const value = mentionKey.getState(view.state);
        if (!value?.open) return false;
        const items = filterPages(options.pages?.() ?? [], value.query);
        const action = menuKey(event.key, items.length);
        if (action === "pass") return false;
        if (action === "close") {
          view.dispatch(view.state.tr.setMeta(mentionKey, { open: false, from: 0, query: "", index: 0 }));
          return true;
        }
        if (action === "hold") {
          event.preventDefault();
          return true;
        }
        if (action === "next" || action === "prev") {
          const index = action === "next"
            ? Math.min(items.length - 1, value.index + 1)
            : Math.max(0, value.index - 1);
          view.dispatch(view.state.tr.setMeta(mentionKey, { ...value, index }));
          return true;
        }
        event.preventDefault();
        const item = items[Math.min(value.index, items.length - 1)];
        if (item) insertMention(view, value.from, view.state.selection.from, item);
        return true;
      },
    },
    view(editorView) {
      const menu = document.createElement("div");
      menu.className = "pages-slash pages-mention-menu";
      menu.hidden = true;
      overlayRoot().append(menu);
      let rendered = "";
      const dismiss = dismissPickerOutside(editorView, menu, mentionKey);
      const stopScroll = followScroll(menu, () => {
        if (menu.hidden) return;
        placeOverlay(menu, editorView.coordsAtPos(editorView.state.selection.from), "below");
      });
      return {
        update(view) {
          const value = mentionKey.getState(view.state);
          if (!value?.open) {
            menu.hidden = true;
            return;
          }
          const items = filterPages(options.pages?.() ?? [], value.query);
          menu.hidden = false;
          const renderKey = JSON.stringify(items);
          if (renderKey !== rendered || !menu.childNodes.length) {
            rendered = renderKey;
            menu.replaceChildren();
            items.forEach((item, index) => {
              const button = document.createElement("button");
              button.type = "button";
              button.className = "pages-slash-item" + (index === value.index ? " is-on" : "");
              button.innerHTML = `<span class="pages-slash-icon">${dsIcon("note")}</span><strong>${escapeHtml(item.title)}</strong>`;
              button.addEventListener("mouseenter", () => {
                const current = mentionKey.getState(view.state);
                if (!current?.open) return;
                const next = hoverMenuIndex(current.index, index, items.length);
                if (next == null) return;
                view.dispatch(view.state.tr.setMeta(mentionKey, { ...current, index: next }));
              });
              button.addEventListener("mousedown", (event) => event.preventDefault());
              button.addEventListener("click", () => {
                const current = mentionKey.getState(view.state);
                if (current?.open) insertMention(view, current.from, view.state.selection.from, item);
              });
              menu.append(button);
            });
            if (!items.length) {
              const empty = document.createElement("p");
              empty.textContent = t(translate, "没有匹配的文档");
              menu.append(empty);
            }
          }
          menu.querySelectorAll("button").forEach((button, index) => {
            button.classList.toggle("is-on", index === value.index);
            button.setAttribute("aria-current", String(index === value.index));
          });
          const coords = view.coordsAtPos(view.state.selection.from);
          placeOverlay(menu, coords, "below");
          keepSelectedVisible(menu);
        },
        destroy() { stopScroll(); dismiss(); menu.remove(); },
      };
    },
  });
}

function filterPages(pages: readonly PagesListItem[], query: string): PagesListItem[] {
  const needle = query.trim().toLowerCase();
  return pages.filter((item) => !needle || item.title.toLowerCase().includes(needle)).slice(0, 8);
}

function insertMention(view: EditorView, from: number, to: number, item: PagesListItem): void {
  const mention = pagesSchema.nodes.page_mention.create({ page_id: item.id, title: item.title });
  const tr = view.state.tr.replaceWith(from, to, mention);
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

function chromePlugin(translate: Translate | undefined, renderOnly = false) {
  return new Plugin({
    key: chromeKey,
    state: {
      init: () => ({ after: -1 }),
      apply(tr, value) {
        const meta = tr.getMeta(chromeKey) as { after?: number } | undefined;
        if (meta && typeof meta.after === "number") return { after: meta.after };
        if (tr.docChanged && value.after >= 0) return { after: -1 };
        return value;
      },
    },
    props: {
      decorations(state) {
        const widgets: Decoration[] = [];
        const $from = state.selection.$from;
        const first = state.doc.firstChild;
        const blank = state.doc.childCount === 1 && first?.type === pagesSchema.nodes.paragraph && first.content.size === 0;
        if (blank) {
          widgets.push(Decoration.node(0, first.nodeSize, {
            class: "is-empty",
            "data-placeholder": t(translate, "输入 / 插入块，或直接写"),
          }));
        } else {
          const hint = blockPlaceholder($from);
          if (hint) {
            widgets.push(Decoration.node($from.before(), $from.after(), {
              class: "is-empty",
              "data-placeholder": t(translate, hint),
            }));
          }
        }
        const pending = renderOnly ? -1 : chromeKey.getState(state)?.after ?? -1;
        state.doc.forEach((node, offset, index) => {
          if (index < state.doc.childCount - 1) {
            widgets.push(Decoration.widget(offset + node.nodeSize, () => gapWidget(index, translate), {
              side: -1,
              key: "gap-" + (offset + node.nodeSize),
              ignoreSelection: true,
            }));
          }
          if (index === pending) {
            widgets.push(Decoration.widget(offset + node.nodeSize, () => provisionalField(translate), {
              side: 1,
              key: "pages-provisional",
              ignoreSelection: true,
              stopEvent: () => true,
            }));
          }
        });
        return DecorationSet.create(state.doc, widgets);
      },
      handleDOMEvents: {
        mousedown(view, event) {
          const gap = (event.target as HTMLElement).closest("[data-pages-gap]");
          if (!gap) return false;
          event.preventDefault();
          const index = Number(gap.getAttribute("data-after") || "0");
          view.dispatch(view.state.tr.setMeta(chromeKey, { after: index }));
          return true;
        },
      },
    },
    view(editorView) {
      if (renderOnly) return {};
      provisionalView = editorView;
      let shown = -1;
      return {
        update(view) {
          provisionalView = view;
          const after = chromeKey.getState(view.state)?.after ?? -1;
          if (after >= 0 && after !== shown) {
            provisionalField(translate).replaceChildren();
            requestAnimationFrame(() => provisionalField(translate).focus());
          }
          shown = after;
        },
        destroy() {
          provisionalView = null;
          provisionalField(translate).remove();
        },
      };
    },
  });
}

let provisional: HTMLElement | null = null;
let provisionalView: EditorView | null = null;

function provisionalField(translate: Translate | undefined): HTMLElement {
  if (provisional) return provisional;
  const field = document.createElement("div");
  field.className = "pages-provisional";
  field.contentEditable = "true";
  field.dataset.pagesProvisional = "1";
  field.dataset.placeholder = t(translate, "输入 / 插入块，或直接写");
  field.setAttribute("role", "textbox");
  field.setAttribute("aria-label", t(translate, "在此输入"));
  let composing = false;
  const viewOf = (): EditorView | null => provisionalView;
  const clear = () => {
    const view = viewOf();
    if (!view || (chromeKey.getState(view.state)?.after ?? -1) < 0) return;
    field.replaceChildren();
    view.dispatch(view.state.tr.setMeta(chromeKey, { after: -1 }));
    view.focus();
  };
  const commit = () => {
    const view = viewOf();
    const value = field.textContent ?? "";
    if (!view || !value.trim()) return;
    const after = chromeKey.getState(view.state)?.after ?? -1;
    if (after < 0) return;
    const tr = commitGap(view.state, after, value);
    if (!tr) return;
    field.replaceChildren();
    view.dispatch(tr.setMeta(chromeKey, { after: -1 }).scrollIntoView());
    view.focus();
  };
  field.addEventListener("compositionstart", () => { composing = true; });
  field.addEventListener("compositionend", () => {
    composing = false;
    commit();
  });
  field.addEventListener("input", () => {
    if (!composing) commit();
  });
  field.addEventListener("paste", (event) => {
    const file = clipboardImage(event.clipboardData);
    if (file) {
      event.preventDefault();
      readLocalImage(file, (src) => {
        const view = viewOf();
        const after = view ? chromeKey.getState(view.state)?.after ?? -1 : -1;
        if (!view || after < 0) return;
        const tr = commitGap(view.state, after, src);
        if (!tr) return;
        field.replaceChildren();
        view.dispatch(tr.setMeta(chromeKey, { after: -1 }).scrollIntoView());
        view.focus();
      });
      return;
    }
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!text.trim()) return;
    field.textContent = text;
    commit();
  });
  field.addEventListener("keydown", (event) => {
    if (event.key === "Escape" || (event.key === "Enter" && !(field.textContent ?? "").trim())) {
      event.preventDefault();
      event.stopPropagation();
      clear();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
      event.preventDefault();
      const view = viewOf();
      clear();
      if (view) undo(view.state, view.dispatch);
    }
  });
  field.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (composing) return;
      const view = viewOf();
      if (!view || (chromeKey.getState(view.state)?.after ?? -1) < 0) return;
      if ((field.textContent ?? "").trim()) commit();
      else clear();
    }, 0);
  });
  provisional = field;
  return field;
}


function hoverHandlePlugin(translate: Translate | undefined, onNote: (index: number) => void) {
  return new Plugin({
    key: hoverKey,
    state: {
      init: () => EMPTY_HOVER,
      apply(tr, value) {
        const meta = tr.getMeta(hoverKey) as { pos?: number; dragging?: boolean; span?: { anchor: number; head: number } | null; openMenu?: boolean } | undefined;
        let next = value;
        if (meta) {
          next = {
            pos: hoverPosAfter(value.pos, false, typeof meta.pos === "number" ? meta.pos : undefined),
            dragging: typeof meta.dragging === "boolean" ? meta.dragging : value.dragging,
            anchor: meta.span === undefined ? value.anchor : meta.span === null ? -1 : meta.span.anchor,
            head: meta.span === undefined ? value.head : meta.span === null ? -1 : meta.span.head,
            menuTick: value.menuTick,
          };
        } else if (tr.selectionSet && tr.selection instanceof TextSelection) {
          const span = blockSpanFromRange(tr.doc, tr.selection.from, tr.selection.to);
          next = {
            ...next,
            pos: hoverPosAfter(value.pos, true, undefined),
            anchor: span?.anchor ?? -1,
            head: span?.head ?? -1,
          };
        } else if (tr.selectionSet && tr.selection instanceof NodeSelection) {
          const at = tr.selection.from;
          const pos = hoverPosAfter(value.pos, true, undefined);
          if (dragRows(tr.doc).some((row) => row.pos === at)) next = { ...next, pos, anchor: at, head: at };
          else next = { ...next, pos };
        } else if (tr.docChanged) {
          const anchor = next.anchor >= 0 ? tr.mapping.map(next.anchor) : -1;
          const head = next.head >= 0 ? tr.mapping.map(next.head) : -1;
          next = { ...next, pos: next.pos >= 0 ? tr.mapping.map(next.pos) : -1, anchor, head };
        }
        if (next.pos >= 0 && !tr.doc.nodeAt(next.pos)) next = { ...next, pos: -1 };
        if (next.anchor >= 0 && (!tr.doc.nodeAt(next.anchor) || !tr.doc.nodeAt(next.head))) {
          next = { ...next, anchor: -1, head: -1 };
        }
        if (meta?.openMenu) next = { ...next, menuTick: value.menuTick + 1 };
        else next = { ...next, menuTick: value.menuTick };
        return next;
      },
    },
    props: {
      handleKeyDown(view, event) {
        if (blockMenuShortcut(event.key, event.metaKey || event.ctrlKey, event.altKey, event.shiftKey)
          && !slashKey.getState(view.state)?.open
          && !mentionKey.getState(view.state)?.open) {
          event.preventDefault();
          const at = blockMenuTarget(view.state.doc, view.state.selection.from);
          if (at != null) view.dispatch(view.state.tr.setMeta(hoverKey, { openMenu: true, pos: at }));
          return true;
        }
        const hover = hoverKey.getState(view.state);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const direction = event.key === "ArrowDown" ? 1 : -1;
          const spanned = Boolean(hover && hover.anchor >= 0 && hover.head >= 0);
          const step = spanned
            ? blockSpanStep(view.state.doc, hover!.anchor, hover!.head, direction, event.shiftKey)
            : event.shiftKey
              ? blockSpanFromSelection(view.state.doc, view.state.selection.from, view.state.selection.to, direction)
              : null;
          if (!step) return false;
          event.preventDefault();
          const tr = view.state.tr.setMeta(hoverKey, { span: { anchor: step.anchor, head: step.head } });
          try { tr.setSelection(NodeSelection.create(tr.doc, step.head)); } catch { /* atom-only nodes */ }
          view.dispatch(tr.scrollIntoView());
          return true;
        }
        if (!hover || hover.anchor < 0 || hover.head < 0) return false;
        if (event.key === "Backspace" || event.key === "Delete") {
          event.preventDefault();
          deleteSpan(hover.anchor, hover.head)(view.state, (tr) => {
            view.dispatch(tr.setMeta(hoverKey, { span: null, pos: -1 }));
          });
          return true;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
          event.preventDefault();
          duplicateSpan(hover.anchor, hover.head)(view.state, (tr) => {
            view.dispatch(tr.setMeta(hoverKey, { span: null }));
          });
          return true;
        }
        const printable = event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
        if (printable && hover.anchor !== hover.head) {
          event.preventDefault();
          const tr = replaceSpan(view.state, hover.anchor, hover.head, event.key);
          if (tr) view.dispatch(tr.setMeta(hoverKey, { span: null, pos: -1 }).scrollIntoView());
          return true;
        }
        return false;
      },
      decorations(state) {
        const hover = hoverKey.getState(state);
        if (!hover) return DecorationSet.empty;
        const marked = new Map<number, { size: number; classes: Set<string> }>();
        const mark = (at: number, className: string) => {
          const node = state.doc.nodeAt(at);
          if (!node) return;
          const current = marked.get(at) ?? { size: node.nodeSize, classes: new Set<string>() };
          current.classes.add(className);
          marked.set(at, current);
        };
        if (hover.anchor >= 0 && hover.head >= 0) {
          for (const row of spanRows(state.doc, hover.anchor, hover.head)) {
            mark(row.pos, "is-block-selected");
            if (hover.dragging) mark(row.pos, "is-dragging");
          }
        }
        if (hover.pos >= 0) {
          mark(hover.pos, "is-block-hover");
          if (hover.dragging && hover.anchor < 0) mark(hover.pos, "is-dragging");
        }
        const decorations = [...marked.entries()].map(([at, entry]) => (
          Decoration.node(at, at + entry.size, { class: [...entry.classes].join(" ") })
        ));
        return decorations.length ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty;
      },
    },
    view(editorView) {
      const handle = handleWidget(translate);
      handle.hidden = true;
      const menu = document.createElement("div");
      menu.className = "mw-menu pages-block-menu";
      menu.hidden = true;
      menu.setAttribute("role", "menu");
      const ghost = document.createElement("div");
      ghost.className = "pages-block-ghost pages-editor-host";
      ghost.hidden = true;
      ghost.setAttribute("aria-hidden", "true");
      overlayRoot().append(handle, menu, ghost);
      const INDENT = 24;
      let pos = -1;
      let placed = -1;
      let gripFollowsCaret = false;
      let drag: { pointerId: number; from: number; anchor: number; head: number; gap: number; level: number; requestedLevel: number; originX: number; originY: number; x: number; y: number; offsetX: number; offsetY: number; active: boolean; alt: boolean; previewCopy: boolean } | null = null;
      let motion: DragPreview | null = null;
      let dragFrame = 0;
      let suppressClick = false;
      let menuTick = 0;

      const closeMenu = () => {
        menu.hidden = true;
        menu.replaceChildren();
      };
      const hideHandle = () => {
        handle.hidden = true;
        placed = -1;
      };
      const hoverState = () => hoverKey.getState(editorView.state) ?? EMPTY_HOVER;
      const setHover = (nextPos: number, dragging = hoverState().dragging) => {
        const current = hoverState();
        if (current.pos === nextPos && current.dragging === dragging) return;
        if (nextPos !== pos) closeMenu();
        editorView.dispatch(editorView.state.tr.setMeta(hoverKey, { pos: nextPos, dragging }));
      };
      const depthOf = () => (pos < 0 ? 0 : editorView.state.doc.resolve(pos).depth);
      const topIndex = () => (pos < 0 ? 0 : editorView.state.doc.resolve(pos).index(0));
      const placeHandle = (rowPos: number, force = false, followingCaret = false) => {
        const node = rowPos >= 0 ? editorView.state.doc.nodeAt(rowPos) : null;
        const dom = node ? editorView.nodeDOM(rowPos) : null;
        if (!node || !(dom instanceof HTMLElement)) {
          hideHandle();
          return;
        }
        const rect = dom.getBoundingClientRect();
        const pm = editorView.dom.getBoundingClientRect();
        const gutter = Number.parseFloat(getComputedStyle(editorView.dom).paddingLeft) || 76;
        const contentLeft = pm.left + gutter;
        const handleWidth = handle.offsetWidth || 44;
        const gap = dom.closest(".pages-column") || window.innerWidth <= 760 ? 4 : 14;
        const indent = Math.max(0, rect.left - contentLeft);
        const minLeft = pm.left + 6;
        const maxLeft = rect.left - handleWidth - gap;
        const top = Math.round(rect.top + 2);
        const left = Math.round(Math.min(Math.max(minLeft, minLeft + indent), maxLeft));
        const sameCaret = handle.classList.contains("is-caret") === followingCaret;
        if (!force && placed === rowPos && handle.style.top === top + "px" && handle.style.left === left + "px" && sameCaret) return;
        gripFollowsCaret = followingCaret;
        handle.classList.toggle("has-note", Boolean(node.attrs.note));
        handle.classList.toggle("is-caret", followingCaret);
        handle.style.top = top + "px";
        handle.style.left = left + "px";
        handle.hidden = false;
        pos = rowPos;
        placed = rowPos;
      };
      const contentBox = () => {
        const pm = editorView.dom.getBoundingClientRect();
        const pad = Number.parseFloat(getComputedStyle(editorView.dom).paddingLeft) || 52;
        return { pm, left: pm.left + pad };
      };
      const rowLeft = (rowPos: number) => {
        const natural = drag?.active ? motion?.sourceBox(rowPos) : null;
        if (natural) return natural.left;
        const el = editorView.nodeDOM(rowPos);
        return el instanceof HTMLElement ? el.getBoundingClientRect().left : contentBox().left;
      };
      const gapAt = (clientY: number, rows: readonly DragRow[]) => rowGapAt(clientY, rows.map((row) => {
        const el = editorView.nodeDOM(row.pos);
        const rect = motion?.sourceBox(row.pos) ?? (el instanceof HTMLElement ? el.getBoundingClientRect() : null);
        return { top: rect?.top ?? 0, bottom: rect ? rect.top + rect.height : 0, indent: row.indent };
      }));
      const levelAt = (clientX: number, rows: readonly DragRow[], gap: number) => {
        const prev = gap > 0 ? rows[gap - 1] : undefined;
        const range = dropLevelRange(rows, gap);
        const baseLeft = prev ? rowLeft(prev.pos) : contentBox().left;
        const baseLevel = prev ? prev.indent : 0;
        const raw = baseLevel + Math.round((clientX - baseLeft) / INDENT);
        return Math.max(range.min, Math.min(range.max, raw));
      };
      const renderDrag = () => {
        dragFrame = 0;
        if (!drag?.active || !motion) return;
        if (workspace) {
          const rect = workspace.getBoundingClientRect();
          const top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
          const edge = Math.min(48, (bottom - top) / 6);
          const velocity = drag.y < top + edge ? -Math.min(12, (top + edge - drag.y) / 4)
            : drag.y > bottom - edge ? Math.min(12, (drag.y - bottom + edge) / 4) : 0;
          const previous = workspace.scrollTop;
          if (velocity) workspace.scrollTop += velocity;
          if (workspace.scrollTop !== previous) scheduleDrag();
        }
        ghost.style.transform = `translate(${Math.round(drag.x + drag.offsetX)}px, ${Math.round(drag.y + drag.offsetY - 4)}px)`;
        const rows = dragRows(motion.layoutSource);
        const gap = gapAt(drag.y, rows);
        const level = levelAt(drag.x + drag.offsetX, rows, gap);
        if (gap === drag.gap && level === drag.requestedLevel && drag.alt === drag.previewCopy) return;
        const preview = drag.alt
          ? previewCopySpan(motion.layoutSource, drag.anchor, drag.head, gap, level)
          : previewSpan(motion.layoutSource, drag.anchor, drag.head, gap, level);
        drag.gap = gap;
        drag.requestedLevel = level;
        drag.previewCopy = drag.alt;
        drag.level = preview?.level ?? level;
        ghost.classList.toggle("is-copy", drag.alt);
        motion.update(preview?.doc ?? motion.layoutSource);
        const slot = motion.slot();
        if (slot) ghost.style.width = Math.round(slot.width) + "px";
      };
      const scheduleDrag = () => {
        if (!dragFrame) dragFrame = requestAnimationFrame(renderDrag);
      };
      const stopDrag = (commit: boolean) => {
        if (!drag) return;
        if (dragFrame) {
          cancelAnimationFrame(dragFrame);
          dragFrame = 0;
          if (commit) renderDrag();
        }
        if (dragFrame) cancelAnimationFrame(dragFrame);
        dragFrame = 0;
        const { from, anchor, head, gap, level, active: wasActive, pointerId, alt } = drag;
        drag = null;
        if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
        if (wasActive) suppressClick = true;
        const valid = commit && wasActive && motion?.source === editorView.state.doc
          && previewSpan(editorView.state.doc, anchor, head, gap, level);
        const apply = () => {
          if (valid) {
            commitDrag(editorView, anchor, head, gap, level,
              tr => tr.setMeta(hoverKey, { span: null, pos: -1, dragging: false }), alt);
          } else setHover(motion && motion.source !== editorView.state.doc ? -1 : from, false);
        };
        if (wasActive && motion) motion.finish(apply, ghost.getBoundingClientRect());
        else apply();
        ghost.classList.remove("is-copy");
        ghost.hidden = true;
        ghost.replaceChildren();
        ghost.style.transform = "";
        handle.classList.remove("is-dragging");
        document.documentElement.classList.remove("is-pages-dragging");
        if (valid) editorView.focus();
      };
      const rowPosAt = (clientX: number, clientY: number): number => {
        const found = editorView.posAtCoords({ left: clientX, top: clientY });
        if (!found) return -1;
        let hit = -1;
        for (const row of dragRows(editorView.state.doc)) {
          const node = editorView.state.doc.nodeAt(row.pos);
          if (node && found.pos >= row.pos && found.pos < row.pos + node.nodeSize) hit = row.pos;
        }
        return hit;
      };
      const menuItem = (icon: string, label: string, run: () => void, danger = false, opens = false) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = danger ? "mw-menu__item mw-menu__item--danger" : "mw-menu__item";
        button.setAttribute("role", "menuitem");
        if (opens) button.dataset.pagesMenuOpen = "1";
        button.innerHTML = `${dsIcon(icon)}<span>${escapeHtml(label)}</span>`;
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", (event) => {
          event.preventDefault();
          run();
        });
        return button;
      };
      const appendTableActions = () => {
        const node = pos >= 0 ? editorView.state.doc.nodeAt(pos) : null;
        if (node?.type.name !== "table") return;
        const run = (make: typeof addTableRow) => {
          const tr = make(editorView.state, pos);
          if (tr) editorView.dispatch(tr.scrollIntoView());
          closeMenu();
          editorView.focus();
        };
        menu.append(
          menuItem("plus", t(translate, "加一行"), () => run(addTableRow)),
          menuItem("grid", t(translate, "加一列"), () => run(addTableColumn)),
          menuItem("minus", t(translate, "删行"), () => run(deleteTableRow)),
          menuItem("minus", t(translate, "删列"), () => run(deleteTableColumn)),
          menuItem("rows", t(translate, "表头行"), () => run(toggleHeaderRow)),
        );
      };
      const activeSpan = () => {
        const hover = hoverState();
        if (hover.anchor < 0 || pos < 0) return null;
        const doc = editorView.state.doc;
        const rows = spanRows(doc, hover.anchor, hover.head);
        if (!rows.some((row) => row.pos === pos)) return null;
        return spanRoots(doc, hover.anchor, hover.head).length > 1
          ? { anchor: hover.anchor, head: hover.head }
          : null;
      };
      const tonePositions = (): number[] => {
        const hover = hoverState();
        if (hover.anchor >= 0 && pos >= 0) {
          const doc = editorView.state.doc;
          const rows = spanRows(doc, hover.anchor, hover.head);
          if (rows.some((row) => row.pos === pos)) {
            const roots = spanRoots(doc, hover.anchor, hover.head);
            if (roots.length) return roots.map((row) => row.pos);
          }
        }
        return pos >= 0 ? [pos] : [];
      };
      const paintMenu = (index: number) => {
        const items = [...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        items.forEach((button, itemIndex) => button.classList.toggle("is-on", itemIndex === index));
        keepSelectedVisible(menu);
      };
      menu.addEventListener("mouseover", (event) => {
        const button = (event.target as HTMLElement | null)?.closest("button");
        if (!(button instanceof HTMLButtonElement) || !menu.contains(button)) return;
        const items = [...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const current = items.findIndex((item) => item.classList.contains("is-on"));
        const next = hoverMenuIndex(current, items.indexOf(button), items.length);
        if (next != null) paintMenu(next);
      });
      let menuMode: "root" | "turn" | "tone" = "root";
      const renderMenu = (mode: "root" | "turn" | "tone") => {
        menuMode = mode;
        menu.replaceChildren();
        const block = topIndex();
        const grouped = (() => {
          const hover = hoverState();
          if (mode !== "root" || hover.anchor < 0 || pos < 0) return null;
          const rows = spanRows(editorView.state.doc, hover.anchor, hover.head);
          if (!rows.some((row) => row.pos === pos)) return null;
          return spanRoots(editorView.state.doc, hover.anchor, hover.head).length > 1 ? hover : null;
        })();
        if (grouped) {
          appendTableActions();
          const finish = (command: ReturnType<typeof deleteSpan>) => {
            command(editorView.state, (tr) => {
              editorView.dispatch(tr.setMeta(hoverKey, { span: null }));
            });
            closeMenu();
          };
          menu.append(
            menuItem("chevron-up", t(translate, "上移"), () => {
              nudgeEditor(editorView, -1);
              closeMenu();
            }),
            menuItem("chevron-down", t(translate, "下移"), () => {
              nudgeEditor(editorView, 1);
              closeMenu();
            }),
            menuItem("tune", t(translate, "颜色"), () => renderMenu("tone"), false, true),
            menuItem("refresh", t(translate, "转换为"), () => renderMenu("turn"), false, true),
            menuItem("copy", t(translate, "复制"), () => finish(duplicateSpan(grouped.anchor, grouped.head))),
            menuItem("trash", t(translate, "删除"), () => finish(deleteSpan(grouped.anchor, grouped.head)), true),
          );
          paintMenu(0);
          return;
        }
        if (mode === "root" && depthOf() > 0) {
          appendTableActions();
          menu.append(
            menuItem("refresh", t(translate, "转换为"), () => renderMenu("turn"), false, true),
            menuItem("tune", t(translate, "颜色"), () => renderMenu("tone"), false, true),
            menuItem("chevron-up", t(translate, "上移"), () => {
              nudgeEditor(editorView, -1);
              closeMenu();
            }),
            menuItem("chevron-down", t(translate, "下移"), () => {
              nudgeEditor(editorView, 1);
              closeMenu();
            }),
            menuItem("copy", t(translate, "复制"), () => {
              runBlockCommand(editorView, duplicateRow(pos));
              closeMenu();
            }),
            menuItem("trash", t(translate, "删除"), () => {
              runBlockCommand(editorView, deleteRow(pos));
              closeMenu();
            }, true),
          );
          paintMenu(0);
          return;
        }
        if (mode === "tone") {
          menu.append(menuItem("arrow", t(translate, "返回"), () => renderMenu("root")));
          ([
            ["font_color", "文字颜色"],
            ["highlight", "背景色"],
          ] as const).forEach(([kind, labelText]) => {
            const label = document.createElement("p");
            label.className = "pages-menu-label";
            label.textContent = t(translate, labelText);
            const strip = document.createElement("div");
            strip.className = "pages-tone-strip";
            const swatch = (tone: string, name: string) => {
              const button = document.createElement("button");
              button.type = "button";
              button.className = "pages-tone";
              button.dataset.pagesTone = tone || "none";
              button.setAttribute("aria-label", name);
              button.title = name;
              button.addEventListener("mousedown", (event) => event.preventDefault());
              button.addEventListener("click", (event) => {
                event.preventDefault();
                const tr = setRowsTone(editorView.state, tonePositions(), kind, tone);
                if (tr) editorView.dispatch(tr.scrollIntoView());
                closeMenu();
                editorView.focus();
              });
              strip.append(button);
            };
            swatch("", t(translate, "默认"));
            PAGES_TONES.forEach((tone) => swatch(tone.id, t(translate, tone.label)));
            menu.append(label, strip);
          });
          paintMenu(0);
          return;
        }
        if (mode === "turn") {
          menu.append(menuItem("arrow", t(translate, "返回"), () => renderMenu("root")));
          const label = document.createElement("p");
          label.className = "pages-menu-label";
          label.textContent = t(translate, "转换为");
          menu.append(label);
          const conversion = (id: string) => {
            const span = activeSpan();
            return turnSpanInto(editorView.state, span?.anchor ?? pos, span?.head ?? pos, id);
          };
          turnIntoItems(translate).forEach((item) => {
            const button = menuItem(item.icon, item.label, () => {
              const tr = conversion(item.id);
              if (tr) editorView.dispatch(tr.setMeta(hoverKey, { span: null }).scrollIntoView());
              closeMenu();
              editorView.focus();
            });
            button.disabled = !conversion(item.id);
            if (button.disabled) button.title = t(translate, "此转换无法保留块中的内容");
            menu.append(button);
          });
          paintMenu(0);
          return;
        }
        appendTableActions();
        const columnListAt = (() => {
          if (pos < 0) return -1;
          const direct = editorView.state.doc.nodeAt(pos);
          if (direct?.type.name === "column_list") return pos;
          const $at = editorView.state.doc.resolve(Math.min(pos + 1, editorView.state.doc.content.size));
          for (let depth = $at.depth; depth > 0; depth -= 1) {
            if ($at.node(depth).type.name === "column_list") return $at.before(depth);
          }
          return -1;
        })();
        if (columnListAt >= 0) {
          menu.append(
            menuItem("columns", t(translate, "加一栏"), () => {
              const tr = addColumn(editorView.state, columnListAt);
              if (tr) editorView.dispatch(tr.scrollIntoView());
              closeMenu();
              editorView.focus();
            }),
            menuItem("rows", t(translate, "取消分栏"), () => {
              const tr = unwrapColumns(editorView.state, columnListAt);
              if (tr) editorView.dispatch(tr.scrollIntoView());
              closeMenu();
              editorView.focus();
            }),
          );
        }
        menu.append(
          menuItem("refresh", t(translate, "转换为"), () => renderMenu("turn"), false, true),
          menuItem("tune", t(translate, "颜色"), () => renderMenu("tone"), false, true),
          menuItem("copy", t(translate, "复制"), () => {
            runBlockCommand(editorView, duplicateBlock(block));
            closeMenu();
          }),
          menuItem("message", t(translate, "备注"), () => {
            onNote(block);
            closeMenu();
          }),
          menuItem("chevron-up", t(translate, "上移"), () => {
            nudgeEditor(editorView, -1);
            closeMenu();
          }),
          menuItem("chevron-down", t(translate, "下移"), () => {
            nudgeEditor(editorView, 1);
            closeMenu();
          }),
          menuItem("trash", t(translate, "删除"), () => {
            runBlockCommand(editorView, deleteBlock(block));
            closeMenu();
          }, true),
        );
        paintMenu(0);
      };
      const openMenu = () => {
        menu.hidden = false;
        renderMenu("root");
        const rect = handle.getBoundingClientRect();
        placeOverlay(menu, rect, "beside");
      };
      const onMove = (event: MouseEvent) => {
        if (event.buttons || drag) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest(".pages-slash, .pages-format-bar, .pages-link-preview, .pages-comment-preview, .pages-pop, .pages-more-menu, .pages-create-menu")) {
          if (menu.hidden) setHover(-1, false);
          return;
        }
        if (target && (handle.contains(target) || menu.contains(target))) return;
        const host = editorView.dom.closest(".pages-editor-host") ?? editorView.dom;
        if (!host.contains(target)) {
          if (menu.hidden) setHover(-1, false);
          return;
        }
        setHover(rowPosAt(event.clientX, event.clientY), false);
      };
      handle.addEventListener("pointerdown", (event) => {
        const target = event.target as HTMLElement;
        if (target.closest("[data-pages-plus]")) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (!target.closest("[data-pages-grip]") || pos < 0) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) return;
        closeMenu();
        motion?.destroy();
        motion = null;
        handle.setPointerCapture(event.pointerId);
        const hover = hoverState();
        const covered = hover.anchor >= 0
          && spanRows(editorView.state.doc, hover.anchor, hover.head).some((row) => row.pos === pos);
        drag = {
          pointerId: event.pointerId,
          from: pos,
          anchor: covered ? hover.anchor : pos,
          head: covered ? hover.head : pos,
          gap: -1,
          level: -1,
          requestedLevel: -1,
          originX: event.clientX,
          originY: event.clientY,
          x: event.clientX,
          y: event.clientY,
          offsetX: 0,
          offsetY: 0,
          active: false,
          alt: event.altKey,
          previewCopy: false,
        };
      });
      handle.addEventListener("pointermove", (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        drag.x = event.clientX;
        drag.y = event.clientY;
        drag.alt = event.altKey;
        if (!drag.active) {
          if (Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY) < 5) return;
          const dom = editorView.nodeDOM(drag.from);
          if (!(dom instanceof HTMLElement)) {
            stopDrag(false);
            return;
          }
          drag.active = true;
          const roots = spanRoots(editorView.state.doc, drag.anchor, drag.head);
          const sources = roots.map(root => editorView.nodeDOM(root.pos)).filter((node): node is HTMLElement => node instanceof HTMLElement);
          const boxes = sources.map(node => node.getBoundingClientRect());
          const left = Math.min(...boxes.map(box => box.left));
          const rect = { left, top: Math.min(...boxes.map(box => box.top)), width: Math.max(...boxes.map(box => box.right)) - left };
          drag.offsetX = rect.left - drag.originX;
          drag.offsetY = rect.top - drag.originY;
          const clone = document.createElement("div");
          clone.className = "ProseMirror";
          for (const [index, source] of sources.entries()) {
            const gap = index > 0 ? sources[index - 1].nextElementSibling : null;
            if (gap?.classList.contains("pages-insert-line")) clone.append(gap.cloneNode(true));
            const copy = source.cloneNode(true) as HTMLElement;
            copy.querySelectorAll("script, .pages-insert-line").forEach(node => node.remove());
            copy.classList.remove("is-block-selected", "is-block-hover", "ProseMirror-selectednode", "is-dragging");
            clone.append(copy);
          }
          ghost.replaceChildren(clone);
          const count = roots.length;
          if (count > 1) {
            const badge = document.createElement("span");
            badge.className = "pages-drag-count";
            badge.textContent = String(count);
            ghost.append(badge);
          }
          ghost.style.width = Math.round(rect.width) + "px";
          ghost.hidden = false;
          handle.classList.add("is-dragging");
          document.documentElement.classList.add("is-pages-dragging");
          editorView.dispatch(editorView.state.tr.setMeta(hoverKey, {
            pos: drag.from,
            dragging: true,
            span: { anchor: drag.anchor, head: drag.head },
          }));
          motion = new DragPreview(editorView, drag.anchor, drag.head, [chromePlugin(translate, true), codeHighlightPlugin()]);
        }
        scheduleDrag();
      });
      handle.addEventListener("pointerup", (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        drag.x = event.clientX;
        drag.y = event.clientY;
        drag.alt = event.altKey;
        if (!drag.active) {
          stopDrag(false);
          return;
        }
        if (!dragFrame) scheduleDrag();
        stopDrag(true);
      });
      // Menus open on click, not pointerup, so keyboard activation of the grip works too.
      handle.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        event.preventDefault();
        event.stopPropagation();
        if (suppressClick) {
          suppressClick = false;
          return;
        }
        if (target.closest("[data-pages-plus]")) {
          closeMenu();
          const tr = insertSlashBelow(editorView.state, pos);
          if (tr) {
            editorView.dispatch(tr.scrollIntoView());
            editorView.focus();
          }
          return;
        }
        if (!target.closest("[data-pages-grip]") || drag || pos < 0) return;
        const selectSpan = (anchor: number, head: number) => {
          const tr = editorView.state.tr.setMeta(hoverKey, { span: { anchor, head }, pos });
          try { tr.setSelection(NodeSelection.create(tr.doc, head)); } catch { /* leave the caret */ }
          editorView.dispatch(tr);
        };
        if (event.shiftKey) {
          const hover = hoverState();
          selectSpan(hover.anchor >= 0 ? hover.anchor : pos, pos);
          closeMenu();
          return;
        }
        selectSpan(pos, pos);
        if (menu.hidden) openMenu();
        else closeMenu();
      });
      handle.addEventListener("pointercancel", (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        stopDrag(false);
      });
      const cancelDrag = () => stopDrag(false);
      handle.addEventListener("lostpointercapture", cancelDrag);
      window.addEventListener("blur", cancelDrag);
      window.addEventListener("resize", cancelDrag);
      const onPointerDown = (event: PointerEvent) => {
        const target = event.target as HTMLElement | null;
        if (target && (handle.contains(target) || menu.contains(target))) return;
        closeMenu();
      };
      const onKey = (event: KeyboardEvent) => {
        if (drag && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          stopDrag(false);
          return;
        }
        if (drag?.active) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (menu.hidden || event.isComposing) return;
        const items = [...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const index = items.findIndex((button) => button.classList.contains("is-on"));
        const current = items[index];
        const action = blockMenuKey(index, items.length, event.key, menuMode !== "root", current?.dataset.pagesMenuOpen === "1");
        if (action == null) return;
        event.preventDefault();
        event.stopPropagation();
        if (action === "close") {
          closeMenu();
          return;
        }
        if (action === "back") {
          renderMenu("root");
          return;
        }
        if (action === "stay") return;
        if (action === "run") {
          (items[index] ?? items[0])?.click();
          return;
        }
        paintMenu(action);
      };
      const hostEl = editorView.dom.closest<HTMLElement>(".pages-editor-host") ?? editorView.dom;
      const workspace = editorView.dom.closest<HTMLElement>(".pages-workspace");
      const onLeave = (event: MouseEvent) => {
        if (drag) return;
        const to = event.relatedTarget as HTMLElement | null;
        if (to && (handle.contains(to) || menu.contains(to) || hostEl.contains(to))) return;
        if (menu.hidden) setHover(-1, false);
      };
      const onScroll = () => {
        if (drag?.active) {
          scheduleDrag();
          return;
        }
        closeMenu();
        if (!handle.hidden) placeHandle(pos, true, gripFollowsCaret);
      };
      hostEl.addEventListener("mousemove", onMove);
      handle.addEventListener("mousemove", onMove);
      hostEl.addEventListener("mouseleave", onLeave);
      handle.addEventListener("mouseleave", onLeave);
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("keydown", onKey, true);
      workspace?.addEventListener("scroll", onScroll, { passive: true });
      const stopScroll = followScroll(menu, onScroll);
      return {
        update() {
          if (drag?.active && motion && motion.source !== editorView.state.doc) stopDrag(false);
          if (drag?.active) return;
          const hover = hoverState();
          if (hover.menuTick !== menuTick) {
            menuTick = hover.menuTick;
            const at = blockMenuTarget(editorView.state.doc, editorView.state.selection.from);
            if (at != null) {
              if (!menu.hidden && pos === at) closeMenu();
              else {
                placeHandle(at, true, false);
                if (pos === at) openMenu();
              }
            }
          }
          const hovered = hover.pos >= 0 && editorView.state.doc.nodeAt(hover.pos) ? hover.pos : -1;
          const anchor = handleAnchor(hovered, rowAtSelection(editorView.state));
          if (!anchor) hideHandle();
          else placeHandle(anchor.pos, false, anchor.followingCaret);
        },
        destroy() {
          drag = null;
          if (dragFrame) cancelAnimationFrame(dragFrame);
          motion?.destroy();
          document.documentElement.classList.remove("is-pages-dragging");
          hostEl.removeEventListener("mousemove", onMove);
          handle.removeEventListener("mousemove", onMove);
          hostEl.removeEventListener("mouseleave", onLeave);
          handle.removeEventListener("mouseleave", onLeave);
          document.removeEventListener("pointerdown", onPointerDown, true);
          document.removeEventListener("keydown", onKey, true);
          window.removeEventListener("blur", cancelDrag);
          window.removeEventListener("resize", cancelDrag);
          handle.removeEventListener("lostpointercapture", cancelDrag);
          workspace?.removeEventListener("scroll", onScroll);
          stopScroll();
          handle.remove();
          menu.remove();
          ghost.remove();
        },
      };
    },
  });
}

function handleWidget(translate: Translate | undefined): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "pages-block-handle";
  wrap.innerHTML = `
    <button type="button" data-pages-plus aria-label="${escapeHtml(t(translate, "插入块"))}">${dsIcon("plus")}</button>
    <button type="button" data-pages-grip aria-label="${escapeHtml(t(translate, "拖动以排序或缩进"))}">${dsIcon("grip")}</button>`;
  return wrap;
}

function gapWidget(index: number, translate?: Translate): HTMLElement {
  const line = document.createElement("span");
  line.className = "pages-insert-line";
  line.dataset.pagesGap = "1";
  line.dataset.after = String(index);
  line.setAttribute("role", "button");
  line.setAttribute("aria-label", t(translate, "在此插入"));
  line.contentEditable = "false";
  return line;
}

function columnNodeView(node: Node, view: EditorView, getPos: () => number | undefined, translate?: Translate) {
  let current = node;
  const dom = document.createElement("div");
  dom.className = "pages-column";
  dom.dataset.pagesColumn = "1";
  const content = document.createElement("div");
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "pages-column-resize";
  handle.setAttribute("aria-label", t(translate, "调整栏宽"));
  const paint = () => {
    dom.dataset.pagesColumnShare = String(safePagesColumnShare(current.attrs.width));
  };
  handle.addEventListener("mousedown", (event) => event.preventDefault());
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const next = dom.nextElementSibling;
    const pair = dom.getBoundingClientRect().width + (next instanceof HTMLElement ? next.getBoundingClientRect().width : 0);
    const move = (ev: PointerEvent) => {
      const list = dom.parentElement;
      if (!(list instanceof HTMLElement) || !(next instanceof HTMLElement) || pair <= 0) return;
      const left = safePagesColumnShare(current.attrs.width);
      const rightShare = Number(next.dataset.pagesColumnShare || 1);
      const right = safePagesColumnShare(rightShare);
      const sum = left + right;
      const nextLeft = Math.max(0.2, Math.min(sum - 0.2, left + ((ev.clientX - startX) / pair) * sum));
      const tracks = [...list.children].map((child) => {
        if (child === dom) return `${Math.round(nextLeft * 100) / 100}fr`;
        if (child === next) return `${Math.round((sum - nextLeft) * 100) / 100}fr`;
        return `${safePagesColumnShare((child as HTMLElement).dataset.pagesColumnShare)}fr`;
      });
      list.style.gridTemplateColumns = tracks.join(" ");
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const pos = getPos();
      if (pos == null || pair <= 0) return;
      const $pos = view.state.doc.resolve(pos);
      if ($pos.parent.type !== pagesSchema.nodes.column_list) return;
      const left = safePagesColumnShare($pos.parent.child($pos.index()).attrs.width);
      const right = safePagesColumnShare($pos.parent.child($pos.index() + 1)?.attrs.width);
      const delta = ((ev.clientX - startX) / pair) * (left + right);
      const tr = nudgeColumnShare(view.state, $pos.before($pos.depth), $pos.index(), delta);
      if (tr) view.dispatch(tr);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
  paint();
  dom.append(content, handle);
  return {
    dom,
    contentDOM: content,
    ignoreMutation: (mutation: ViewMutationRecord) => mutation.target === handle || mutation.target === dom,
    update(next: Node) {
      if (next.type !== current.type) return false;
      current = next;
      paint();
      return true;
    },
  };
}

function bookmarkNodeView(node: Node, view: EditorView, getPos: () => number | undefined, translate?: Translate) {
  let current = node;
  let selected = false;
  const frame = document.createElement("div");
  frame.className = "pages-bookmark";
  frame.contentEditable = "false";
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.className = "pages-bookmark-title";
  titleInput.maxLength = 120;
  titleInput.placeholder = t(translate, "名称");
  const titleText = document.createElement("strong");
  const url = document.createElement("a");
  url.target = "_blank";
  url.rel = "noreferrer noopener";
  const shownTitle = () => {
    const href = safePagesHref(current.attrs.href);
    return safePagesBookmarkTitle(current.attrs.title) || bookmarkLabel(href) || t(translate, "链接");
  };
  const paint = () => {
    const href = safePagesHref(current.attrs.href);
    titleText.textContent = shownTitle();
    titleInput.hidden = !selected;
    titleText.hidden = selected;
    if (document.activeElement !== titleInput) titleInput.value = shownTitle();
    url.textContent = href || shownTitle();
    if (href) url.href = href;
    else url.removeAttribute("href");
  };
  titleInput.addEventListener("mousedown", (event) => event.stopPropagation());
  titleInput.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      view.focus();
    }
  });
  titleInput.addEventListener("input", () => {
    const pos = getPos();
    if (pos == null) return;
    const tr = setBookmarkTitle(view.state, pos, titleInput.value);
    if (tr) view.dispatch(tr);
  });
  titleInput.addEventListener("blur", () => {
    titleInput.value = shownTitle();
  });
  url.addEventListener("click", (event) => {
    const href = safePagesHref(current.attrs.href);
    if (!href || !linkClickOpens(event)) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    window.open(href, "_blank", "noopener,noreferrer");
  });
  frame.append(titleInput, titleText, url);
  paint();
  return {
    dom: frame,
    ignoreMutation: () => true,
    selectNode() {
      selected = true;
      frame.classList.add("is-selected");
      paint();
    },
    deselectNode() {
      selected = false;
      frame.classList.remove("is-selected");
      paint();
    },
    update(next: Node) {
      if (next.type !== current.type) return false;
      current = next;
      paint();
      return true;
    },
  };
}

function imageNodeView(node: Node, view: EditorView, getPos: () => number | undefined, translate?: Translate) {
  let current = node;
  let selected = false;
  const frame = document.createElement("div");
  frame.className = "pages-image-frame";
  frame.contentEditable = "false";
  const media = document.createElement("div");
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "pages-image-resize";
  handle.setAttribute("aria-label", t(translate, "调整宽度"));
  const caption = document.createElement("input");
  caption.type = "text";
  caption.className = "pages-image-caption";
  caption.placeholder = t(translate, "说明");
  caption.maxLength = 200;
  caption.addEventListener("mousedown", (event) => event.stopPropagation());
  caption.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      view.focus();
    }
  });
  caption.addEventListener("input", () => {
    const pos = getPos();
    if (pos == null) return;
    const tr = setImageCaption(view.state, pos, caption.value);
    if (tr) view.dispatch(tr);
  });
  caption.addEventListener("blur", () => {
    caption.value = safePagesImageCaption(current.attrs.caption);
  });
  const syncCaption = () => {
    const text = safePagesImageCaption(current.attrs.caption);
    caption.hidden = !selected && !text;
    if (document.activeElement !== caption) caption.value = text;
  };
  const paint = () => {
    const src = safePagesImageSrc(current.attrs.src);
    const alt = String(current.attrs.alt || imageAlt(src) || "图片");
    const width = safePagesImageWidth(current.attrs.width);
    frame.style.width = width ? width + "px" : "";
    media.replaceChildren();
    if (!src) {
      const broken = document.createElement("div");
      broken.className = "pages-image is-broken";
      broken.textContent = alt;
      media.append(broken);
    } else {
      const img = document.createElement("img");
      img.className = "pages-image";
      img.src = src;
      img.alt = alt;
      img.dataset.pagesImage = "1";
      media.append(img);
    }
    syncCaption();
  };
  handle.addEventListener("mousedown", (event) => event.preventDefault());
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const img = media.querySelector("img");
    const startX = event.clientX;
    const startWidth = (img ?? frame).getBoundingClientRect().width;
    const move = (ev: PointerEvent) => {
      frame.style.width = safePagesImageWidth(startWidth + ev.clientX - startX) + "px";
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const pos = getPos();
      if (pos == null) return;
      const parent = frame.parentElement?.getBoundingClientRect().width ?? 0;
      const raw = startWidth + ev.clientX - startX;
      const next = parent > 0 && raw >= parent - 24 ? 0 : safePagesImageWidth(raw);
      const tr = setImageWidth(view.state, pos, next);
      if (tr) view.dispatch(tr);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
  frame.append(media, handle, caption);
  paint();
  return {
    dom: frame,
    ignoreMutation: () => true,
    selectNode() {
      selected = true;
      frame.classList.add("is-selected");
      syncCaption();
    },
    deselectNode() {
      selected = false;
      frame.classList.remove("is-selected");
      syncCaption();
    },
    update(next: Node) {
      if (next.type !== current.type) return false;
      current = next;
      paint();
      return true;
    },
  };
}

function cellNodeView(node: Node, view: EditorView, getPos: () => number | undefined, translate?: Translate) {
  let current = node;
  const dom = document.createElement(node.type.name === "table_header" ? "th" : "td");
  const content = document.createElement("div");
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "pages-col-resize";
  handle.setAttribute("aria-label", t(translate, "调整列宽"));
  const paint = () => {
    const width = safePagesColumnWidth(current.attrs.colwidth);
    if (width) {
      dom.style.width = width + "px";
      dom.dataset.pagesColwidth = String(width);
    } else {
      dom.style.width = "";
      delete dom.dataset.pagesColwidth;
    }
  };
  handle.addEventListener("mousedown", (event) => event.preventDefault());
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = dom.getBoundingClientRect().width;
    const column = dom.cellIndex;
    const table = dom.closest("table");
    const cells = table ? [...table.rows].map((row) => row.cells[column]).filter((cell) => cell != null) : [dom];
    const move = (ev: PointerEvent) => {
      const next = safePagesColumnWidth(startWidth + ev.clientX - startX) + "px";
      cells.forEach((cell) => { cell.style.width = next; });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const pos = getPos();
      if (pos == null) return;
      const $pos = view.state.doc.resolve(pos);
      if ($pos.parent.type !== pagesSchema.nodes.table_row || $pos.depth < 2) return;
      const tablePos = $pos.before($pos.depth - 1);
      const colIndex = $pos.index();
      const tr = setColumnWidth(view.state, tablePos, colIndex, startWidth + ev.clientX - startX);
      if (tr) view.dispatch(tr);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
  paint();
  dom.append(content, handle);
  return {
    dom,
    contentDOM: content,
    ignoreMutation: (mutation: ViewMutationRecord) => mutation.target === handle || mutation.target === dom,
    update(next: Node) {
      if (next.type !== current.type) return false;
      current = next;
      paint();
      return true;
    },
  };
}

function taskNodeView(node: Node, view: EditorView, getPos: () => number | undefined) {
  const dom = document.createElement("li");
  dom.className = "pages-task-item" + (node.attrs.checked ? " is-checked" : "");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = Boolean(node.attrs.checked);
  box.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const pos = getPos();
    if (pos == null) return;
    const tr = flipTaskAt(view.state, pos);
    if (tr) view.dispatch(tr);
  });
  const content = document.createElement("div");
  content.className = "pages-task-content";
  dom.append(box, content);
  return {
    dom,
    contentDOM: content,
    ignoreMutation: (mutation: ViewMutationRecord) => mutation.target !== content && !content.contains(mutation.target),
    update(next: Node) {
      if (next.type !== node.type) return false;
      box.checked = Boolean(next.attrs.checked);
      dom.classList.toggle("is-checked", Boolean(next.attrs.checked));
      node = next;
      return true;
    },
  };
}

function toggleNodeView(node: Node, view: EditorView, getPos: () => number | undefined) {
  const dom = document.createElement("div");
  dom.className = "pages-toggle" + (node.attrs.open ? " is-open" : "");
  const caret = document.createElement("button");
  caret.type = "button";
  caret.className = "pages-toggle-caret";
  caret.innerHTML = dsIcon("chevron-right");
  caret.addEventListener("mousedown", (event) => event.preventDefault());
  caret.addEventListener("click", () => {
    const pos = getPos();
    if (pos == null) return;
    const tr = setToggleOpen(view.state, pos);
    if (tr) view.dispatch(tr);
  });
  const body = document.createElement("div");
  body.className = "pages-toggle-body";
  dom.append(caret, body);
  return {
    dom,
    contentDOM: body,
    ignoreMutation: (mutation: ViewMutationRecord) => mutation.target !== body && !body.contains(mutation.target),
    update(next: Node) {
      if (next.type !== node.type) return false;
      node = next;
      dom.classList.toggle("is-open", Boolean(next.attrs.open));
      return true;
    },
  };
}

function calloutNodeView(
  node: Node,
  getPos: () => number | undefined,
  translate: Translate | undefined,
  onPick: (pos: number, anchor: HTMLElement) => void,
) {
  const dom = document.createElement("aside");
  const mark = document.createElement("button");
  mark.type = "button";
  mark.className = "pages-callout-mark";
  mark.dataset.pagesCalloutPick = "1";
  const pickLabel = t(translate, "换图标或颜色");
  mark.setAttribute("aria-label", pickLabel);
  mark.title = pickLabel;
  mark.addEventListener("mousedown", (event) => event.preventDefault());
  mark.addEventListener("click", (event) => {
    event.preventDefault();
    const pos = getPos();
    if (pos !== undefined) onPick(pos, mark);
  });
  const body = document.createElement("div");
  body.className = "pages-callout-body";
  const paint = (current: Node) => {
    node = current;
    dom.className = "pages-callout";
    dom.dataset.pagesCallout = safePagesCalloutTone(current.attrs.tone);
    mark.innerHTML = dsIcon(calloutIconFor(current.attrs.icon, current.attrs.tone));
  };
  paint(node);
  dom.append(mark, body);
  return {
    dom,
    contentDOM: body,
    ignoreMutation: (mutation: ViewMutationRecord) => mutation.target !== body && !body.contains(mutation.target),
    update(next: Node) {
      if (next.type !== node.type) return false;
      paint(next);
      return true;
    },
  };
}

function mentionNodeView(node: Node, options: PagesEditorMountOptions) {
  const dom = document.createElement("span");
  dom.className = "pages-mention";
  dom.textContent = "@" + String(node.attrs.title || "");
  dom.addEventListener("mousedown", (event) => {
    event.preventDefault();
    if (node.attrs.page_id) options.onOpenPage?.(String(node.attrs.page_id));
  });
  return {
    dom,
    ignoreMutation: () => true,
    update(next: Node) {
      if (next.type !== node.type) return false;
      node = next;
      const label = "@" + String(next.attrs.title || "");
      if (dom.textContent !== label) dom.textContent = label;
      return true;
    },
  };
}

function cardNodeView(kind: "ref" | "task" | "event", node: Node, view: EditorView, getPos: () => number | undefined, options: PagesEditorMountOptions) {
  const translate = options.translate;
  const dom = document.createElement("article");
  const paint = (current: Node) => {
    node = current;
    if (kind === "ref") {
      dom.className = "pages-card pages-card--ref";
      const title = String(current.attrs.title || "");
      const empty = !title;
      dom.innerHTML = `<span class="pages-card-mark">${dsIcon("link")}</span><span class="pages-card-body"><strong class="${empty ? "is-placeholder" : ""}">${escapeHtml(title || t(translate, "选择文档"))}</strong><span>${escapeHtml(t(translate, "文档引用"))}</span></span>`;
    } else if (kind === "task") {
      const title = String(current.attrs.title || "");
      const description = String(current.attrs.description || "");
      dom.className = "pages-card pages-card--task is-" + String(current.attrs.status || "todo");
      dom.innerHTML = `<span class="pages-card-mark">${dsIcon("clipboard")}</span><span class="pages-card-body"><strong class="${title ? "" : "is-placeholder"}">${escapeHtml(title || t(translate, "任务"))}</strong>
        <span>${escapeHtml(statusLabel(String(current.attrs.status), translate))}${current.attrs.due ? " · " + escapeHtml(String(current.attrs.due)) : ""}</span>
        ${description ? `<p>${escapeHtml(description)}</p>` : ""}</span>`;
    } else {
      const title = String(current.attrs.title || "");
      dom.className = "pages-card pages-card--event";
      dom.innerHTML = `<span class="pages-card-mark">${dsIcon("calendar")}</span><span class="pages-card-body"><strong class="${title ? "" : "is-placeholder"}">${escapeHtml(title || t(translate, "日程"))}</strong>
        <span>${escapeHtml(String(current.attrs.at || t(translate, "没有日期")))}</span></span>`;
    }
  };
  paint(node);
  dom.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const pos = getPos();
    if (pos == null) return;
    if (kind === "ref") {
      if (node.attrs.page_id) options.onOpenPage?.(String(node.attrs.page_id));
      else pickPage(view, pos, node, options);
      return;
    }
    editCard(kind, view, pos, node, options);
  });
  return {
    dom,
    ignoreMutation: () => true,
    update(next: Node) {
      if (next.type !== node.type) return false;
      paint(next);
      return true;
    },
  };
}

function statusLabel(status: string, translate: Translate | undefined): string {
  if (status === "doing") return t(translate, "进行中");
  if (status === "done") return t(translate, "完成");
  return t(translate, "待办");
}

function pickPage(view: EditorView, pos: number, node: Node, options: PagesEditorMountOptions): void {
  document.querySelector(".pages-pop[data-open=ref]")?.remove();
  const pages = options.pages?.() ?? [];
  const pop = document.createElement("div");
  pop.className = "pages-pop";
  pop.dataset.open = "ref";
  if (!pages.length) {
    const empty = document.createElement("p");
    empty.textContent = t(options.translate, "没有匹配的文档");
    pop.append(empty);
  }
  pages.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pages-slash-item";
    button.innerHTML = `<span class="pages-slash-icon">${dsIcon("note")}</span><strong>${escapeHtml(item.title)}</strong>`;
    button.addEventListener("click", () => {
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, page_id: item.id, title: item.title }));
      pop.remove();
    });
    pop.append(button);
  });
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "mw-btn mw-btn--ghost";
  cancel.textContent = t(options.translate, "取消");
  cancel.addEventListener("click", () => pop.remove());
  pop.append(cancel);
  overlayRoot().append(pop);
  placeOverlay(pop, view.coordsAtPos(pos), "below");
}

function editCard(kind: "task" | "event", view: EditorView, pos: number, node: Node, options: PagesEditorMountOptions): void {
  const existing = document.querySelector(".pages-pop[data-open=card]");
  existing?.remove();
  const pop = document.createElement("div");
  pop.className = "pages-pop";
  pop.dataset.open = "card";
  const title = field(options.translate, "标题", String(node.attrs.title || ""), "text");
  pop.append(title.label);
  if (kind === "task") {
    const description = field(options.translate, "描述", String(node.attrs.description || ""), "text");
    const status = document.createElement("label");
    status.textContent = t(options.translate, "状态");
    const select = document.createElement("select");
    [["todo", "待办"], ["doing", "进行中"], ["done", "完成"]].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = t(options.translate, label);
      if (node.attrs.status === value) option.selected = true;
      select.append(option);
    });
    status.append(select);
    const due = field(options.translate, "截止日期", String(node.attrs.due || ""), "date");
    pop.append(description.label, status, due.label);
    pop.append(actions(options.translate, () => {
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        title: title.input.value,
        description: description.input.value,
        status: select.value,
        due: due.input.value,
      }));
      pop.remove();
    }, () => pop.remove()));
  } else {
    const at = field(options.translate, "日期", String(node.attrs.at || ""), "date");
    pop.append(at.label);
    pop.append(actions(options.translate, () => {
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        title: title.input.value,
        at: at.input.value,
      }));
      pop.remove();
    }, () => pop.remove()));
  }
  overlayRoot().append(pop);
  placeOverlay(pop, view.coordsAtPos(pos), "below");
  title.input.focus();
}

function field(translate: Translate | undefined, label: string, value: string, type: string) {
  const wrap = document.createElement("label");
  wrap.textContent = t(translate, label);
  const input = document.createElement("input");
  input.className = "mw-input";
  input.type = type;
  input.value = value;
  wrap.append(input);
  return { label: wrap, input };
}

function actions(translate: Translate | undefined, ok: () => void, cancel: () => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "pages-pop-actions";
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "mw-btn mw-btn--ghost";
  dismiss.textContent = t(translate, "取消");
  dismiss.addEventListener("click", cancel);
  const save = document.createElement("button");
  save.type = "button";
  save.className = "mw-btn mw-btn--primary";
  save.textContent = t(translate, "确定");
  save.addEventListener("click", ok);
  row.append(dismiss, save);
  return row;
}

function calendarNodeView() {
  const dom = document.createElement("div");
  dom.className = "pages-calendar";
  return {
    dom,
    ignoreMutation: () => true,
    update() {
      return true;
    },
  };
}

function codeNodeView(node: Node, view: EditorView, getPos: () => number | undefined, translate: Translate | undefined) {
  const dom = document.createElement("div");
  dom.className = "pages-code-block";
  const bar = document.createElement("div");
  bar.className = "pages-code-bar";
  bar.contentEditable = "false";

  const select = document.createElement("select");
  select.className = "pages-code-language";
  select.setAttribute("aria-label", t(translate, "代码语言"));
  PAGES_CODE_LANGUAGES.forEach((language) => {
    const option = document.createElement("option");
    option.value = language.id;
    option.textContent = t(translate, language.label);
    select.append(option);
  });
  select.value = safePagesLanguage(node.attrs.language);

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "pages-code-copy";
  const copyLabel = t(translate, "复制代码");
  copy.setAttribute("aria-label", copyLabel);
  copy.title = copyLabel;
  copy.innerHTML = dsIcon("copy");

  bar.append(select, copy);
  const pre = document.createElement("pre");
  pre.className = "pages-code";
  const code = document.createElement("code");
  pre.append(code);
  dom.append(bar, pre);

  select.addEventListener("mousedown", (event) => event.stopPropagation());
  select.addEventListener("change", () => {
    const pos = getPos();
    if (pos === undefined) return;
    const current = view.state.doc.nodeAt(pos);
    if (!current) return;
    const language = safePagesLanguage(select.value);
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, language }));
    view.focus();
  });
  copy.addEventListener("mousedown", (event) => event.preventDefault());
  copy.addEventListener("click", () => {
    const pos = getPos();
    const current = pos === undefined ? null : view.state.doc.nodeAt(pos);
    void navigator.clipboard?.writeText(current?.textContent ?? "").then(() => {
      copy.classList.add("is-done");
      setTimeout(() => copy.classList.remove("is-done"), 1200);
    }, () => undefined);
  });

  const sync = (next: Node) => {
    const language = safePagesLanguage(next.attrs.language);
    if (select.value !== language) select.value = language;
    pre.dataset.language = language;
    dom.dataset.language = language;
    if (next.content.size === 0) {
      code.dataset.placeholder = t(translate, "写代码");
      code.classList.add("is-empty");
    } else {
      delete code.dataset.placeholder;
      code.classList.remove("is-empty");
    }
  };
  sync(node);

  return {
    dom,
    contentDOM: code,
    update(next: Node) {
      if (next.type !== node.type) return false;
      sync(next);
      return true;
    },
    ignoreMutation(mutation: ViewMutationRecord) {
      if (mutation.type === "selection") return false;
      return !code.contains(mutation.target as globalThis.Node);
    },
  };
}

/** Recolour code blocks only when the document actually moved; highlighting every state is wasted work. */
function codeHighlightPlugin() {
  const build = (doc: Node): DecorationSet => {
    const found: Decoration[] = [];
    doc.descendants((node, pos) => {
      if (node.type !== pagesSchema.nodes.code_block) return;
      const base = pos + 1;
      highlightRanges(node.textContent, node.attrs.language).forEach((range) => {
        found.push(Decoration.inline(base + range.from, base + range.to, { class: range.className }));
      });
    });
    return DecorationSet.create(doc, found);
  };
  return new Plugin({
    key: codeHighlightKey,
    state: {
      init: (_config, state) => build(state.doc),
      apply: (tr, value: DecorationSet, _old, next) => (tr.docChanged ? build(next.doc) : value),
    },
    props: {
      decorations(state) {
        return codeHighlightKey.getState(state);
      },
    },
  });
}

function tocNodeView() {
  const dom = document.createElement("nav");
  dom.className = "pages-toc";
  dom.setAttribute("data-pages-toc", "1");
  return {
    dom,
    ignoreMutation: () => true,
    update() {
      return true;
    },
  };
}

function calendarPlugin() {
  return new Plugin({
    view(view) {
      const paint = (next: EditorView) => {
        next.dom.querySelectorAll(".pages-calendar").forEach((host) => {
          renderCalendar(host as HTMLElement, next.state.doc);
        });
      };
      paint(view);
      return { update: paint };
    },
  });
}

function renderCalendar(host: HTMLElement, doc: Node): void {
  if (!host.isConnected) return;
  const events: Array<{ title: string; at: string; day: number }> = [];
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  doc.descendants((node) => {
    if (node.type !== pagesSchema.nodes.event_card) return;
    const at = String(node.attrs.at || "");
    const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(at);
    if (!match) return;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (date.getFullYear() !== year || date.getMonth() !== month) return;
    events.push({ title: String(node.attrs.title || ""), at, day: date.getDate() });
  });
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const today = now.getFullYear() === year && now.getMonth() === month ? now.getDate() : 0;
  const marks = new Set(events.map((item) => item.day));
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const cells: string[] = weekdays.map((label) => `<span class="is-weekday">${label}</span>`);
  for (let i = 0; i < first; i += 1) cells.push("<span></span>");
  for (let day = 1; day <= days; day += 1) {
    const on = marks.has(day);
    const titles = events.filter((item) => item.day === day).map((item) => item.title).join("、");
    const cls = [on ? "is-on" : "", day === today ? "is-today" : ""].filter(Boolean).join(" ");
    cells.push(`<span class="${cls}" title="${escapeHtml(titles)}">${day}</span>`);
  }
  host.innerHTML = `<header>${year} / ${month + 1}</header><div class="pages-calendar-grid">${cells.join("")}</div>`;
}

function refreshToc(view: EditorView, translate?: Translate): void {
  const headings: Array<{ level: number; text: string }> = [];
  view.state.doc.descendants((node) => {
    if (node.type === pagesSchema.nodes.heading) {
      headings.push({ level: node.attrs.level as number, text: node.textContent });
    }
  });
  const current = headingIndexAt(view.state.doc, view.state.selection.from);
  view.dom.querySelectorAll("[data-pages-toc]").forEach((nav) => {
    if (!(nav instanceof HTMLElement) || !nav.isConnected) return;
    nav.replaceChildren();
    const lead = document.createElement("p");
    lead.className = "pages-toc-label";
    lead.textContent = t(translate, "目录");
    nav.append(lead);
    if (!headings.length) {
      const empty = document.createElement("p");
      empty.textContent = t(translate, "还没有标题");
      nav.append(empty);
      return;
    }
    const list = document.createElement("ol");
    headings.forEach((item, index) => {
      const li = document.createElement("li");
      li.dataset.level = String(item.level);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pages-toc-jump" + (index === current ? " is-on" : "");
      button.textContent = item.text || t(translate, "无标题");
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        const tr = revealHeading(view.state, index);
        if (!tr) return;
        view.dispatch(tr);
        view.focus();
      });
      li.append(button);
      list.append(li);
    });
    nav.append(list);
  });
}

function tocPlugin(translate: Translate | undefined) {
  return new Plugin({
    view(view) {
      const paint = (next: EditorView) => refreshToc(next, translate);
      paint(view);
      return { update: paint };
    },
  });
}

function cellNav(view: EditorView, dir: 1 | -1): boolean {
  if (dir > 0 && atLastTableCell(view.state)) {
    const tr = addTableRow(view.state);
    if (!tr) return false;
    view.dispatch(tr.scrollIntoView());
    return true;
  }
  const $from = view.state.selection.$from;
  let depth = $from.depth;
  while (depth > 0 && $from.node(depth).type.name !== "table_cell" && $from.node(depth).type.name !== "table_header") {
    depth -= 1;
  }
  if (depth === 0) return false;
  const cellPos = dir > 0 ? $from.after(depth) : $from.before(depth);
  const found = TextSelection.findFrom(view.state.doc.resolve(cellPos), dir, true);
  if (!found) return false;
  view.dispatch(view.state.tr.setSelection(found).scrollIntoView());
  return true;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function applyComment(view: EditorView, from: number, to: number, text: string, id?: string): void {
  const body = text.trim();
  const nextId = body ? (id || crypto.randomUUID()) : "";
  setComment(from, to, text, nextId)(view.state, view.dispatch.bind(view));
  view.focus();
}

function insertActions(view: EditorView, text: string): void {
  const items = actionItemsFromText(text);
  const nodes = (items.length ? items : [text.trim() || ""]).map((item) => (
    pagesSchema.nodes.task_item.create({ checked: false }, paragraphNode(item))
  ));
  replaceTopBlock(view, pagesSchema.nodes.task_list.create(null, nodes));
}

function replaceSelectionText(view: EditorView, text: string): void {
  const { from, to } = view.state.selection;
  const parts = text.split(/\n{2,}/).map((part) => paragraphNode(part.trim())).filter((node) => node.textContent);
  const content = parts.length ? Fragment.from(parts) : Fragment.from(paragraphNode(text));
  const tr = view.state.tr.replaceWith(from, to, content);
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

function docPlainText(doc: Node): string {
  const lines: string[] = [];
  doc.forEach((node) => {
    const text = node.textContent.trim();
    if (text) lines.push(text);
  });
  return lines.join("\n\n");
}

function findPlugin(translate: Translate | undefined) {
  return new Plugin({
    key: findKey,
    state: {
      init: () => ({ open: false, query: "", replacement: "", index: 0 }),
      apply(tr, value) {
        const meta = tr.getMeta(findKey) as FindBar | undefined;
        if (meta) return meta;
        if (!value.open || !tr.docChanged) return value;
        const hits = findHits(tr.doc, value.query);
        return { ...value, index: hits.length ? Math.min(value.index, hits.length - 1) : 0 };
      },
    },
    props: {
      decorations(state) {
        const value = findKey.getState(state);
        if (!value?.open || !value.query.trim()) return null;
        const hits = findHits(state.doc, value.query);
        const marks = hits.map((hit, index) => Decoration.inline(hit.from, hit.to, {
          class: index === value.index ? "pages-find-hit is-current" : "pages-find-hit",
        }));
        return marks.length ? DecorationSet.create(state.doc, marks) : null;
      },
    },
    view() {
      const bar = document.createElement("div");
      bar.className = "pages-find";
      bar.hidden = true;
      const input = document.createElement("input");
      input.className = "mw-input";
      input.type = "search";
      input.placeholder = t(translate, "在文中查找");
      const count = document.createElement("span");
      count.className = "pages-find-count";
      const replaceInput = document.createElement("input");
      replaceInput.className = "mw-input";
      replaceInput.type = "text";
      replaceInput.placeholder = t(translate, "替换为");
      const replaceOne = document.createElement("button");
      replaceOne.type = "button";
      replaceOne.textContent = t(translate, "替换");
      const replaceAll = document.createElement("button");
      replaceAll.type = "button";
      replaceAll.textContent = t(translate, "全部");
      bar.append(input, count, replaceInput, replaceOne, replaceAll);
      overlayRoot().append(bar);
      const showHit = (view: EditorView, query: string, index: number) => {
        const hits = findHits(view.state.doc, query);
        const hit = hits[index];
        const tr = view.state.tr.setMeta(findKey, {
          open: true,
          query,
          replacement: findKey.getState(view.state)?.replacement ?? "",
          index,
        });
        if (hit) tr.setSelection(TextSelection.create(tr.doc, hit.from, hit.to)).scrollIntoView();
        view.dispatch(tr);
      };
      input.addEventListener("input", () => {
        const view = findView;
        if (!view) return;
        const query = input.value;
        const hits = findHits(view.state.doc, query);
        const index = hits.findIndex((hit) => hit.from >= view.state.selection.from);
        showHit(view, query, index >= 0 ? index : 0);
      });
      input.addEventListener("keydown", (event) => {
        const view = findView;
        if (!view) return;
        if (event.key === "Escape") {
          event.preventDefault();
          view.dispatch(view.state.tr.setMeta(findKey, {
            open: false,
            query: input.value,
            replacement: replaceInput.value,
            index: 0,
          }));
          view.focus();
          return;
        }
        if (event.key !== "Enter") return;
        event.preventDefault();
        const value = findKey.getState(view.state);
        const hits = findHits(view.state.doc, value?.query ?? input.value);
        if (!hits.length || !value) return;
        const index = stepFindHit(hits, view.state.selection.from, event.shiftKey ? -1 : 1);
        showHit(view, value.query, index);
      });
      const runReplace = (view: EditorView, all: boolean) => {
        const value = findKey.getState(view.state);
        if (!value?.query.trim()) return;
        const replacement = replaceInput.value;
        if (all) {
          const next = replaceAllFindHits(view.state.doc, value.query, replacement);
          if (!next) return;
          const tr = view.state.tr.replace(0, view.state.doc.content.size, next.slice(0));
          const hits = findHits(tr.doc, value.query);
          tr.setMeta(findKey, { open: true, query: value.query, replacement, index: 0 });
          const hit = hits[0];
          if (hit) tr.setSelection(TextSelection.create(tr.doc, hit.from, hit.to)).scrollIntoView();
          view.dispatch(tr);
          return;
        }
        const plan = replaceFindHit(view.state.doc, value.query, value.index, replacement);
        if (!plan) return;
        const tr = plan.text
          ? view.state.tr.replaceWith(plan.from, plan.to, plan.text)
          : view.state.tr.delete(plan.from, plan.to);
        const caret = plan.from + (plan.text?.text?.length ?? 0);
        const hits = findHits(tr.doc, value.query);
        let index = hits.findIndex((hit) => hit.from >= caret);
        if (index < 0) index = 0;
        tr.setMeta(findKey, { open: true, query: value.query, replacement, index: hits.length ? index : 0 });
        const hit = hits[index];
        if (hit) tr.setSelection(TextSelection.create(tr.doc, hit.from, hit.to));
        else tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(Math.max(caret, 1), tr.doc.content.size))));
        view.dispatch(tr.scrollIntoView());
      };
      replaceInput.addEventListener("input", () => {
        const view = findView;
        if (!view) return;
        const value = findKey.getState(view.state);
        if (!value) return;
        view.dispatch(view.state.tr.setMeta(findKey, { ...value, replacement: replaceInput.value }));
      });
      replaceInput.addEventListener("keydown", (event) => {
        const view = findView;
        if (!view) return;
        if (event.key === "Escape") {
          event.preventDefault();
          view.dispatch(view.state.tr.setMeta(findKey, {
            open: false,
            query: input.value,
            replacement: replaceInput.value,
            index: 0,
          }));
          view.focus();
          return;
        }
        if (event.key !== "Enter") return;
        event.preventDefault();
        runReplace(view, event.metaKey || event.ctrlKey);
      });
      const keepFindFocus = (event: MouseEvent) => event.preventDefault();
      replaceOne.addEventListener("mousedown", keepFindFocus);
      replaceAll.addEventListener("mousedown", keepFindFocus);
      replaceOne.addEventListener("click", () => { if (findView) runReplace(findView, false); });
      replaceAll.addEventListener("click", () => { if (findView) runReplace(findView, true); });
      return {
        update(view) {
          findView = view;
          const value = findKey.getState(view.state);
          bar.hidden = !value?.open;
          if (!value?.open) return;
          if (document.activeElement !== input && input.value !== value.query) input.value = value.query;
          if (document.activeElement !== replaceInput && replaceInput.value !== value.replacement) {
            replaceInput.value = value.replacement;
          }
          const hits = findHits(view.state.doc, value.query);
          count.textContent = hits.length ? `${Math.min(value.index, hits.length - 1) + 1}/${hits.length}` : "0";
        },
        destroy() {
          findView = null;
          bar.remove();
        },
      };
    },
  });
}

let findView: EditorView | null = null;

function openFind(view: EditorView): void {
  const { from, to, empty } = view.state.selection;
  const current = findKey.getState(view.state);
  let query = current?.query ?? "";
  if (!empty && to - from <= 40) {
    const selected = view.state.doc.textBetween(from, to, "\n");
    if (selected && !selected.includes("\n")) query = selected;
  }
  const hits = findHits(view.state.doc, query);
  const index = Math.max(0, hits.findIndex((hit) => hit.from >= from));
  const tr = view.state.tr.setMeta(findKey, {
    open: true,
    query,
    replacement: current?.replacement ?? "",
    index: hits.length ? index : 0,
  });
  view.dispatch(tr);
  requestAnimationFrame(() => {
    const input = document.querySelector<HTMLInputElement>(".pages-find input");
    input?.focus();
    input?.select();
  });
}

function dispatchList(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  id: "bullet_list" | "ordered_list" | "task_list",
): boolean {
  const tr = applyListSelection(state, id);
  if (!tr) return false;
  dispatch?.(tr);
  return true;
}

export function mount(host: HTMLElement, options: PagesEditorMountOptions = {}): PagesEditorHandle {
  host.replaceChildren();
  const toolbar = document.createElement("div");
  toolbar.className = "pages-format-bar";
  toolbar.hidden = true;
  const linkPreview = document.createElement("div");
  linkPreview.className = "pages-link-preview";
  linkPreview.hidden = true;
  const linkLabel = document.createElement("span");
  const linkOpen = document.createElement("button");
  linkOpen.type = "button";
  linkOpen.textContent = t(options.translate, "打开");
  const linkEdit = document.createElement("button");
  linkEdit.type = "button";
  linkEdit.textContent = t(options.translate, "编辑");
  linkPreview.append(linkLabel, linkOpen, linkEdit);
  const commentPreview = document.createElement("div");
  commentPreview.className = "pages-comment-preview";
  commentPreview.hidden = true;
  const commentText = document.createElement("p");
  const commentEdit = document.createElement("button");
  commentEdit.type = "button";
  commentEdit.textContent = t(options.translate, "编辑");
  commentPreview.append(commentText, commentEdit);
  const buttons: Array<{ name: string; label: string; icon?: string; gap?: boolean; run?: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean; action?: string }> = [
    { name: "strong", label: t(options.translate, "加粗"), run: commandToggle("strong") },
    { name: "em", label: t(options.translate, "斜体"), run: commandToggle("em") },
    { name: "underline", label: t(options.translate, "下划线"), run: commandToggle("underline") },
    { name: "strike", label: t(options.translate, "删除线"), run: commandToggle("strike") },
    { name: "code", label: t(options.translate, "代码"), icon: "code", run: commandToggle("code") },
    { name: "h1", label: t(options.translate, "标题 1"), gap: true, run: headingCommand(1) },
    { name: "h2", label: t(options.translate, "标题 2"), run: headingCommand(2) },
    { name: "h3", label: t(options.translate, "标题 3"), run: headingCommand(3) },
    { name: "ul", label: t(options.translate, "无序列表"), icon: "rows", gap: true, run: (state, dispatch) => dispatchList(state, dispatch, "bullet_list") },
    { name: "ol", label: t(options.translate, "有序列表"), icon: "list-ordered", run: (state, dispatch) => dispatchList(state, dispatch, "ordered_list") },
    { name: "task", label: t(options.translate, "清单"), icon: "check", run: (state, dispatch) => dispatchList(state, dispatch, "task_list") },
    { name: "tone", label: t(options.translate, "颜色"), gap: true, action: "tone" },
    { name: "link", label: t(options.translate, "链接"), icon: "link", action: "link" },
    { name: "comment", label: t(options.translate, "评论"), icon: "message", action: "comment" },
    { name: "ai", label: "AI", icon: "sparkles", action: "ai" },
  ];
  const buttonEls = buttons.map((item) => {
    if (item.gap) {
      const gap = document.createElement("span");
      gap.className = "pages-format-gap";
      toolbar.append(gap);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.mark = item.name;
    button.setAttribute("aria-label", item.label);
    button.title = item.label;
    if (item.icon) button.innerHTML = dsIcon(item.icon);
    else button.textContent = ({ strong: "B", em: "I", underline: "U", strike: "S", h1: "H1", h2: "H2", h3: "H3", tone: "A" } as Record<string, string>)[item.name] || item.label;
    toolbar.append(button);
    return { item, button };
  });
  overlayRoot().append(toolbar, linkPreview, commentPreview);

  const pop = document.createElement("div");
  pop.className = "pages-pop";
  pop.hidden = true;
  overlayRoot().append(pop);

  const hidePop = () => {
    const restoreFocus = pop.contains(document.activeElement);
    pop.hidden = true;
    pop.replaceChildren();
    if (restoreFocus) view.focus();
  };

  const openNote = (view: EditorView, index: number) => {
    const node = view.state.doc.child(index);
    const pos = blockPos(view.state.doc, index);
    pop.hidden = false;
    pop.replaceChildren();
    const area = document.createElement("textarea");
    area.className = "mw-input";
    area.rows = 4;
    area.placeholder = t(options.translate, "块备注");
    area.value = String(node.attrs.note || "");
    pop.append(area);
    pop.append(actions(options.translate, () => {
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, note: area.value.trim() }));
      hidePop();
    }, hidePop));
    placeOverlay(pop, view.coordsAtPos(pos + 1), "above");
    area.focus();
  };

  const openComment = (view: EditorView) => {
    const found = commentAt(view.state.doc, view.state.selection);
    if (!found) return;
    pop.hidden = false;
    pop.replaceChildren();
    const area = document.createElement("textarea");
    area.className = "mw-input";
    area.rows = 3;
    area.placeholder = t(options.translate, "评论");
    area.value = found.text;
    pop.append(area);
    pop.append(actions(options.translate, () => {
      applyComment(view, found.from, found.to, area.value, found.id);
      hidePop();
    }, hidePop));
    placeOverlay(pop, view.coordsAtPos(found.from), "below");
    area.focus();
  };

  const openTone = (view: EditorView) => {
    pop.hidden = false;
    pop.replaceChildren();
    const rows: Array<{ kind: "font_color" | "highlight"; label: string }> = [
      { kind: "font_color", label: t(options.translate, "文字颜色") },
      { kind: "highlight", label: t(options.translate, "背景色") },
    ];
    rows.forEach(({ kind, label }) => {
      const current = toneAt(view.state, kind);
      const head = document.createElement("p");
      head.className = "pages-menu-label";
      head.textContent = label;
      const strip = document.createElement("div");
      strip.className = "pages-tone-strip";
      const swatch = (tone: string, name: string) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "pages-tone" + (current === tone ? " is-on" : "");
        button.dataset.pagesTone = tone || "none";
        button.dataset.pagesToneKind = kind;
        button.setAttribute("aria-label", name);
        button.title = name;
        strip.append(button);
      };
      swatch("", t(options.translate, "默认"));
      PAGES_TONES.forEach((tone) => swatch(tone.id, t(options.translate, tone.label)));
      strip.addEventListener("mousedown", (event) => event.preventDefault());
      strip.addEventListener("click", (event) => {
        const button = (event.target as HTMLElement).closest<HTMLElement>("[data-pages-tone]");
        if (!button) return;
        event.preventDefault();
        const tone = button.dataset.pagesTone === "none" ? "" : String(button.dataset.pagesTone);
        runBlockCommand(view, setTone(kind, tone));
        hidePop();
      });
      pop.append(head, strip);
    });
    placeOverlay(pop, view.coordsAtPos(view.state.selection.from), "below");
  };

  const openCalloutStyle = (view: EditorView, pos: number, anchor: HTMLElement) => {
    const node = view.state.doc.nodeAt(pos);
    if (!node) return;
    pop.hidden = false;
    pop.replaceChildren();

    const iconHead = document.createElement("p");
    iconHead.className = "pages-menu-label";
    iconHead.textContent = t(options.translate, "图标");
    const grid = document.createElement("div");
    grid.className = "pages-icon-grid";
    const currentIcon = calloutIconFor(node.attrs.icon, node.attrs.tone);
    PAGES_CALLOUT_ICONS.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pages-icon-pick" + (currentIcon === item.id ? " is-on" : "");
      button.innerHTML = dsIcon(item.id);
      const label = t(options.translate, item.label);
      button.setAttribute("aria-label", label);
      button.title = label;
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", (event) => {
        event.preventDefault();
        runBlockCommand(view, setCalloutStyle(pos, { icon: item.id }));
        hidePop();
      });
      grid.append(button);
    });

    const toneHead = document.createElement("p");
    toneHead.className = "pages-menu-label";
    toneHead.textContent = t(options.translate, "颜色");
    const strip = document.createElement("div");
    strip.className = "pages-tone-strip";
    const currentTone = safePagesCalloutTone(node.attrs.tone);
    PAGES_TONES.forEach((tone) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pages-tone" + (currentTone === tone.id ? " is-on" : "");
      button.dataset.pagesTone = tone.id;
      const label = t(options.translate, tone.label);
      button.setAttribute("aria-label", label);
      button.title = label;
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", (event) => {
        event.preventDefault();
        runBlockCommand(view, setCalloutStyle(pos, { tone: tone.id }));
        hidePop();
      });
      strip.append(button);
    });

    pop.append(iconHead, grid, toneHead, strip);
    placeOverlay(pop, anchor.getBoundingClientRect(), "below");
  };

  const openLink = (view: EditorView) => {
    const found = linkAt(view.state.doc, view.state.selection);
    if (!found) return;
    pop.hidden = false;
    pop.replaceChildren();
    const field = document.createElement("input");
    field.className = "mw-input";
    field.type = "url";
    field.setAttribute("aria-label", t(options.translate, "链接"));
    field.placeholder = "https://";
    field.value = found.href;
    const error = document.createElement("p");
    error.className = "pages-pop-error";
    error.setAttribute("role", "alert");
    error.hidden = true;
    const commit = () => {
      if (field.value.trim() && !safePagesHref(field.value)) {
        error.textContent = t(options.translate, "请输入有效链接，例如 https://example.com");
        error.hidden = false;
        field.setAttribute("aria-invalid", "true");
        field.focus();
        return;
      }
      runBlockCommand(view, setLink(found.from, found.to, field.value));
      hidePop();
    };
    field.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      commit();
    });
    pop.append(field, error);
    const row = actions(options.translate, commit, hidePop);
    if (found.href) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mw-btn mw-btn--ghost";
      remove.textContent = t(options.translate, "移除链接");
      remove.addEventListener("click", () => {
        runBlockCommand(view, setLink(found.from, found.to, ""));
        hidePop();
      });
      row.prepend(remove);
    }
    pop.append(row);
    placeOverlay(pop, view.coordsAtPos(found.from), "below");
    field.focus();
    field.select();
  };

  const openAi = (view: EditorView) => {
    if (!options.runAi) return;
    pop.hidden = false;
    pop.replaceChildren();
    const title = document.createElement("p");
    title.textContent = t(options.translate, "写作");
    pop.append(title);
    const commands: Array<{ id: string; label: string; style?: string }> = [
      { id: "translate", label: "翻译" },
      { id: "rewrite", label: "改写 · 更短", style: "concise" },
      { id: "rewrite", label: "改写 · 更展开", style: "expand" },
      { id: "rewrite", label: "改写 · 更正式", style: "formal" },
      { id: "rewrite", label: "改写 · 更口语", style: "casual" },
      { id: "expand", label: "扩写" },
      { id: "continue", label: "续写" },
      { id: "outline", label: "大纲" },
      { id: "summarize", label: "总结" },
      { id: "explain", label: "解释" },
      { id: "bullets", label: "要点" },
      { id: "actions", label: "行动项" },
      { id: "reader", label: "读者视角" },
      { id: "coach", label: "写作教练" },
      { id: "translate_new", label: "整篇翻译成新文档" },
      { id: "proofread", label: "全文校对" },
    ];
    commands.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mw-menu__item";
      button.innerHTML = `<span>${escapeHtml(t(options.translate, item.label))}</span>`;
      button.addEventListener("click", () => { void runAiCommand(view, item.id, item.style); });
      pop.append(button);
    });
    placeOverlay(pop, view.coordsAtPos(view.state.selection.from), "below");
  };

  const showCandidate = (view: EditorView, command: string, result: { text: string; stub?: boolean }, source: string) => {
    pop.hidden = false;
    pop.replaceChildren();
    const lead = document.createElement("p");
    lead.textContent = result.stub ? t(options.translate, "未接模型") : t(options.translate, "候选");
    const area = document.createElement("textarea");
    area.className = "mw-input";
    area.rows = 8;
    area.value = result.text;
    pop.append(lead, area);
    pop.append(actions(options.translate, () => {
      if (command === "actions") insertActions(view, area.value);
      else if (command === "proofread") {
        const next = nodeFromUnknown({
          type: "doc",
          content: area.value.split(/\n{2,}/).map((part) => paragraphNode(part.trim()).toJSON()),
        });
        view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, next.content));
      } else if (command === "translate_new") {
        void options.onCreateFromAi?.({ title: t(options.translate, "翻译"), text: area.value });
      } else replaceSelectionText(view, area.value);
      hidePop();
    }, hidePop));
    placeOverlay(pop, view.coordsAtPos(view.state.selection.from), "below");
    void source;
  };

  const runAiCommand = async (view: EditorView, command: string, style?: string) => {
    if (!options.runAi) return;
    const selected = view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, "\n");
    const text = command === "translate_new" || command === "proofread" || !selected.trim()
      ? docPlainText(view.state.doc)
      : selected;
    pop.innerHTML = `<p>${escapeHtml(t(options.translate, "正在处理"))}</p>`;
    try {
      const result = await options.runAi({ command, text, style });
      showCandidate(view, command, result, text);
    } catch (error) {
      pop.innerHTML = `<p class="pages-pop-error">${escapeHtml(error instanceof Error ? error.message : t(options.translate, "写作失败"))}</p>`;
    }
  };

  const listItem = pagesSchema.nodes.list_item;
  let view!: EditorView;
  const turnCurrent = (id: string) => {
    const group = hoveredGroup(view);
    const grouped = group ? turnGroup(view.state, group.anchor, group.head, id) : null;
    if (grouped) {
      view.dispatch(grouped.scrollIntoView());
      view.focus();
      return true;
    }
    let tr: Transaction | null = null;
    if (id === "heading1" || id === "heading2" || id === "heading3") {
      tr = applyHeading(view.state, Number(id.slice(-1)) as 1 | 2 | 3);
    } else if (id === "bullet_list" || id === "ordered_list" || id === "task_list") {
      tr = applyListSelection(view.state, id);
    }
    if (!tr) tr = turnRowInto(view.state, id);
    if (!tr) return false;
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return true;
  };
  const plugins = [
    history(),
    slashPlugin(options.translate),
    mentionPlugin(options),
    keymap({
      "Mod-z": undo,
      "Mod-y": redo,
      "Mod-Shift-z": redo,
      "Mod-c": (state, _dispatch, editor) => {
        if (state.selection.empty || !editor) return false;
        return document.execCommand("copy");
      },
      "Mod-x": (state, _dispatch, editor) => {
        if (state.selection.empty || !editor) return false;
        return document.execCommand("cut");
      },
      "Mod-b": commandToggle("strong"),
      "Mod-i": commandToggle("em"),
      "Mod-u": commandToggle("underline"),
      "Mod-e": commandToggle("code"),
      "Mod-Shift-x": commandToggle("strike"),
      "Mod-k": () => {
        openLink(view);
        return true;
      },
      "Mod-f": (_state, _dispatch, editor) => {
        if (!editor) return false;
        openFind(editor);
        return true;
      },
      "Shift-Enter": (state, dispatch, editor) => {
        const group = editor ? hoveredGroup(editor) : null;
        if (group) {
          const tr = hardBreakAtSpanEnd(state, group.anchor, group.head);
          if (tr && dispatch) dispatch(tr);
          return true;
        }
        return insertHardBreak(state, dispatch);
      },
      "Mod-d": () => {
        if (duplicateHoveredGroup(view)) return true;
        const tr = duplicateEnclosingRow(view.state);
        if (!tr) return false;
        view.dispatch(tr.scrollIntoView());
        view.focus();
        return true;
      },
      "Mod-Enter": (state, dispatch, editor) => {
        if (editor) {
          const group = hoveredGroup(editor);
          const flipped = group ? toggleTaskGroup(state, group.anchor, group.head) : null;
          if (flipped) {
            if (dispatch) dispatch(flipped.scrollIntoView());
            return true;
          }
        }
        return toggleTaskChecked(state, dispatch);
      },
      "Mod-Alt-0": () => turnCurrent("paragraph"),
      "Mod-Alt-1": () => turnCurrent("heading1"),
      "Mod-Alt-2": () => turnCurrent("heading2"),
      "Mod-Alt-3": () => turnCurrent("heading3"),
      "Mod-Shift-8": () => turnCurrent("bullet_list"),
      "Mod-Shift-7": () => turnCurrent("ordered_list"),
      "Mod-Shift-9": () => turnCurrent("task_list"),
      Enter: chainCommands(
        confirmCodeFence,
        (state, dispatch, editorView) => {
          const group = editorView ? hoveredGroup(editorView) : null;
          if (!group) return false;
          const tr = insertAfterSpan(state, group.anchor, group.head);
          if (!tr) return false;
          if (dispatch) dispatch(tr.setMeta(hoverKey, { span: null }));
          return true;
        },
        (state, dispatch) => applySelected(insertAfterSelectedBlock(state), dispatch),
        leaveEmptyCodeLine,
        enterInToggle,
        exitWrappedBlock,
        splitListItem(listItem),
        enterHeading,
      ),
      Backspace: (state, dispatch, editor) => {
        if (editor && dropHoveredGroup(editor)) return true;
        return chainCommands(undoInputRule, dropSelectedBlock, moveTableEdge("left"), collapseEmptyColumn, unwrapAtStart, baseKeymap.Backspace)(state, dispatch, editor);
      },
      Delete: (state, dispatch, editor) => {
        if (editor && dropHoveredGroup(editor)) return true;
        return chainCommands(dropSelectedBlock, moveTableEdge("right"), baseKeymap.Delete)(state, dispatch, editor);
      },
      "Mod-\\": (state, dispatch, editor) => {
        if (editor) {
          const group = hoveredGroup(editor);
          if (group) {
            const tr = clearSpanMarks(state, group.anchor, group.head);
            if (!tr) return false;
            if (dispatch) dispatch(tr.scrollIntoView());
            return true;
          }
        }
        return clearInlineMarks(state, dispatch);
      },
      "Mod-a": selectBlockThenAll,
      "Mod-Shift-ArrowUp": () => nudgeEditor(view, -1),
      "Mod-Shift-ArrowDown": () => nudgeEditor(view, 1),
      "Mod-Alt-ArrowLeft": () => nudgeTableColumn(view, -1),
      "Mod-Alt-ArrowRight": () => nudgeTableColumn(view, 1),
      ArrowLeft: (state, dispatch) => applySelected(collapseSelectedBlock(state, "start"), dispatch) || applySelected(selectNeighborAtom(state, -1), dispatch) || moveTableEdge("left")(state, dispatch) || moveColumnEdge("left")(state, dispatch),
      ArrowRight: (state, dispatch) => applySelected(collapseSelectedBlock(state, "end"), dispatch) || applySelected(selectNeighborAtom(state, 1), dispatch) || moveTableEdge("right")(state, dispatch) || moveColumnEdge("right")(state, dispatch),
      ArrowDown: (state, dispatch) => {
        const moved = moveSelectedBlock(state, 1);
        if (moved && (moved.docChanged || moved.selectionSet)) {
          if (dispatch) dispatch(moved.scrollIntoView());
          return true;
        }
        if (moved) {
          const extra = continuePastEnd(state);
          if (extra && dispatch) dispatch(extra);
          return true;
        }
        if (moveTableEdge("down")(state, dispatch)) return true;
        if (moveColumnEdge("down")(state, dispatch)) return true;
        if (leaveCodeDown(state, dispatch)) return true;
        if (applySelected(selectNeighborAtom(state, 1), dispatch)) return true;
        const extra = continuePastEnd(state);
        if (!extra) return false;
        if (dispatch) dispatch(extra);
        return true;
      },
      ArrowUp: (state, dispatch) => {
        const moved = moveSelectedBlock(state, -1);
        if (moved && (moved.docChanged || moved.selectionSet)) {
          if (dispatch) dispatch(moved.scrollIntoView());
          return true;
        }
        if (moved) {
          const extra = continueBeforeStart(state);
          if (extra && dispatch) dispatch(extra);
          return true;
        }
        if (moveTableEdge("up")(state, dispatch)) return true;
        if (moveColumnEdge("up")(state, dispatch)) return true;
        if (leaveCodeUp(state, dispatch)) return true;
        if (applySelected(selectNeighborAtom(state, -1), dispatch)) return true;
        const extra = continueBeforeStart(state);
        if (!extra) return false;
        if (dispatch) dispatch(extra);
        return true;
      },
      Tab: (state, dispatch, current) => {
        if (current && cellNav(current, 1)) return true;
        if (insertCodeIndent(state, dispatch)) return true;
        if (indentListItem(state, dispatch)) return true;
        const hover = current ? hoverKey.getState(current.state) : null;
        const nested = indentUnderPrevious(state, hover && hover.anchor >= 0 ? hover.anchor : -1, hover && hover.head >= 0 ? hover.head : -1);
        if (nested && dispatch) dispatch(nested.setMeta(hoverKey, { span: null }).scrollIntoView());
        return true;
      },
      "Shift-Tab": (state, dispatch, current) => {
        if (current && cellNav(current, -1)) return true;
        if (removeCodeIndent(state, dispatch)) return true;
        if (outdentListItem(state, dispatch)) return true;
        const hover = current ? hoverKey.getState(current.state) : null;
        const lifted = outdentFromContainer(state, hover && hover.anchor >= 0 ? hover.anchor : -1, hover && hover.head >= 0 ? hover.head : -1);
        if (lifted && dispatch) dispatch(lifted.setMeta(hoverKey, { span: null }).scrollIntoView());
        return true;
      },
    }),
    keymap({ Enter: splitTaskItem }),
    keymap(baseKeymap),
    pagesInputRules(),
    gapCursor(),
    dropCursor({ width: 3, color: false, class: "pages-native-drop" }),
    chromePlugin(options.translate),
    codeHighlightPlugin(),
    hoverHandlePlugin(options.translate, (index) => openNote(view, index)),
    tocPlugin(options.translate),
    calendarPlugin(),
    findPlugin(options.translate),
    keymap({ Escape: selectEnclosingBlock }),
  ];

  const placeToolbar = (current: EditorView) => {
    const { from, to, empty } = current.state.selection;
    if (empty || !(current.state.selection instanceof TextSelection)) {
      toolbar.hidden = true;
      return;
    }
    const start = current.coordsAtPos(from);
    const end = current.coordsAtPos(to);
    toolbar.hidden = false;
    const left = (start.left + end.left) / 2 - toolbar.offsetWidth / 2;
    placeOverlay(toolbar, { left, right: left + toolbar.offsetWidth, top: start.top, bottom: end.bottom }, "above");
    const list = listKindAt(current.state);
    const heading = headingLevelAt(current.state);
    buttonEls.forEach(({ item, button }) => {
      const mark = pagesSchema.marks[item.name];
      const listOn = (item.name === "ul" && list === "bullet_list")
        || (item.name === "ol" && list === "ordered_list")
        || (item.name === "task" && list === "task_list");
      const headingOn = (item.name === "h1" && heading === 1)
        || (item.name === "h2" && heading === 2)
        || (item.name === "h3" && heading === 3);
      const markOn = Boolean(mark) && markCovers(current.state.doc, from, to, item.name);
      const active = listOn || headingOn || markOn;
      button.classList.toggle("is-on", active);
      if (item.run) button.setAttribute("aria-pressed", String(active));
    });
  };

  const placeLinkPreview = (current: EditorView) => {
    const selection = current.state.selection;
    if (!selection.empty || !(selection instanceof TextSelection)) {
      linkPreview.hidden = true;
      return;
    }
    const found = linkAt(current.state.doc, selection);
    if (!found?.href) {
      linkPreview.hidden = true;
      return;
    }
    linkLabel.textContent = bookmarkLabel(found.href) || found.href;
    linkPreview.hidden = false;
    const start = current.coordsAtPos(found.from);
    const end = current.coordsAtPos(found.to);
    placeOverlay(linkPreview, { left: start.left, right: end.left, top: start.top, bottom: end.bottom }, "above");
  };

  const placeCommentPreview = (current: EditorView) => {
    const selection = current.state.selection;
    if (!selection.empty || !(selection instanceof TextSelection)) {
      commentPreview.hidden = true;
      return;
    }
    const found = commentAt(current.state.doc, selection);
    if (!found?.text) {
      commentPreview.hidden = true;
      return;
    }
    commentText.textContent = found.text;
    commentPreview.hidden = false;
    const start = current.coordsAtPos(found.from);
    const end = current.coordsAtPos(found.to);
    placeOverlay(commentPreview, { left: start.left, right: end.left, top: start.top, bottom: end.bottom }, "below");
  };

  view = new EditorView(host, {
    attributes: { role: "textbox", "aria-multiline": "true", "aria-label": t(options.translate, "文档正文") },
    state: EditorState.create({
      doc: nodeFromUnknown(options.doc),
      plugins,
    }),
    nodeViews: {
      column: (node, current, getPos) => columnNodeView(node, current, getPos, options.translate),
      image: (node, current, getPos) => imageNodeView(node, current, getPos, options.translate),
      bookmark: (node, current, getPos) => bookmarkNodeView(node, current, getPos, options.translate),
      table_cell: (node, current, getPos) => cellNodeView(node, current, getPos, options.translate),
      table_header: (node, current, getPos) => cellNodeView(node, current, getPos, options.translate),
      task_item: (node, current, getPos) => taskNodeView(node, current, getPos),
      toggle: (node, current, getPos) => toggleNodeView(node, current, getPos),
      callout: (node, current, getPos) => calloutNodeView(node, getPos, options.translate,
        (pos, anchor) => openCalloutStyle(current, pos, anchor)),
      page_mention: (node) => mentionNodeView(node, options),
      page_ref: (node, current, getPos) => cardNodeView("ref", node, current, getPos, options),
      task_card: (node, current, getPos) => cardNodeView("task", node, current, getPos, options),
      event_card: (node, current, getPos) => cardNodeView("event", node, current, getPos, options),
      calendar: () => calendarNodeView(),
      toc: () => tocNodeView(),
      code_block: (node, current, getPos) => codeNodeView(node, current, getPos, options.translate),
    },
    dispatchTransaction(tr) {
      const next = view.state.apply(tr);
      view.updateState(next);
      placeToolbar(view);
      placeLinkPreview(view);
      placeCommentPreview(view);
      if (tr.docChanged) options.onChange?.();
    },
    handleTextInput(current, _from, _to, text) {
      if (text === " ") {
        const group = hoveredGroup(current);
        const flipped = group ? toggleTaskGroup(current.state, group.anchor, group.head) : null;
        if (flipped) {
          current.dispatch(flipped);
          return true;
        }
        if (current.state.selection instanceof NodeSelection
          && current.state.selection.node.type === pagesSchema.nodes.task_item
          && toggleTaskChecked(current.state, current.dispatch.bind(current))) return true;
      }
      const hover = hoverKey.getState(current.state);
      if (hover && hover.anchor >= 0 && hover.head >= 0 && hover.anchor !== hover.head) {
        const tr = replaceSpan(current.state, hover.anchor, hover.head, text);
        if (tr) current.dispatch(tr.setMeta(hoverKey, { span: null, pos: -1 }).scrollIntoView());
        return true;
      }
      if (!(current.state.selection instanceof NodeSelection)) return false;
      const tr = replaceSelectedBlock(current.state, text);
      if (tr) current.dispatch(tr.scrollIntoView());
      return true;
    },
    handleTripleClick(current, pos) {
      const target = tripleClickSelection(current.state.doc, pos);
      if (!target) return false;
      const tr = current.state.tr;
      if (target.atom) {
        try { tr.setSelection(NodeSelection.create(tr.doc, target.from)); }
        catch { return false; }
      } else {
        tr.setSelection(TextSelection.create(tr.doc, target.from, target.to));
      }
      current.dispatch(tr);
      return true;
    },
    handleClick(_current, _pos, event) {
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return false;
      const href = safePagesHref(anchor.getAttribute("href"));
      const bookmark = anchor.closest("[data-pages-bookmark], .pages-bookmark");
      if (bookmark && !linkClickOpens(event)) {
        event.preventDefault();
        return false;
      }
      if (!href || !linkClickOpens(event)) return false;
      event.preventDefault();
      window.open(href, "_blank", "noopener,noreferrer");
      return true;
    },
    handlePaste(current, event) {
      const file = clipboardImage(event.clipboardData);
      if (file) {
        event.preventDefault();
        readLocalImage(file, (src) => {
          const tr = insertImage(current.state, src);
          if (tr) current.dispatch(tr.scrollIntoView());
        });
        return true;
      }
      const text = event.clipboardData?.getData("text/plain") ?? "";
      const plainPaste = "shiftKey" in event && Boolean((event as { shiftKey?: boolean }).shiftKey);
      const group = hoveredGroup(current);
      if (group && text) {
        const nodes = nodesForSpanPaste(text, plainPaste);
        const replaced = nodes ? replaceSpanWithNodes(current.state, group.anchor, group.head, nodes) : null;
        if (replaced) {
          event.preventDefault();
          current.dispatch(replaced.setMeta(hoverKey, { span: null, pos: -1 }));
          return true;
        }
      }
      if (plainPaste) {
        const plain = pastePlain(current.state, text);
        if (!plain) return false;
        event.preventDefault();
        current.dispatch(plain.scrollIntoView());
        return true;
      }
      const linked = pasteUrl(current.state, text);
      if (linked) {
        event.preventDefault();
        current.dispatch(linked.scrollIntoView());
        return true;
      }
      const html = event.clipboardData?.getData("text/html") ?? "";
      const marks = /data-pages-ink|data-pages-wash|<\s*u[\s>]|<\s*mark[\s>]/i.test(html);
      if (html && typeof DOMParser !== "undefined" && (!markdownLooksStructured(text) || marks)) {
        const body = new DOMParser().parseFromString(html, "text/html").body;
        const nodes: Array<PasteLeaf | string> = [];
        body.childNodes.forEach((child) => {
          const next = leafFromDom(child);
          if (typeof next === "string") nodes.push(next);
          else if (next) nodes.push(next);
        });
        const rich = nodes.length ? pasteHtml(current.state, nodes) : null;
        if (rich) {
          event.preventDefault();
          current.dispatch(rich.scrollIntoView());
          return true;
        }
      }
      const pasted = pasteMarkdown(current.state, text);
      if (!pasted) return false;
      event.preventDefault();
      current.dispatch(pasted.scrollIntoView());
      return true;
    },
    handleDrop(current, event) {
      const file = clipboardImage(event.dataTransfer);
      if (!file) return false;
      event.preventDefault();
      if (!acceptedImageFile(file)) return true;
      const point = current.posAtCoords({ left: event.clientX, top: event.clientY });
      if (point) {
        const selection = TextSelection.near(current.state.doc.resolve(point.pos));
        current.dispatch(current.state.tr.setSelection(selection));
      }
      readClipboardImage(file, (src) => {
        const placed = insertImage(current.state, src);
        if (placed) current.dispatch(placed.scrollIntoView());
      });
      return true;
    },
    handleDOMEvents: {
      mousedown(current, event) {
        if (event.shiftKey && event.button === 0 && !event.altKey && !event.metaKey && !event.ctrlKey) {
          const target = event.target instanceof Element ? event.target : null;
          const inChrome = target?.closest("[data-pages-grip], [data-pages-plus], [data-pages-gap], .pages-block-menu, .pages-provisional");
          const hover = hoverKey.getState(current.state);
          const anchor = hover && hover.anchor >= 0 ? hover.anchor : -1;
          if (!inChrome && anchor >= 0 && target && current.dom.contains(target)) {
            const point = current.posAtCoords({ left: event.clientX, top: event.clientY });
            const span = point ? blockSpanToRow(current.state.doc, anchor, point.pos) : null;
            if (span) {
              event.preventDefault();
              const tr = current.state.tr.setMeta(hoverKey, { span, pos: span.head });
              try { tr.setSelection(NodeSelection.create(tr.doc, span.head)); } catch { /* the caret stays */ }
              current.dispatch(tr);
            } else if (point) {
              event.preventDefault();
            }
            if (span || point) return true;
          }
        }
        if (event.button !== 0 || event.target !== current.dom) return false;
        const end = current.coordsAtPos(current.state.doc.content.size);
        if (event.clientY <= end.bottom + 8) return false;
        const tr = focusBelowContent(current.state);
        if (tr) current.dispatch(tr);
        current.focus();
        event.preventDefault();
        return true;
      },
      copy(current, event) {
        return writeSpanClipboard(current, event, false);
      },
      cut(current, event) {
        return writeSpanClipboard(current, event, true);
      },
      dragover(_current, event) {
        const data = event.dataTransfer;
        if (!data) return false;
        for (const item of data.items) {
          if (item.kind === "file" && CLIP_IMAGE.test(item.type)) {
            event.preventDefault();
            return true;
          }
        }
        return false;
      },
      blur: () => {
        window.setTimeout(() => {
          if (!toolbar.contains(document.activeElement) && !linkPreview.contains(document.activeElement) && !commentPreview.contains(document.activeElement) && !pop.contains(document.activeElement) && document.activeElement !== view.dom) {
            toolbar.hidden = true;
            linkPreview.hidden = true;
            commentPreview.hidden = true;
          }
        }, 120);
        return false;
      },
    },
  });

  toolbar.addEventListener("mousedown", (event) => event.preventDefault());
  toolbar.addEventListener("click", (event) => {
    event.preventDefault();
    const target = (event.target as HTMLElement).closest("button");
    const found = buttonEls.find((entry) => entry.button === target);
    if (!found) return;
    if (found.item.action === "tone") {
      openTone(view);
      return;
    }
    if (found.item.action === "link") {
      openLink(view);
      return;
    }
    if (found.item.action === "comment") {
      openComment(view);
      return;
    }
    if (found.item.action === "ai") {
      openAi(view);
      return;
    }
    found.item.run?.(view.state, view.dispatch.bind(view));
    view.focus();
  });

  placeToolbar(view);
  placeLinkPreview(view);
  placeCommentPreview(view);
  linkPreview.addEventListener("mousedown", (event) => event.preventDefault());
  commentPreview.addEventListener("mousedown", (event) => event.preventDefault());
  commentEdit.addEventListener("click", () => openComment(view));
  linkOpen.addEventListener("click", () => {
    const found = linkAt(view.state.doc, view.state.selection);
    const href = safePagesHref(found?.href);
    if (href) window.open(href, "_blank", "noopener,noreferrer");
  });
  linkEdit.addEventListener("click", () => openLink(view));
  const onPopEscape = (event: KeyboardEvent) => {
    if (event.isComposing || !popEscape(!pop.hidden, event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    hidePop();
    view.focus();
  };
  document.addEventListener("keydown", onPopEscape, true);
  refreshToc(view, options.translate);
  const reposition = () => {
    if (view.hasFocus()) {
      placeToolbar(view);
      placeLinkPreview(view);
      placeCommentPreview(view);
    } else {
      toolbar.hidden = true;
      linkPreview.hidden = true;
      commentPreview.hidden = true;
    }
  };
  const stopScroll = followScroll(toolbar, reposition);
  window.addEventListener("resize", reposition);
  const originalDestroy = () => {
    stopScroll();
    window.removeEventListener("resize", reposition);
    hidePop();
    document.removeEventListener("keydown", onPopEscape, true);
    pop.remove();
    linkPreview.remove();
    commentPreview.remove();
  };
  const handle = { view, toolbar };
  const destroyToolbar = toolbar.remove.bind(toolbar);
  handle.toolbar.remove = () => {
    originalDestroy();
    destroyToolbar();
  };
  return handle;
}

export function focusStart(handle: PagesEditorHandle): void {
  const { view } = handle;
  const selection = TextSelection.create(view.state.doc, docStart(view.state.doc));
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  view.focus();
}

export function getDoc(handle: PagesEditorHandle): unknown {
  return handle.view.state.doc.toJSON();
}

export function setDoc(handle: PagesEditorHandle, value: unknown): void {
  const doc = nodeFromUnknown(value);
  handle.view.updateState(EditorState.create({
    doc,
    plugins: handle.view.state.plugins,
  }));
}

export function destroy(handle: PagesEditorHandle): void {
  handle.toolbar.remove();
  handle.view.destroy();
}

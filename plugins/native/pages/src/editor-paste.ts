import { Fragment, Slice } from "prosemirror-model";
import { NodeSelection, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { hoverKey, hoveredGroup, dropSelectedBlock } from "./editor-block-selection.js";
import { deleteSpan, replaceSpanWithNodes } from "./commands.js";
import { readPagesImage } from "./editor-transient.js";
import { acceptedImageFile } from "./link.js";
import { nodesInSpan } from "./reorder.js";
import { markdownLooksStructured, nodesForSpanPaste, pasteMarkdown, pastePlain, pasteUrl } from "./paste-markdown.js";
import { nodesToMarkdown } from "./to-markdown.js";
import { pasteHtml, type PasteLeaf } from "./paste-html.js";
import { toneFromCssColor } from "./tone.js";

const CLIP_IMAGE = /^image\/(png|jpeg|gif|webp)$/iu;

export function clipboardImage(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of data.items) {
    if (item.kind === "file" && CLIP_IMAGE.test(item.type)) return item.getAsFile();
  }
  return null;
}

function leafFromDom(node: globalThis.Node): PasteLeaf | string | null {
  if (node.nodeType === 3) return node.textContent || null;
  if (node.nodeType !== 1) return null;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "script" || tag === "style") return null;
  const children = leavesFromDom(el);
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

export function handlePaste(current: EditorView, event: ClipboardEvent): boolean {
  const file = clipboardImage(event.clipboardData);
  if (file) {
    event.preventDefault();
    readPagesImage(current, file);
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
    const nodes = leavesFromDom(body);
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
}

export function handleDrop(current: EditorView, event: DragEvent): boolean {
  const file = clipboardImage(event.dataTransfer);
  if (!file) return false;
  event.preventDefault();
  if (!acceptedImageFile(file)) return true;
  const point = current.posAtCoords({ left: event.clientX, top: event.clientY });
  if (point) {
    const selection = TextSelection.near(current.state.doc.resolve(point.pos));
    current.dispatch(current.state.tr.setSelection(selection));
  }
  readPagesImage(current, file);
  return true;
}

export function handleDragOver(_current: EditorView, event: DragEvent): boolean {
  const data = event.dataTransfer;
  if (!data) return false;
  for (const item of data.items) {
    if (item.kind === "file" && CLIP_IMAGE.test(item.type)) {
      event.preventDefault();
      return true;
    }
  }
  return false;
}

export function writeSpanClipboard(view: EditorView, event: ClipboardEvent, cut: boolean): boolean {
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

function leavesFromDom(parent: globalThis.Node): Array<PasteLeaf | string> {
  return Array.from(parent.childNodes, leafFromDom).filter((leaf): leaf is PasteLeaf | string => leaf !== null);
}

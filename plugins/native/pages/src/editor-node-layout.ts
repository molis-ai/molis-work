// Node views for document layout, containers, and inline references.
import { Node } from "prosemirror-model";
import { EditorView, ViewMutationRecord } from "prosemirror-view";
import { nudgeColumnShare, setToggleOpen, flipTaskAt } from "./commands.js";
import { calloutIconFor, safePagesCalloutTone } from "./callout.js";
import { setColumnWidth } from "./table-edit.js";
import { pagesSchema, safePagesColumnShare, safePagesColumnWidth } from "./schema.js";
import type { Translate, PagesEditorMountOptions } from "./editor-types.js";
import { t, dsIcon, keepFocus } from "./editor-view-ui.js";
import { SIZE_KEYS, sizeHandle } from "./editor-size-keys.js";


export function columnNodeView(node: Node, view: EditorView, getPos: () => number | undefined, translate?: Translate) {
  let current = node;
  const dom = document.createElement("div");
  dom.className = "pages-column";
  dom.dataset.pagesColumn = "1";
  const content = document.createElement("div");
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "pages-column-resize";
  handle.setAttribute("aria-label", t(translate, "调整栏宽"));
  handle.setAttribute("aria-keyshortcuts", SIZE_KEYS);
  const value = sizeHandle(handle, view, getPos, (text) => t(translate, text));
  const paint = () => {
    const pos = getPos(), own = safePagesColumnShare(current.attrs.width);
    let all = 0;
    if (pos != null) view.state.doc.resolve(pos).parent.forEach((column) => { all += safePagesColumnShare(column.attrs.width); });
    const n = all ? Math.round(own / all * 100) : 100;
    dom.dataset.pagesColumnShare = String(own);
    value(n, 0, 100, t(translate, "栏宽 {n}%").replace("{n}", String(n)));
  };
  handle.addEventListener("mousedown", keepFocus);
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

export function cellNodeView(node: Node, view: EditorView, getPos: () => number | undefined, translate?: Translate) {
  let current = node;
  const dom = document.createElement(node.type.name === "table_header" ? "th" : "td");
  const content = document.createElement("div");
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "pages-col-resize";
  handle.setAttribute("aria-label", t(translate, "调整列宽"));
  handle.setAttribute("aria-keyshortcuts", SIZE_KEYS);
  const value = sizeHandle(handle, view, getPos, (text) => t(translate, text));
  // Without its own width a column is as wide as it is drawn, read again when the handle is reached.
  const read = () => {
    const n = safePagesColumnWidth(current.attrs.colwidth) || Math.round(dom.getBoundingClientRect().width);
    value(n, safePagesColumnWidth(1), safePagesColumnWidth(1e9), t(translate, "列宽 {n} 像素").replace("{n}", String(n)));
  };
  handle.addEventListener("focus", read);
  const paint = () => {
    const width = safePagesColumnWidth(current.attrs.colwidth);
    if (width) {
      dom.style.width = width + "px";
      dom.dataset.pagesColwidth = String(width);
    } else {
      dom.style.width = "";
      delete dom.dataset.pagesColwidth;
    }
    read();
  };
  handle.addEventListener("mousedown", keepFocus);
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

export function taskNodeView(node: Node, view: EditorView, getPos: () => number | undefined) {
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

export function toggleNodeView(node: Node, view: EditorView, getPos: () => number | undefined) {
  const dom = document.createElement("div");
  dom.className = "pages-toggle" + (node.attrs.open ? " is-open" : "");
  const caret = document.createElement("button");
  caret.type = "button";
  caret.className = "pages-toggle-caret";
  caret.innerHTML = dsIcon("chevron-right");
  caret.addEventListener("mousedown", keepFocus);
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

export function calloutNodeView(
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
  mark.addEventListener("mousedown", keepFocus);
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

export function mentionNodeView(node: Node, options: PagesEditorMountOptions) {
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

export function calendarNodeView() {
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

export function tocNodeView() {
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

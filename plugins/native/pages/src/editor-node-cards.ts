// Reference, task, and event cards with their anchored editing popovers.
import { Node } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import { closePagesPopover, pagesPopoverAnchor } from "./editor-transient.js";
import { taskStatusText } from "./card-content.js";
import { placeOverlay } from "@molis-ai/molis-work-plugin-sdk/browser";
import type { PagesEditorMountOptions, Translate } from "./editor-types.js";
import { t, dsIcon, escapeHtml, overlayRoot, field, actions } from "./editor-view-ui.js";


const CARD_LOOK = { ref: ["link", "选择文档"], task: ["clipboard", "任务"], event: ["calendar", "日程"] } as const;

export function cardNodeView(kind: "ref" | "task" | "event", node: Node, view: EditorView, getPos: () => number | undefined, options: PagesEditorMountOptions) {
  const translate = options.translate;
  const dom = document.createElement("article");
  const paint = (current: Node) => {
    node = current;
    const { title, status, due, description, at } = current.attrs;
    // One card for all three: the mark, the title (or what to fill in), and one line under it; a task adds its note.
    const sub = kind === "ref" ? t(translate, "文档引用") : kind === "task" ? statusLabel(String(status), translate) + (due ? " · " + due : "") : String(at || t(translate, "没有日期"));
    dom.className = "pages-card pages-card--" + kind + (kind === "task" ? " is-" + String(status || "todo") : "");
    dom.innerHTML = `<span class="pages-card-mark">${dsIcon(CARD_LOOK[kind][0])}</span><span class="pages-card-body"><strong class="${title ? "" : "is-placeholder"}">${escapeHtml(String(title || t(translate, CARD_LOOK[kind][1])))}</strong><span>${escapeHtml(sub)}</span>${kind === "task" && description ? `<p>${escapeHtml(String(description))}</p>` : ""}</span>`;
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
  return t(translate, taskStatusText(status));
}

function pickPage(view: EditorView, pos: number, node: Node, options: PagesEditorMountOptions): void {
  closePagesPopover(".pages-pop[data-open=ref]");
  const pages = options.pages?.() ?? [];
  const pop = document.createElement("div");
  pop.className = "pages-pop";
  pop.dataset.open = "ref";
  const scope = pagesPopoverAnchor(view, pop, pos, pos + node.nodeSize);
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
      const at = scope.at(); if (!at?.intact) return;
      view.dispatch(view.state.tr.setNodeMarkup(at.from, undefined, { ...view.state.doc.nodeAt(at.from)?.attrs, page_id: item.id, title: item.title }));
      scope.close();
    });
    pop.append(button);
  });
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "mw-btn mw-btn--ghost";
  cancel.textContent = t(options.translate, "取消");
  cancel.addEventListener("click", scope.close);
  pop.append(cancel);
  overlayRoot().append(pop);
  placeOverlay(pop, view.coordsAtPos(pos), "below");
}

function editCard(kind: "task" | "event", view: EditorView, pos: number, node: Node, options: PagesEditorMountOptions): void {
  closePagesPopover(".pages-pop[data-open=card]");
  const pop = document.createElement("div");
  pop.className = "pages-pop";
  pop.dataset.open = "card";
  const scope = pagesPopoverAnchor(view, pop, pos, pos + node.nodeSize);
  const title = field(options.translate, "标题", String(node.attrs.title || ""), "text");
  pop.append(title.label);
  // What the card's own fields say, written with its title when confirmed.
  let read: () => Record<string, string>;
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
    read = () => ({ description: description.input.value, status: select.value, due: due.input.value });
  } else {
    const date = field(options.translate, "日期", String(node.attrs.at || ""), "date");
    pop.append(date.label);
    read = () => ({ at: date.input.value });
  }
  pop.append(actions(options.translate, () => {
    const at = scope.at(); if (!at?.intact) return;
    view.dispatch(view.state.tr.setNodeMarkup(at.from, undefined, { ...view.state.doc.nodeAt(at.from)?.attrs, title: title.input.value, ...read() }));
    scope.close();
  }, scope.close));
  overlayRoot().append(pop);
  placeOverlay(pop, view.coordsAtPos(pos), "below");
  title.input.focus();
}

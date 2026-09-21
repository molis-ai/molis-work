import { baseKeymap, setBlockType, toggleMark } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { InputRule, inputRules, wrappingInputRule, textblockTypeInputRule } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { DOMSerializer, Fragment, Node } from "prosemirror-model";
import { liftListItem, sinkListItem, splitListItem, wrapInList } from "prosemirror-schema-list";
import { EditorState, NodeSelection, Plugin, PluginKey, TextSelection, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet, EditorView } from "prosemirror-view";
import { actionItemsFromText } from "./ai.js";
import { emptyDoc, nodeFromUnknown, pagesSchema } from "./schema.js";

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
const chromeKey = new PluginKey("pages-chrome");

function commandToggle(markName: string) {
  const mark = pagesSchema.marks[markName];
  return mark ? toggleMark(mark) : () => false;
}

export function toHTML(value: unknown): string {
  const node = nodeFromUnknown(value);
  const serializer = DOMSerializer.fromSchema(pagesSchema);
  const wrap = document.createElement("div");
  wrap.append(serializer.serializeFragment(node.content));
  return wrap.innerHTML;
}

function headingCommand(level: number) {
  return setBlockType(pagesSchema.nodes.heading, { level });
}

function t(translate: Translate | undefined, value: string): string {
  return translate ? translate(value) : value;
}

function dsIcon(name: string): string {
  return `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

function overlayRoot(): HTMLElement {
  return document.querySelector("[data-pages-stage-workspace]")
    ?? document.querySelector("[data-pages=workbench]")
    ?? document.body;
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
  return paragraphNode();
}

function slashItems(translate: Translate | undefined) {
  return [
    { id: "paragraph", icon: "rows", group: "basic", label: t(translate, "段落"), hint: t(translate, "正文") },
    { id: "heading1", icon: "hash", group: "basic", label: t(translate, "标题 1"), hint: "H1" },
    { id: "heading2", icon: "hash", group: "basic", label: t(translate, "标题 2"), hint: "H2" },
    { id: "heading3", icon: "hash", group: "basic", label: t(translate, "标题 3"), hint: "H3" },
    { id: "bullet_list", icon: "rows", group: "basic", label: t(translate, "无序列表"), hint: t(translate, "圆点") },
    { id: "ordered_list", icon: "list", group: "basic", label: t(translate, "有序列表"), hint: "1." },
    { id: "task_list", icon: "check", group: "basic", label: t(translate, "清单"), hint: t(translate, "待办") },
    { id: "callout", icon: "info", group: "basic", label: t(translate, "Callout"), hint: t(translate, "提示块") },
    { id: "code_block", icon: "code", group: "basic", label: t(translate, "代码"), hint: t(translate, "等宽") },
    { id: "table", icon: "grid", group: "basic", label: t(translate, "表"), hint: t(translate, "两列表") },
    { id: "toggle", icon: "chevron-right", group: "basic", label: t(translate, "Toggle"), hint: t(translate, "折叠") },
    { id: "horizontal_rule", icon: "minus", group: "basic", label: t(translate, "分隔线"), hint: t(translate, "横线") },
    { id: "toc", icon: "library", group: "basic", label: t(translate, "目录"), hint: t(translate, "按标题生成") },
    { id: "page_ref", icon: "link", group: "card", label: t(translate, "引用文档"), hint: "@" },
    { id: "task_card", icon: "clipboard", group: "card", label: t(translate, "任务卡"), hint: t(translate, "待办") },
    { id: "event_card", icon: "clock", group: "card", label: t(translate, "日程卡"), hint: t(translate, "日期") },
    { id: "calendar", icon: "calendar", group: "card", label: t(translate, "月历"), hint: t(translate, "本篇事件") },
  ];
}

function topBlockRange($pos: { depth: number; before(depth: number): number; after(depth: number): number; index(depth: number): number; node(depth: number): Node }) {
  if ($pos.depth < 1) return null;
  return { from: $pos.before(1), to: $pos.after(1), index: $pos.index(0), node: $pos.node(1) };
}

function replaceTopBlock(view: EditorView, node: Node): void {
  const range = topBlockRange(view.state.selection.$from);
  if (!range) return;
  const tr = view.state.tr.replaceWith(range.from, range.to, node);
  const pos = Math.min(range.from + 1, tr.doc.content.size);
  tr.setSelection(TextSelection.near(tr.doc.resolve(pos)));
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

function insertBlockAt(view: EditorView, pos: number, node: Node): void {
  const tr = view.state.tr.insert(pos, node);
  tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

function moveTopBlock(view: EditorView, index: number, dir: -1 | 1): void {
  const doc = view.state.doc;
  const target = index + dir;
  if (target < 0 || target >= doc.childCount) return;
  const nodes: Node[] = [];
  doc.forEach((child) => { nodes.push(child); });
  const current = nodes[index];
  const swap = nodes[target];
  if (!current || !swap) return;
  nodes[index] = swap;
  nodes[target] = current;
  const tr = view.state.tr.replaceWith(0, doc.content.size, Fragment.from(nodes));
  view.dispatch(tr);
  view.focus();
}

function matchSlash(item: { id: string; label: string; hint: string }, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [item.id, item.label, item.hint].join(" ").toLowerCase().includes(needle);
}

function slashPlugin(translate: Translate | undefined) {
  return new Plugin({
    key: slashKey,
    state: {
      init: () => ({ open: false, pos: 0, query: "", index: 0 }),
      apply(tr, value) {
        const meta = tr.getMeta(slashKey);
        if (meta) return meta;
        const $from = tr.selection.$from;
        const parent = $from.parent;
        const open = parent.type === pagesSchema.nodes.paragraph
          && $from.depth === 1
          && parent.textContent.startsWith("/");
        if (!open) return { open: false, pos: 0, query: "", index: 0 };
        const query = parent.textContent.slice(1);
        return { open: true, pos: $from.before(1), query, index: query === value.query ? value.index : 0 };
      },
    },
    props: {
      handleKeyDown(view, event) {
        const value = slashKey.getState(view.state);
        if (!value?.open) return false;
        const items = slashItems(translate).filter((item) => matchSlash(item, value.query));
        if (event.key === "Escape") {
          const $from = view.state.selection.$from;
          const parent = $from.parent;
          if (parent.type === pagesSchema.nodes.paragraph && parent.textContent.startsWith("/")) {
            const from = $from.start();
            view.dispatch(view.state.tr
              .delete(from, from + parent.content.size)
              .setMeta(slashKey, { open: false, pos: 0, query: "", index: 0 }));
            return true;
          }
          view.dispatch(view.state.tr.setMeta(slashKey, { open: false, pos: 0, query: "", index: 0 }));
          return true;
        }
        if (event.key === "ArrowDown") {
          view.dispatch(view.state.tr.setMeta(slashKey, { ...value, index: Math.min(items.length - 1, value.index + 1) }));
          return true;
        }
        if (event.key === "ArrowUp") {
          view.dispatch(view.state.tr.setMeta(slashKey, { ...value, index: Math.max(0, value.index - 1) }));
          return true;
        }
        if (event.key === "Enter" && items[value.index]) {
          event.preventDefault();
          replaceTopBlock(view, blockFor(items[value.index].id));
          return true;
        }
        return false;
      },
    },
    view() {
      const menu = document.createElement("div");
      menu.className = "pages-slash";
      menu.hidden = true;
      overlayRoot().append(menu);
      return {
        update(view) {
          const value = slashKey.getState(view.state);
          if (!value?.open) {
            menu.hidden = true;
            return;
          }
          const items = slashItems(translate).filter((item) => matchSlash(item, value.query));
          menu.hidden = false;
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
            button.addEventListener("mousedown", (event) => {
              event.preventDefault();
              replaceTopBlock(view, blockFor(item.id));
            });
            menu.append(button);
          });
          if (!items.length) {
            const empty = document.createElement("p");
            empty.textContent = t(translate, "没有匹配的块");
            menu.append(empty);
          }
          const coords = view.coordsAtPos(view.state.selection.from);
          menu.style.left = Math.max(8, coords.left) + "px";
          menu.style.top = (coords.bottom + 8) + "px";
        },
        destroy() { menu.remove(); },
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
      apply(tr, value) {
        const meta = tr.getMeta(mentionKey);
        if (meta) return meta;
        const slash = slashKey.getState(tr);
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
    props: {
      handleKeyDown(view, event) {
        const value = mentionKey.getState(view.state);
        if (!value?.open) return false;
        const items = filterPages(options.pages?.() ?? [], value.query);
        if (event.key === "Escape") {
          view.dispatch(view.state.tr.setMeta(mentionKey, { open: false, from: 0, query: "", index: 0 }));
          return true;
        }
        if (event.key === "ArrowDown") {
          view.dispatch(view.state.tr.setMeta(mentionKey, { ...value, index: Math.min(items.length - 1, value.index + 1) }));
          return true;
        }
        if (event.key === "ArrowUp") {
          view.dispatch(view.state.tr.setMeta(mentionKey, { ...value, index: Math.max(0, value.index - 1) }));
          return true;
        }
        if (event.key === "Enter" && items[value.index]) {
          event.preventDefault();
          insertMention(view, value.from, view.state.selection.from, items[value.index]);
          return true;
        }
        return false;
      },
    },
    view() {
      const menu = document.createElement("div");
      menu.className = "pages-slash pages-mention-menu";
      menu.hidden = true;
      overlayRoot().append(menu);
      return {
        update(view) {
          const value = mentionKey.getState(view.state);
          if (!value?.open) {
            menu.hidden = true;
            return;
          }
          const items = filterPages(options.pages?.() ?? [], value.query);
          menu.hidden = false;
          menu.replaceChildren();
          items.forEach((item, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "pages-slash-item" + (index === value.index ? " is-on" : "");
            button.innerHTML = `<span class="pages-slash-icon">${dsIcon("note")}</span><strong>${escapeHtml(item.title)}</strong>`;
            button.addEventListener("mousedown", (event) => {
              event.preventDefault();
              insertMention(view, value.from, view.state.selection.from, item);
            });
            menu.append(button);
          });
          if (!items.length) {
            const empty = document.createElement("p");
            empty.textContent = t(translate, "没有匹配的文档");
            menu.append(empty);
          }
          const coords = view.coordsAtPos(view.state.selection.from);
          menu.style.left = Math.max(8, coords.left) + "px";
          menu.style.top = (coords.bottom + 8) + "px";
        },
        destroy() { menu.remove(); },
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

function chromePlugin(translate: Translate | undefined) {
  return new Plugin({
    key: chromeKey,
    props: {
      decorations(state) {
        const widgets: Decoration[] = [];
        const $from = state.selection.$from;
        if ($from.parent.type === pagesSchema.nodes.paragraph && $from.parent.content.size === 0 && $from.depth === 1) {
          widgets.push(Decoration.node($from.before(), $from.after(), {
            class: "is-empty",
            "data-placeholder": t(translate, "输入 / 插入块，或直接写"),
          }));
        }
        state.doc.forEach((node, offset, index) => {
          if (index < state.doc.childCount - 1) {
            widgets.push(Decoration.widget(offset + node.nodeSize, () => gapWidget(index, translate), {
              side: -1,
              key: "gap-" + (offset + node.nodeSize),
              ignoreSelection: true,
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
          insertBlockAt(view, blockPos(view.state.doc, Number(gap.getAttribute("data-after") || "0") + 1), paragraphNode());
          return true;
        },
      },
    },
  });
}

function selectTopBlock(view: EditorView, index: number): void {
  const pos = blockPos(view.state.doc, index);
  try {
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
  } catch {
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(Math.min(pos + 1, view.state.doc.content.size)))));
  }
  view.focus();
}

function insertSlashParagraph(view: EditorView, index: number): void {
  const node = view.state.doc.child(index);
  const pos = blockPos(view.state.doc, index);
  if (node?.type === pagesSchema.nodes.paragraph && node.content.size === 0) {
    const tr = view.state.tr.insertText("/", pos + 1);
    tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 2)));
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return;
  }
  const after = pos + (node?.nodeSize ?? 0);
  insertBlockAt(view, after, paragraphNode("/"));
}

function hoverHandlePlugin(translate: Translate | undefined, onNote: (index: number) => void) {
  return new Plugin({
    view(editorView) {
      const handle = handleWidget(translate);
      handle.hidden = true;
      overlayRoot().append(handle);
      const menu = document.createElement("div");
      menu.className = "mw-menu pages-block-menu";
      menu.hidden = true;
      menu.setAttribute("role", "menu");
      overlayRoot().append(menu);
      let index = 0;

      const clearHover = () => {
        editorView.dom.querySelectorAll(".is-block-hover").forEach((node) => node.classList.remove("is-block-hover"));
      };
      const closeMenu = () => {
        menu.hidden = true;
        menu.replaceChildren();
      };
      const hideChrome = () => {
        if (!menu.hidden) return;
        handle.hidden = true;
        clearHover();
      };
      const placeHandle = (blockIndex: number) => {
        const node = editorView.state.doc.child(blockIndex);
        const dom = editorView.nodeDOM(blockPos(editorView.state.doc, blockIndex));
        if (!node || !(dom instanceof HTMLElement)) {
          hideChrome();
          return;
        }
        handle.classList.toggle("has-note", Boolean(node.attrs.note));
        clearHover();
        dom.classList.add("is-block-hover");
        const rect = dom.getBoundingClientRect();
        handle.style.top = Math.round(rect.top + 3) + "px";
        handle.style.left = Math.round(rect.left + 2) + "px";
        handle.hidden = false;
        index = blockIndex;
      };
      const blockIndexAt = (clientX: number, clientY: number): number | null => {
        const found = editorView.posAtCoords({ left: clientX, top: clientY });
        if (!found || editorView.state.doc.childCount === 0) return null;
        const $pos = editorView.state.doc.resolve(Math.min(found.pos, editorView.state.doc.content.size));
        if ($pos.depth >= 1) return $pos.index(0);
        return Math.min($pos.index(0), editorView.state.doc.childCount - 1);
      };
      const openMenu = () => {
        menu.hidden = false;
        menu.replaceChildren();
        ([
          { id: "up", icon: "chevron-up", label: t(translate, "上移") },
          { id: "down", icon: "chevron-down", label: t(translate, "下移") },
          { id: "note", icon: "message", label: t(translate, "备注") },
        ] as const).forEach((item) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "mw-menu__item";
          button.setAttribute("role", "menuitem");
          button.innerHTML = `${dsIcon(item.icon)}<span>${escapeHtml(item.label)}</span>`;
          button.addEventListener("mousedown", (event) => {
            event.preventDefault();
            if (item.id === "up") moveTopBlock(editorView, index, -1);
            else if (item.id === "down") moveTopBlock(editorView, index, 1);
            else onNote(index);
            closeMenu();
          });
          menu.append(button);
        });
        const rect = handle.getBoundingClientRect();
        menu.style.left = Math.round(rect.right + 6) + "px";
        menu.style.top = Math.round(rect.top) + "px";
      };
      const onMove = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest(".pages-slash, .pages-format-bar, .pages-pop, .pages-more-menu, .pages-create-menu")) {
          hideChrome();
          return;
        }
        if (target && (handle.contains(target) || menu.contains(target))) {
          handle.hidden = false;
          return;
        }
        const host = editorView.dom.closest(".pages-editor-host") ?? editorView.dom;
        if (!host.contains(target)) {
          hideChrome();
          return;
        }
        const next = blockIndexAt(event.clientX, event.clientY);
        if (next == null) hideChrome();
        else placeHandle(next);
      };
      handle.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const target = event.target as HTMLElement;
        if (target.closest("[data-pages-plus]")) {
          closeMenu();
          insertSlashParagraph(editorView, index);
          return;
        }
        if (target.closest("[data-pages-grip]")) {
          selectTopBlock(editorView, index);
          openMenu();
        }
      });
      const onPointerDown = (event: PointerEvent) => {
        const target = event.target as Node | null;
        if (target && (handle.contains(target) || menu.contains(target))) return;
        closeMenu();
      };
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") closeMenu();
      };
      const workspace = editorView.dom.closest(".pages-workspace");
      const onScroll = () => {
        closeMenu();
        if (!handle.hidden) placeHandle(index);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("keydown", onKey);
      workspace?.addEventListener("scroll", onScroll, { passive: true });
      return {
        update() {
          if (!handle.hidden && editorView.state.doc.childCount > index) placeHandle(index);
        },
        destroy() {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("pointerdown", onPointerDown, true);
          document.removeEventListener("keydown", onKey);
          workspace?.removeEventListener("scroll", onScroll);
          handle.remove();
          menu.remove();
        },
      };
    },
  });
}

function blockPos(doc: Node, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i += 1) pos += doc.child(i).nodeSize;
  return pos;
}

function handleWidget(translate: Translate | undefined): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "pages-block-handle";
  wrap.innerHTML = `
    <button type="button" data-pages-plus aria-label="${escapeHtml(t(translate, "插入块"))}">${dsIcon("plus")}</button>
    <button type="button" data-pages-grip aria-label="${escapeHtml(t(translate, "块操作"))}">${dsIcon("grip")}</button>`;
  return wrap;
}

function gapWidget(index: number, translate?: Translate): HTMLElement {
  const line = document.createElement("button");
  line.type = "button";
  line.className = "pages-insert-line";
  line.dataset.pagesGap = "1";
  line.dataset.after = String(index);
  line.setAttribute("aria-label", t(translate, "在此插入"));
  line.contentEditable = "false";
  return line;
}

function taskNodeView(node: Node, view: EditorView, getPos: () => number | undefined) {
  const dom = document.createElement("li");
  dom.className = "pages-task-item" + (node.attrs.checked ? " is-checked" : "");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = Boolean(node.attrs.checked);
  box.addEventListener("mousedown", (event) => event.preventDefault());
  box.addEventListener("change", () => {
    const pos = getPos();
    if (pos == null) return;
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: box.checked }));
  });
  const content = document.createElement("div");
  content.className = "pages-task-content";
  dom.append(box, content);
  return {
    dom,
    contentDOM: content,
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
  caret.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const pos = getPos();
    if (pos == null) return;
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, open: !node.attrs.open }));
  });
  const body = document.createElement("div");
  body.className = "pages-toggle-body";
  dom.append(caret, body);
  return {
    dom,
    contentDOM: body,
    update(next: Node) {
      if (next.type !== node.type) return false;
      node = next;
      dom.classList.toggle("is-open", Boolean(next.attrs.open));
      return true;
    },
  };
}

function calloutIcon(tone: string): string {
  if (tone === "warn") return "alert";
  if (tone === "success") return "check";
  if (tone === "plain") return "idea";
  return "info";
}

function calloutNodeView(node: Node) {
  const dom = document.createElement("aside");
  const mark = document.createElement("span");
  mark.className = "pages-callout-mark";
  mark.setAttribute("aria-hidden", "true");
  const body = document.createElement("div");
  body.className = "pages-callout-body";
  const paint = (current: Node) => {
    node = current;
    const tone = String(current.attrs.tone || "info");
    dom.className = "pages-callout pages-callout--" + tone;
    mark.innerHTML = dsIcon(calloutIcon(tone));
  };
  paint(node);
  dom.append(mark, body);
  return {
    dom,
    contentDOM: body,
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
    update(next: Node) {
      if (next.type !== node.type) return false;
      node = next;
      dom.textContent = "@" + String(next.attrs.title || "");
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
  const coords = view.coordsAtPos(pos);
  pop.style.left = Math.max(8, coords.left) + "px";
  pop.style.top = (coords.bottom + 8) + "px";
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
  const coords = view.coordsAtPos(pos);
  pop.style.left = Math.max(8, coords.left) + "px";
  pop.style.top = (coords.bottom + 8) + "px";
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
  view.dom.querySelectorAll("[data-pages-toc]").forEach((nav) => {
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
    headings.forEach((item) => {
      const li = document.createElement("li");
      li.dataset.level = String(item.level);
      li.textContent = item.text || t(translate, "无标题");
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

function commentAt(state: EditorState): { from: number; to: number; text: string; id: string } | null {
  const mark = pagesSchema.marks.comment;
  const { from, to, $from } = state.selection;
  const found = $from.marks().find((item) => item.type === mark);
  if (found) {
    let start = from;
    let end = to;
    state.doc.nodesBetween(Math.max(0, from - 1), Math.min(state.doc.content.size, to + 1), (node, pos) => {
      if (!node.isText || !found.isInSet(node.marks)) return;
      start = Math.min(start, pos);
      end = Math.max(end, pos + node.nodeSize);
    });
    return { from: start, to: end, text: String(found.attrs.text || ""), id: String(found.attrs.id || "") };
  }
  if (from === to) return null;
  return { from, to, text: "", id: "" };
}

function applyComment(view: EditorView, from: number, to: number, text: string, id?: string): void {
  const mark = pagesSchema.marks.comment;
  const tr = view.state.tr;
  if (!text.trim()) {
    tr.removeMark(from, to, mark);
  } else {
    tr.addMark(from, to, mark.create({ id: id || crypto.randomUUID(), text: text.trim() }));
  }
  view.dispatch(tr);
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

export function mount(host: HTMLElement, options: PagesEditorMountOptions = {}): PagesEditorHandle {
  host.replaceChildren();
  const toolbar = document.createElement("div");
  toolbar.className = "pages-format-bar";
  toolbar.hidden = true;
  const buttons: Array<{ name: string; label: string; icon?: string; gap?: boolean; run?: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean; action?: string }> = [
    { name: "strong", label: t(options.translate, "加粗"), run: commandToggle("strong") },
    { name: "em", label: t(options.translate, "斜体"), run: commandToggle("em") },
    { name: "underline", label: t(options.translate, "下划线"), run: commandToggle("underline") },
    { name: "strike", label: t(options.translate, "删除线"), run: commandToggle("strike") },
    { name: "code", label: t(options.translate, "代码"), icon: "code", run: commandToggle("code") },
    { name: "h1", label: t(options.translate, "标题 1"), gap: true, run: headingCommand(1) },
    { name: "h2", label: t(options.translate, "标题 2"), run: headingCommand(2) },
    { name: "h3", label: t(options.translate, "标题 3"), run: headingCommand(3) },
    { name: "ul", label: t(options.translate, "无序列表"), icon: "rows", gap: true, run: wrapInList(pagesSchema.nodes.bullet_list) },
    { name: "ol", label: t(options.translate, "有序列表"), icon: "list", run: wrapInList(pagesSchema.nodes.ordered_list) },
    { name: "comment", label: t(options.translate, "评论"), icon: "message", gap: true, action: "comment" },
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
    else button.textContent = ({ strong: "B", em: "I", underline: "U", strike: "S", h1: "H1", h2: "H2", h3: "H3" } as Record<string, string>)[item.name] || item.label;
    toolbar.append(button);
    return { item, button };
  });
  overlayRoot().append(toolbar);

  const pop = document.createElement("div");
  pop.className = "pages-pop";
  pop.hidden = true;
  overlayRoot().append(pop);

  const hidePop = () => { pop.hidden = true; pop.replaceChildren(); };

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
    const coords = view.coordsAtPos(pos + 1);
    pop.style.left = Math.max(8, coords.left) + "px";
    pop.style.top = Math.max(8, coords.top - 8) + "px";
    area.focus();
  };

  const openComment = (view: EditorView) => {
    const found = commentAt(view.state);
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
    const coords = view.coordsAtPos(found.from);
    pop.style.left = Math.max(8, coords.left) + "px";
    pop.style.top = (coords.bottom + 8) + "px";
    area.focus();
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
    const coords = view.coordsAtPos(view.state.selection.from);
    pop.style.left = Math.max(8, coords.left) + "px";
    pop.style.top = Math.max(8, coords.top - 8) + "px";
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
    const coords = view.coordsAtPos(view.state.selection.from);
    pop.style.left = Math.max(8, coords.left) + "px";
    pop.style.top = (coords.bottom + 8) + "px";
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
  const taskItem = pagesSchema.nodes.task_item;
  let view!: EditorView;
  const plugins = [
    history(),
    keymap({
      "Mod-z": undo,
      "Mod-y": redo,
      "Mod-Shift-z": redo,
      "Mod-b": commandToggle("strong"),
      "Mod-i": commandToggle("em"),
      "Mod-u": commandToggle("underline"),
      "Mod-e": commandToggle("code"),
      "Mod-Shift-x": commandToggle("strike"),
      Enter: splitListItem(listItem),
      Tab: (state, dispatch, current) => {
        if (current && cellNav(current, 1)) return true;
        return sinkListItem(listItem)(state, dispatch);
      },
      "Shift-Tab": (state, dispatch, current) => {
        if (current && cellNav(current, -1)) return true;
        return liftListItem(listItem)(state, dispatch);
      },
    }),
    keymap({ Enter: splitListItem(taskItem) }),
    keymap(baseKeymap),
    inputRules({
      rules: [
        wrappingInputRule(/^\s*([-+*])\s$/u, pagesSchema.nodes.bullet_list),
        wrappingInputRule(/^(\d+)\.\s$/u, pagesSchema.nodes.ordered_list, (match) => ({ order: Number(match[1]) || 1 })),
        textblockTypeInputRule(/^#\s$/u, pagesSchema.nodes.heading, { level: 1 }),
        textblockTypeInputRule(/^##\s$/u, pagesSchema.nodes.heading, { level: 2 }),
        textblockTypeInputRule(/^###\s$/u, pagesSchema.nodes.heading, { level: 3 }),
        new InputRule(/^\[\]\s$/u, (state, _match, start) => {
          const $start = state.doc.resolve(start);
          if ($start.parent.type !== pagesSchema.nodes.paragraph) return null;
          const item = pagesSchema.nodes.task_item.create({ checked: false }, pagesSchema.nodes.paragraph.create());
          return state.tr.replaceWith($start.before(), $start.after(), pagesSchema.nodes.task_list.create(null, item));
        }),
      ],
    }),
    slashPlugin(options.translate),
    mentionPlugin(options),
    chromePlugin(options.translate),
    hoverHandlePlugin(options.translate, (index) => openNote(view, index)),
    tocPlugin(options.translate),
    calendarPlugin(),
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
    toolbar.style.left = Math.max(8, left) + "px";
    toolbar.style.top = Math.max(8, start.top - 40) + "px";
    buttonEls.forEach(({ item, button }) => {
      const mark = pagesSchema.marks[item.name];
      button.classList.toggle("is-on", Boolean(mark && current.state.doc.rangeHasMark(from, to, mark)));
    });
  };

  view = new EditorView(host, {
    state: EditorState.create({
      doc: nodeFromUnknown(options.doc),
      plugins,
    }),
    nodeViews: {
      task_item: (node, current, getPos) => taskNodeView(node, current, getPos),
      toggle: (node, current, getPos) => toggleNodeView(node, current, getPos),
      callout: (node) => calloutNodeView(node),
      page_mention: (node) => mentionNodeView(node, options),
      page_ref: (node, current, getPos) => cardNodeView("ref", node, current, getPos, options),
      task_card: (node, current, getPos) => cardNodeView("task", node, current, getPos, options),
      event_card: (node, current, getPos) => cardNodeView("event", node, current, getPos, options),
      calendar: () => calendarNodeView(),
    },
    dispatchTransaction(tr) {
      const next = view.state.apply(tr);
      view.updateState(next);
      placeToolbar(view);
      if (tr.docChanged) options.onChange?.();
    },
    handleDOMEvents: {
      blur: () => {
        window.setTimeout(() => {
          if (!toolbar.contains(document.activeElement) && !pop.contains(document.activeElement) && document.activeElement !== view.dom) {
            toolbar.hidden = true;
          }
        }, 120);
        return false;
      },
    },
  });

  toolbar.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const target = (event.target as HTMLElement).closest("button");
    const found = buttonEls.find((entry) => entry.button === target);
    if (!found) return;
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
  refreshToc(view, options.translate);
  const originalDestroy = () => {
    hidePop();
    pop.remove();
  };
  const handle = { view, toolbar };
  const destroyToolbar = toolbar.remove.bind(toolbar);
  handle.toolbar.remove = () => {
    originalDestroy();
    destroyToolbar();
  };
  return handle;
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

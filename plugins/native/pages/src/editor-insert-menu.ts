import type { Node } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { followScroll, placeOverlay } from "@molis-ai/molis-work-plugin-sdk/browser";
import { applySlash, slashSession, dismissedMenuRange, menuKey, hoverMenuIndex } from "./commands.js";
import { ownPagesTransient, readPagesImage } from "./editor-transient.js";
import { pagesSchema } from "./schema.js";
import type { Translate, PagesEditorMountOptions, PagesListItem } from "./editor-types.js";
import { t, overlayRoot, dsIcon, escapeHtml, keepSelectedVisible, keepFocus } from "./editor-view-ui.js";

export const slashKey = new PluginKey<{ open: boolean; pos: number; query: string; index: number }>("pages-slash");

export const mentionKey = new PluginKey<{ open: boolean; from: number; query: string; index: number }>("pages-mention");

export function paragraphNode(text = ""): Node {
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
  if (id === "callout") return s.nodes.callout.create({ tone: "cyan" }, paragraphNode());
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

export function slashPlugin(translate: Translate | undefined) {
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "image/png,image/jpeg,image/gif,image/webp";
  picker.hidden = true;

  const choose = (editor: EditorView, id: string) => {
    if (id === "image") {
      pickSlashImage(picker, editor);
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
              button.addEventListener("mousedown", keepFocus);
              button.addEventListener("click", () => choose(view, item.id));
              menu.append(button);
            });
            if (!items.length) {
              const empty = document.createElement("p");
              empty.textContent = t(translate, "没有匹配的块");
              menu.append(empty);
            }
          }
          updateMenuSelection(view, menu, value.index);
        },
        destroy() { stopScroll(); dismiss(); menu.remove(); picker.remove(); },
      };
    },
  });
}

export function mentionPlugin(options: PagesEditorMountOptions) {
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
              button.addEventListener("mousedown", keepFocus);
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
          updateMenuSelection(view, menu, value.index);
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

function pickSlashImage(picker: HTMLInputElement, editor: EditorView): void {
  const session = slashSession(editor.state);
  const tr = session ? editor.state.tr.delete(session.from, session.to) : editor.state.tr;
  editor.dispatch(tr.setMeta(slashKey, { open: false, pos: 0, query: "", index: 0 }));
  picker.value = "";
  const stopPicker = ownPagesTransient(editor, () => { picker.onchange = null; });
  picker.onchange = () => {
    stopPicker();
    const file = picker.files?.[0];
    if (!file) return;
    readPagesImage(editor, file);
  };
  picker.click();
}

function updateMenuSelection(view: EditorView, menu: HTMLElement, selected: number): void {
  menu.querySelectorAll("button").forEach((button, index) => {
    button.classList.toggle("is-on", index === selected);
    button.setAttribute("aria-current", String(index === selected));
  });
  const coords = view.coordsAtPos(view.state.selection.from);
  placeOverlay(menu, coords, "below");
  keepSelectedVisible(menu);
}

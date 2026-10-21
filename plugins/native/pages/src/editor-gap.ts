import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { undo } from "prosemirror-history";
import { blockPos, commitGap } from "./commands.js";
import { blockPlaceholder } from "./placeholder.js";
import { readPagesImage } from "./editor-transient.js";
import { pagesSchema } from "./schema.js";
import { clipboardImage } from "./editor-paste.js";
import type { Translate } from "./editor-types.js";
import { t } from "./editor-view-ui.js";

const chromeKey = new PluginKey<{ after: number }>("pages-chrome");

export function chromePlugin(translate: Translate | undefined, renderOnly = false) {
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
            widgets.push(Decoration.widget(offset + node.nodeSize, () => {
              const wrapper = document.createElement("div");
              wrapper.contentEditable = "false";
              wrapper.append(provisionalField(translate));
              return wrapper;
            }, {
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
      const view = viewOf(), after = view ? chromeKey.getState(view.state)?.after ?? -1 : -1;
      if (!view || after < 0) return;
      const pos = blockPos(view.state.doc, after), text = field.textContent;
      readPagesImage(view, file, { from: pos, to: pos + view.state.doc.child(after).nodeSize }, (state, src, anchor) => {
        if (field.textContent !== text) return null;
        const tr = commitGap(state, state.doc.resolve(anchor.from).index(0), src);
        if (!tr) return null;
        field.replaceChildren();
        return tr.setMeta(chromeKey, { after: -1 });
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

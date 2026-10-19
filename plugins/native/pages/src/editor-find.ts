import { Plugin, PluginKey, TextSelection, type PluginView } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { findHits, replaceAllFindHits, replaceFindHit, stepFindHit } from "./find.js";
import type { Translate } from "./editor-types.js";
import { t, overlayRoot } from "./editor-view-ui.js";

interface FindBar {
  open: boolean;
  query: string;
  replacement: string;
  index: number;
}

const findKey = new PluginKey<FindBar>("pages-find");

export function findPlugin(translate: Translate | undefined) {
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
    view: () => createFindView(translate),
  });
}

let findView: EditorView | null = null;

export function openFind(view: EditorView): void {
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

function createFindView(translate: Translate | undefined): PluginView {
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
  const close = (view: EditorView) => {
  view.dispatch(view.state.tr.setMeta(findKey, {
    open: false,
    query: input.value,
    replacement: replaceInput.value,
    index: 0,
  }));
  view.focus();
  };
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
      close(view);
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
      close(view);
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
}

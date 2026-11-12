// Media node views and the code-highlighting plugin they use.
// The type brings `window.molisCopy`, which the workbench page provides; nothing of the package is bundled.
import type { CopyLabels } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { Node } from "prosemirror-model";
import { NodeSelection, Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet, EditorView, ViewMutationRecord } from "prosemirror-view";
import { setImageWidth, setImageCaption, setBookmarkTitle } from "./commands.js";
import {
  bookmarkLabel,
  imageAlt,
  linkClickOpens,
  safePagesBookmarkTitle,
  safePagesHref,
  safePagesImageCaption,
  safePagesImageSrc,
  safePagesImageWidth,
} from "./link.js";
import { highlightRanges } from "./code-highlight.js";
import { PAGES_CODE_LANGUAGES, safePagesLanguage } from "./code-language.js";
import { pagesSchema } from "./schema.js";
import type { Translate } from "./editor-types.js";
import { bindEditorWords, t, dsIcon, keepFocus, keepOut } from "./editor-view-ui.js";
import { SIZE_KEYS, sizeHandle } from "./editor-size-keys.js";

const codeHighlightKey = new PluginKey<DecorationSet>("pages-code-highlight");

export function bookmarkNodeView(node: Node, view: EditorView, getPos: () => number | undefined, translate?: Translate) {
  let current = node;
  let selected = false;
  const frame = document.createElement("div");
  frame.className = "pages-bookmark";
  frame.contentEditable = "false";
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.className = "pages-bookmark-title";
  titleInput.maxLength = 120;
  const titleText = document.createElement("strong");
  const url = document.createElement("a");
  url.target = "_blank";
  url.rel = "noreferrer noopener";
  const shownTitle = () => {
    const href = safePagesHref(current.attrs.href);
    return safePagesBookmarkTitle(current.attrs.title) || bookmarkLabel(href) || t(translate, "pages.editor.link");
  };
  const paintWords = () => {
    titleInput.placeholder = t(translate, "pages.editor.name");
    const title = shownTitle(), target = safePagesHref(current.attrs.href) || title;
    if (titleText.textContent !== title) titleText.textContent = title;
    if (url.textContent !== target) url.textContent = target;
  };
  const paint = () => {
    const href = safePagesHref(current.attrs.href);
    paintWords();
    titleInput.hidden = !selected;
    titleText.hidden = selected;
    if (document.activeElement !== titleInput) titleInput.value = shownTitle();
    if (href) url.href = href;
    else url.removeAttribute("href");
  };
  titleInput.addEventListener("mousedown", keepOut);
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
  bindEditorWords(frame, paintWords);
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

export function imageNodeView(node: Node, view: EditorView, getPos: () => number | undefined, translate?: Translate) {
  let current = node;
  let selected = false;
  const frame = document.createElement("div");
  frame.className = "pages-image-frame";
  frame.contentEditable = "false";
  const media = document.createElement("div");
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "pages-image-resize";
  handle.setAttribute("aria-keyshortcuts", SIZE_KEYS);
  const value = sizeHandle(handle, view, getPos, (key, args) => t(translate, key, args), (at) => NodeSelection.create(view.state.doc, at));
  // An image without its own width fills its line, and says so.
  const read = () => {
    const n = safePagesImageWidth(current.attrs.width);
    value(n || (media.querySelector("img") ?? frame).getBoundingClientRect().width, safePagesImageWidth(1), safePagesImageWidth(1e9),
      n ? t(translate, "pages.editor-size-keys.width-n-px", { n }) : t(translate, "pages.editor-size-keys.full-width"));
  };
  handle.addEventListener("focus", read);
  bindEditorWords(handle, () => {
    handle.setAttribute("aria-label", t(translate, "pages.editor.resize-width"));
    read();
  });
  const caption = document.createElement("input");
  caption.type = "text";
  caption.className = "pages-image-caption";
  bindEditorWords(caption, () => { caption.placeholder = t(translate, "pages.editor.caption"); });
  caption.maxLength = 200;
  caption.addEventListener("mousedown", keepOut);
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
    const alt = current.attrs.alt || imageAlt(src);
    const width = safePagesImageWidth(current.attrs.width);
    frame.style.width = width ? width + "px" : "";
    media.replaceChildren();
    if (!src) {
      const broken = document.createElement("div");
      broken.className = "pages-image is-broken";
      if (alt) broken.textContent = String(alt);
      else bindEditorWords(broken, () => { broken.textContent = t(translate, "pages.editor.image"); });
      media.append(broken);
    } else {
      const img = document.createElement("img");
      img.className = "pages-image";
      img.src = src;
      if (alt) img.alt = String(alt);
      else bindEditorWords(img, () => { img.alt = t(translate, "pages.editor.image"); });
      img.dataset.pagesImage = "1";
      media.append(img);
    }
    syncCaption();
    read();
  };
  handle.addEventListener("mousedown", keepFocus);
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

export function codeNodeView(node: Node, view: EditorView, getPos: () => number | undefined, translate: Translate | undefined) {
  const dom = document.createElement("div");
  dom.className = "pages-code-block";
  const bar = document.createElement("div");
  bar.className = "pages-code-bar";
  bar.contentEditable = "false";

  const select = document.createElement("select");
  select.className = "pages-code-language";
  bindEditorWords(select, () => select.setAttribute("aria-label", t(translate, "pages.editor.code-language")));
  PAGES_CODE_LANGUAGES.forEach((language) => {
    const option = document.createElement("option");
    option.value = language.id;
    if ("textKey" in language) bindEditorWords(option, () => { option.textContent = t(translate, language.textKey); });
    else option.textContent = language.label;
    select.append(option);
  });
  select.value = safePagesLanguage(node.attrs.language);

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "pages-code-copy";
  bindEditorWords(copy, () => {
    const label = t(translate, "pages.editor.copy-code");
    copy.setAttribute("aria-label", label); copy.title = label;
  });
  copy.innerHTML = dsIcon("copy");

  bar.append(select, copy);
  const pre = document.createElement("pre");
  pre.className = "pages-code";
  const code = document.createElement("code");
  const placeholder = () => { if (code.classList.contains("is-empty")) code.dataset.placeholder = t(translate, "pages.editor.code"); };
  bindEditorWords(code, placeholder);
  pre.append(code);
  dom.append(bar, pre);

  select.addEventListener("mousedown", keepOut);
  select.addEventListener("change", () => {
    const pos = getPos();
    if (pos === undefined) return;
    const current = view.state.doc.nodeAt(pos);
    if (!current) return;
    const language = safePagesLanguage(select.value);
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, language }));
    view.focus();
  });
  copy.addEventListener("mousedown", keepFocus);
  // The design system's one copy feedback (VUX-19): a check only once the clipboard took it, a cross when it did not.
  copy.addEventListener("click", () => {
    const pos = getPos();
    const current = pos === undefined ? null : view.state.doc.nodeAt(pos);
    const labels: CopyLabels = { done: t(translate, "pages.editor.copied"), failed: t(translate, "pages.editor.copy-failed") };
    void window.molisCopy?.(copy, current?.textContent ?? "", labels);
  });

  const sync = (next: Node) => {
    const language = safePagesLanguage(next.attrs.language);
    if (select.value !== language) select.value = language;
    pre.dataset.language = language;
    dom.dataset.language = language;
    if (next.content.size === 0) {
      code.classList.add("is-empty");
      placeholder();
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
      // This attribute is the code block's chrome; a new placeholder is not a document edit.
      if (mutation.type === "attributes" && mutation.target === code && mutation.attributeName === "data-placeholder") return true;
      return !code.contains(mutation.target as globalThis.Node);
    },
  };
}

/** Recolour code blocks only when the document actually moved; highlighting every state is wasted work. */
export function codeHighlightPlugin() {
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

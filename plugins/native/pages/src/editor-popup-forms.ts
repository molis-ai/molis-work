import type { EditorView } from "prosemirror-view";
import type { Node } from "prosemirror-model";
import { placeOverlay } from "@molis-ai/molis-work-design-system/floating";
import { runBlockCommand } from "./editor-block-selection.js";
import { openEditorComment } from "./editor-comments.js";
import { blockPos, linkAt, setCalloutStyle, setComment, setLink, setTone, toneAt } from "./commands.js";
import { safePagesHref } from "./link.js";
import { calloutIconFor, PAGES_CALLOUT_ICONS, safePagesCalloutTone } from "./callout.js";
import { PAGES_TONES } from "./tone.js";
import { resolvePagesFrozen } from "./focus.js";
import type { EditorPopup } from "./editor-popup.js";
import type { PagesEditorMountOptions } from "./editor-types.js";
import { t, dsIcon, actions, keepFocus } from "./editor-view-ui.js";

function applyComment(view: EditorView, from: number, to: number, text: string, id?: string): void {
  const body = text.trim();
  const nextId = body ? (id || crypto.randomUUID()) : "";
  setComment(from, to, text, nextId)(view.state, view.dispatch.bind(view));
  view.focus();
}

function fillCalloutStyle(pop: HTMLElement, view: EditorView, at: () => ReturnType<typeof resolvePagesFrozen>, node: Node, anchor: HTMLElement, translate: PagesEditorMountOptions["translate"], hidePop: () => void): void {
  const choice = (className: string, on: boolean, name: string, style: Parameters<typeof setCalloutStyle>[1]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className + (on ? " is-on" : "");
    const label = t(translate, name);
    button.setAttribute("aria-label", label);
    button.title = label;
    button.addEventListener("mousedown", keepFocus);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const target = at(); if (!target?.intact) return;
      runBlockCommand(view, setCalloutStyle(target.from, style));
      hidePop();
    });
    return button;
  };
  const iconHead = document.createElement("p");
  iconHead.className = "pages-menu-label";
  iconHead.textContent = t(translate, "图标");
  const grid = document.createElement("div");
  grid.className = "pages-icon-grid";
  const currentIcon = calloutIconFor(node.attrs.icon, node.attrs.tone);
  PAGES_CALLOUT_ICONS.forEach((item) => {
    const button = choice("pages-icon-pick", currentIcon === item.id, item.label, { icon: item.id });
    button.innerHTML = dsIcon(item.id);
    grid.append(button);
  });

  const toneHead = document.createElement("p");
  toneHead.className = "pages-menu-label";
  toneHead.textContent = t(translate, "颜色");
  const strip = document.createElement("div");
  strip.className = "pages-tone-strip";
  const currentTone = safePagesCalloutTone(node.attrs.tone);
  PAGES_TONES.forEach((tone) => {
    const button = choice("pages-tone", currentTone === tone.id, tone.label, { tone: tone.id });
    button.dataset.pagesTone = tone.id;
    strip.append(button);
  });

  pop.append(iconHead, grid, toneHead, strip);
  placeOverlay(pop, anchor.getBoundingClientRect(), "below");
}

/** The forms that belong to a block: its note, the colors of a selection, a callout's icon and tone. */
export function createBlockForms(popup: EditorPopup, options: PagesEditorMountOptions) {
  const { pop, showPop, hidePop, anchorPop, placePop, reclaimPop } = popup;

  const openNote = (view: EditorView, index: number) => {
    reclaimPop();
    const node = view.state.doc.child(index);
    const pos = blockPos(view.state.doc, index);
    showPop();
    const anchor = anchorPop(pos, pos + node.nodeSize);
    const area = document.createElement("textarea");
    area.className = "mw-input";
    area.rows = 4;
    area.placeholder = t(options.translate, "块备注");
    area.value = String(node.attrs.note || "");
    pop.append(area);
    pop.append(actions(options.translate, () => {
      const at = anchor(); if (!at?.intact) return;
      view.dispatch(view.state.tr.setNodeMarkup(at.from, undefined, { ...view.state.doc.nodeAt(at.from)?.attrs, note: area.value.trim() }));
      hidePop();
    }, hidePop));
    placeOverlay(pop, view.coordsAtPos(pos + 1), "above");
    area.focus();
  };

  const openTone = (view: EditorView) => {
    showPop();
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
      strip.addEventListener("mousedown", keepFocus);
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
    placePop(view.coordsAtPos(view.state.selection.from), "below", t(options.translate, "颜色"));
  };

  const openCalloutStyle = (view: EditorView, pos: number, anchor: HTMLElement) => {
    const node = view.state.doc.nodeAt(pos);
    if (!node) return;
    reclaimPop();
    showPop();
    fillCalloutStyle(pop, view, anchorPop(pos, pos + node.nodeSize), node, anchor, options.translate, hidePop);
  };

  return { openNote, openTone, openCalloutStyle };
}

/** The forms that belong to a selection of text: a link's address and a comment. */
export function createTextForms(popup: EditorPopup, options: PagesEditorMountOptions) {
  const { pop, showPop, hidePop, anchorPop, placePop } = popup;

  const openComment = (view: EditorView) => openEditorComment(view, { onComment: options.onComment,
    pop, showPop, anchorPop, translate: options.translate, actions, hidePop: () => hidePop(), applyComment, placePop });

  const openLink = (view: EditorView) => {
    const found = linkAt(view.state.doc, view.state.selection);
    if (!found) return;
    showPop();
    const anchor = anchorPop(found.from, found.to);
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
      const at = anchor(); if (!at?.intact) return;
      if (field.value.trim() && !safePagesHref(field.value)) {
        error.textContent = t(options.translate, "请输入有效链接，例如 https://example.com");
        error.hidden = false;
        field.setAttribute("aria-invalid", "true");
        field.focus();
        return;
      }
      runBlockCommand(view, setLink(at.from, at.to, field.value));
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
        const at = anchor(); if (!at?.intact) return;
        runBlockCommand(view, setLink(at.from, at.to, ""));
        hidePop();
      });
      row.prepend(remove);
    }
    pop.append(row);
    placePop(view.coordsAtPos(found.from), "below", t(options.translate, "链接"));
    field.focus();
    field.select();
  };

  return { openComment, openLink };
}

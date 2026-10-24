import type { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import { followScroll, placeOverlay } from "@molis-ai/molis-work-design-system/floating";
import { linkAt, commentAt } from "./commands.js";
import { bookmarkLabel, safePagesHref } from "./link.js";
import type { PagesEditorMountOptions } from "./editor-types.js";
import { t, keepFocus } from "./editor-view-ui.js";

function previewButton(options: Pick<PagesEditorMountOptions, "translate">, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = t(options.translate, label);
  return button;
}

function placePreviewRange(view: EditorView, preview: HTMLElement, range: { from: number; to: number }, side: "above" | "below"): void {
  const start = view.coordsAtPos(range.from);
  const end = view.coordsAtPos(range.to);
  placeOverlay(preview, { left: start.left, right: end.left, top: start.top, bottom: end.bottom }, side);
}

/** Keeps preview DOM private; the entry still controls every lifecycle point. */
export function createEditorPreviews(options: Pick<PagesEditorMountOptions, "translate">) {
  const linkPreview = document.createElement("div");
  linkPreview.className = "pages-link-preview";
  linkPreview.hidden = true;
  const linkLabel = document.createElement("span");
  const linkOpen = previewButton(options, "打开");
  const linkEdit = previewButton(options, "编辑");
  linkPreview.append(linkLabel, linkOpen, linkEdit);
  const commentPreview = document.createElement("div");
  commentPreview.className = "pages-comment-preview";
  commentPreview.hidden = true;
  const commentText = document.createElement("p");
  const commentEdit = previewButton(options, "编辑");
  commentPreview.append(commentText, commentEdit);

  function update(current: EditorView): void {
    const selection = current.state.selection;
    if (!selection.empty || !(selection instanceof TextSelection)) {
      linkPreview.hidden = true;
      commentPreview.hidden = true;
      return;
    }
    const link = linkAt(current.state.doc, selection);
    if (link?.href) {
      linkLabel.textContent = bookmarkLabel(link.href) || link.href;
      linkPreview.hidden = false;
      placePreviewRange(current, linkPreview, link, "above");
    } else {
      linkPreview.hidden = true;
    }
    const comment = commentAt(current.state.doc, selection);
    if (comment?.text) {
      commentText.textContent = comment.text;
      commentPreview.hidden = false;
      placePreviewRange(current, commentPreview, comment, "below");
    } else {
      commentPreview.hidden = true;
    }
  }

  function blur(view: EditorView, pop: HTMLElement): false {
    window.setTimeout(() => {
      if (!linkPreview.contains(document.activeElement) && !commentPreview.contains(document.activeElement) && !pop.contains(document.activeElement) && document.activeElement !== view.dom) {
        linkPreview.hidden = true;
        commentPreview.hidden = true;
      }
    }, 120);
    return false;
  }

  function bind(view: EditorView,
    openLink: (view: EditorView) => void, openComment: (view: EditorView) => void): void {
    linkPreview.addEventListener("mousedown", keepFocus);
    commentPreview.addEventListener("mousedown", keepFocus);
    commentEdit.addEventListener("click", () => openComment(view));
    linkOpen.addEventListener("click", () => {
      const found = linkAt(view.state.doc, view.state.selection);
      const href = safePagesHref(found?.href);
      if (href) window.open(href, "_blank", "noopener,noreferrer");
    });
    linkEdit.addEventListener("click", () => openLink(view));
  }

  function follow(view: EditorView, onScreen?: () => void): () => void {
    const reposition = () => {
      if (view.hasFocus()) {
        update(view);
      } else {
        linkPreview.hidden = true;
        commentPreview.hidden = true;
      }
      // The toolbar follows the selection while a form it holds has the focus too.
      onScreen?.();
    };
    const stopScroll = followScroll(linkPreview, reposition);
    window.addEventListener("resize", reposition);
    return () => {
      stopScroll();
      window.removeEventListener("resize", reposition);
    };
  }

  function remove(): void {
    linkPreview.remove();
    commentPreview.remove();
  }

  return { linkPreview, commentPreview, update, blur, bind, follow, remove };
}

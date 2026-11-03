import { escText, escapeAttr } from "./dom.js";
import { childOf, childUrl, fileUrl, hasFile, isFailed } from "./model.js";
import type { Item, ShelfPage } from "./types.js";

export const welcome = (page: ShelfPage): string => {
  const { L } = page;
  return '<div class="shelf-welcome"><h2>' + L("shelf.panes.put-materials-in-take-results") + "</h2><p>" + L("shelf.panes.set-it-down-first-then") + '</p><div class="shelf-cta"><span class="shelf-primary" role="button" tabindex="0" data-shelf-sample>' + L("shelf.panes.try-the-sample-pdf") + '</span><span class="shelf-paper" role="button" tabindex="0" data-shelf-pick>' + L("shelf.panes.choose-my-file") + "</span></div></div>";
};

export const idle = (page: ShelfPage): string =>
  '<div class="shelf-idle"><p style="font-size:17px;font-weight: 400;color:var(--da-text)">' + page.L("shelf.panes.choose-a-material") + "</p><p>" + page.L("shelf.panes.preview-here-then-use-the") + "</p></div>";

/** A short document: a kicker, a title and the paragraphs of `body`. */
export const docHtml = (kicker: string, title: string, body: string): string =>
  '<div class="shelf-preview-inner shelf-doc"><p class="shelf-kicker">' + escText(kicker) + '</p><h1 class="shelf-title">' + escText(title) + "</h1>"
  + String(body || "").split(/\n+/).map((line) => "<p>" + escText(line) + "</p>").join("") + "</div>";

/** Shows why something could not be read, in the preview. */
export const showProblem = (page: ShelfPage, title: string, message: string): void => {
  page.preview.innerHTML = docHtml("Shelf", title, message);
};

function failedPane(page: ShelfPage, item: Item): string {
  const { L } = page;
  const back = (item.source_item_ids || []).length
    ? '<div class="shelf-cta"><span class="shelf-primary" role="button" tabindex="0" data-shelf-retry>' + escText(L("shelf.panes.back-to-materials-then-retry")) + "</span></div>"
    : "";
  return '<div class="shelf-preview-inner shelf-doc"><p class="shelf-kicker tone-clay">' + escText(L("shelf.panes.this-action-did-not-finish")) + '</p><h1 class="shelf-title">' + escText(item.name) + "</h1><p>"
    + escText(item.failure_reason || L("shelf.panes.the-job-failed")) + '</p><p class="muted">' + escText(L("shelf.panes.the-materials-are-still-on")) + "</p>" + back + "</div>";
}

function folderPane(page: ShelfPage, item: Item): string {
  const { L, selectedChild } = page;
  const child = selectedChild && selectedChild.item_id === item.item_id ? childOf(item, selectedChild.relative) : undefined;
  if (child) {
    const url = childUrl(page, item.item_id, child.relative);
    const kicker = '<p class="shelf-kicker">' + escText(item.name + " / " + child.relative) + "</p>";
    if (child.kind === "image") return '<div class="shelf-preview-inner">' + kicker + '<img class="shelf-image" alt="" data-shelf-media="' + url + '"></div>';
    if (child.kind === "pdf") return '<div class="shelf-preview-inner">' + kicker + '<iframe class="shelf-pdf-frame" title="' + escapeAttr(child.name) + '" data-shelf-media="' + url + '"></iframe></div>';
    return '<div class="shelf-preview-inner shelf-doc" data-shelf-child-doc="' + escapeAttr(child.relative) + '">' + kicker + '<h1 class="shelf-title">' + escText(child.name) + '</h1><p class="muted">' + escText(L("shelf.panes.reading-this-file")) + "</p></div>";
  }
  const rows = (item.children || []).map((entry) => "<p>" + escText(entry.relative) + "</p>").join("");
  return '<div class="shelf-preview-inner shelf-doc"><p class="shelf-kicker">' + escText(L("shelf.composer.folder")) + '</p><h1 class="shelf-title">' + escText(item.name) + '</h1><p class="muted">'
    + escText(L("shelf.panes.count-expand-on-the-left", { count: String((item.children || []).length) })) + "</p>" + rows + "</div>";
}

/** The pane for one item: its failure, its folder, its PDF, its image, or its text read in place. */
export function previewPane(page: ShelfPage, item: Item | null | undefined, kicker?: string): string {
  const { L } = page;
  if (item && isFailed(item) && !hasFile(item)) return failedPane(page, item);
  if (item && item.kind === "folder") return folderPane(page, item);
  if (!item) return '<div class="shelf-preview-inner shelf-doc"><p class="shelf-kicker">' + escText(kicker || L("shelf.panes.source")) + '</p><p class="muted">' + escText(L("shelf.panes.the-source-material-is-no")) + "</p></div>";
  const label = kicker || item.name;
  if (item.kind === "pdf") {
    const text = item.preview_text ? '<div class="shelf-doc" style="margin-top:24px"><p class="muted">' + escText(item.preview_text) + "</p></div>" : "";
    return '<div class="shelf-preview-inner"><p class="shelf-kicker">' + escText(label) + '</p><iframe class="shelf-pdf-frame" title="' + escapeAttr(item.name) + '" data-shelf-media="' + fileUrl(page, item.item_id) + '"></iframe>' + text + "</div>";
  }
  if (item.kind === "image") return '<div class="shelf-preview-inner"><p class="shelf-kicker">' + escText(label) + '</p><img class="shelf-image" alt="" data-shelf-media="' + fileUrl(page, item.item_id) + '"></div>';
  const text = page.textCache.get(item.item_id) ?? item.preview_text ?? "";
  const coverage = item.material_coverage?.length ? '<p class="settings-hint" data-shelf-coverage>' + escText(L("shelf.panes.material-coverage")) + " · " + item.material_coverage.map(escText).join("；") + "</p>" : "";
  return '<div class="shelf-preview-inner shelf-doc" data-shelf-read="' + escapeAttr(item.item_id) + '"><p class="shelf-kicker">' + escText(label) + "</p>" + coverage + '<div class="shelf-reading">' + page.reading.render(item, text) + "</div></div>";
}

export function editorHtml(page: ShelfPage, item: Item): string {
  const ext = String(item.name || "").split(".").pop()?.toLowerCase() ?? "";
  const code = ext !== "md" && ext !== "txt" && ext !== "markdown";
  return '<div class="shelf-editor-wrap"><p class="shelf-edit-hint">' + escText(page.L("shelf.panes.editing-a-copy-the-original")) + '</p><p class="shelf-edit-hint" data-shelf-edit-status role="status" hidden></p><textarea class="shelf-editor' + (code ? " is-code" : "") + '" data-shelf-editor spellcheck="false">' + escText(page.editDraft) + "</textarea></div>";
}

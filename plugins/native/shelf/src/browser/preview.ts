import { escText, escapeAttr } from "./dom.js";
import { renderBar } from "./bar.js";
import { focusEditor } from "./edit.js";
import { cap, childUrl, comparisonSources, fileUrl, hasFile, isEditable, itemById, stageBusy } from "./model.js";
import { docHtml, editorHtml, idle, previewPane, welcome } from "./panes.js";
import { readText } from "./request.js";
import type { Item, ShelfPage } from "./types.js";

/** Opens the item's copy as a download in a browser, where the desktop would hand the file over. */
export const download = (page: ShelfPage, item: Item): void => {
  Object.assign(document.createElement("a"), { href: fileUrl(page, item.item_id), download: item.name || "" }).click();
};

/** The whole copy as text. A copy that cannot be read is said in Shelf's own words, whatever the Host answered. */
export async function readFullText(page: ShelfPage, item: Item): Promise<string> {
  const version = page.textVersion;
  const fallback = page.L("shelf.preview.could-not-read-this-copy");
  const text = await readText(page, fileUrl(page, item.item_id), fallback).catch((error: Error) => {
    throw error.name === "AbortError" ? error : new Error(fallback);
  });
  if (version !== page.textVersion) throw new DOMException("Content changed", "AbortError");
  page.textCache.set(item.item_id, text);
  return text;
}

/** Hooks the media in the preview to their files and reads the full text of each document on show. */
export function fillReading(page: ShelfPage): void {
  const { preview, host, reading } = page;
  for (const node of preview.querySelectorAll<HTMLElement>("[data-shelf-media]")) host.loadMedia(node, node.dataset.shelfMedia ?? "");
  for (const node of preview.querySelectorAll<HTMLElement>("[data-shelf-read]")) {
    const item = itemById(page, node.dataset.shelfRead);
    if (!item || page.textCache.has(item.item_id)) continue;
    readFullText(page, item).then((text) => {
      // Same text as the preview shown: re-rendering would only wipe a selection made meanwhile.
      const body = node.querySelector(".shelf-reading");
      if (node.isConnected && body && text !== item.preview_text) body.innerHTML = reading.render(item, text);
    }).catch((error: Error) => {
      if (error.name === "AbortError" || !node.isConnected) return;
      const line = document.createElement("p");
      line.className = "shelf-read-error";
      line.textContent = error.message;
      node.append(line);
    });
  }
}

function fillChildDoc(page: ShelfPage): void {
  const { preview, selectedChild, selected, reading } = page;
  const doc = preview.querySelector<HTMLElement>("[data-shelf-child-doc]");
  if (!doc || !selectedChild) return;
  readText(page, childUrl(page, selectedChild.item_id, selectedChild.relative), "").catch(() => "").then((text) => {
    if (!doc.isConnected || !text) return;
    const relative = doc.dataset.shelfChildDoc ?? "";
    const child = selected?.children?.find((entry) => entry.relative === relative);
    const holder = document.createElement("div");
    holder.innerHTML = reading.render(child || { name: relative }, text);
    doc.querySelectorAll("p.muted").forEach((node) => node.remove());
    doc.append(...holder.childNodes);
  }).catch(() => undefined);
}

export function expandShelfStage(page: ShelfPage, expanded: boolean): void {
  page.bench.dataset.expanded = expanded ? "true" : "false";
  if (page.stageWorkspace) page.stageWorkspace.hidden = !expanded;
}
export const syncShelfStage = (page: ShelfPage): void => expandShelfStage(page, Boolean(page.selected || page.selClip || page.composingAction));

/** The title strip above the preview. */
function syncChrome(page: ShelfPage): void {
  const { bench, L, selected, selClip } = page;
  const chrome = bench.querySelector<HTMLElement>("[data-shelf-chrome]");
  const title = bench.querySelector("[data-shelf-chrome-title]");
  const tag = bench.querySelector("[data-shelf-chrome-tag]");
  if (chrome) chrome.hidden = !(selected || selClip);
  if (title) title.textContent = selClip ? selClip.title : (selected ? selected.name : "");
  if (!tag) return;
  const group = selected?.group === "result" ? L("shelf.preview.result") : L("shelf.preview.material");
  tag.textContent = selClip ? L("shelf.preview.clipboard") : (selected ? group + " · " + cap(selected.kind) : "");
}

/** Which of the strip's buttons the chosen item has use for. */
function syncButtons(page: ShelfPage): void {
  const { bench, host, L, selected, selClip, projectPrefix, editing } = page;
  const busy = stageBusy(page);
  const on = (selector: string) => bench.querySelector<HTMLElement>(selector);
  const copyBtn = on("[data-shelf-copy-file]");
  if (copyBtn) {
    copyBtn.hidden = !hasFile(selected) || Boolean(selClip);
    copyBtn.textContent = host.nativeFiles ? L("shelf.preview.copy-file") : L("shelf.preview.download-file");
  }
  const useBtn = on("[data-shelf-use-material]");
  if (useBtn) useBtn.hidden = !(selected?.group === "result" && hasFile(selected)) || Boolean(selClip);
  const materialBtn = on("[data-shelf-project-material]");
  if (materialBtn) materialBtn.hidden = !projectPrefix || !selected || Boolean(selClip) || !hasFile(selected) || !isEditable(selected) || busy;
  const useInProject = on("[data-shelf-use-in-project]");
  if (useInProject) useInProject.hidden = !projectPrefix || document.body.dataset.projectId === "personal" || !selected || Boolean(selClip);
  const original = on("[data-shelf-original-artifact]");
  const source = selected?.artifact_source;
  if (original) {
    original.hidden = !source || Boolean(selClip);
    if (source) (original as HTMLAnchorElement).href = source.project_path + "/artifacts/" + encodeURIComponent(source.reference.artifact_id) + "/versions/" + source.reference.version;
  }
  const editBtn = on("[data-shelf-edit]");
  if (editBtn) {
    editBtn.hidden = !(selected && !selClip && hasFile(selected) && isEditable(selected) && !busy);
    editBtn.textContent = editing ? L("shelf.preview.done-editing") : L("shelf.preview.edit-copy");
    editBtn.classList.toggle("is-on", editing);
    editBtn.setAttribute("aria-pressed", editing ? "true" : "false");
  }
}

export function syncStage(page: ShelfPage): void {
  const { stage, bench, host, selected, selClip, compare } = page;
  const comparing = Boolean(compare && selected?.group === "result");
  stage.classList.toggle("is-result", Boolean(selected?.group === "result"));
  stage.classList.toggle("is-compare", comparing);
  stage.classList.toggle("is-item", Boolean(selected && !selClip));
  const compareBtn = bench.querySelector("[data-shelf-compare]");
  if (compareBtn) {
    compareBtn.classList.toggle("is-on", comparing);
    compareBtn.setAttribute("aria-pressed", comparing ? "true" : "false");
  }
  syncChrome(page);
  syncButtons(page);
  const context: Record<string, unknown> = { plugin_id: host.pluginId, surface_title: "Shelf" };
  if (selected && !selClip) context.object = { kind: "shelf_item", id: selected.item_id, version: selected.status + ":" + (selected.preview_text || "").length, title: selected.name };
  bench.setAttribute("data-assistant-context", JSON.stringify(context));
}

/** The preview while the person compares a result with the materials it came from. */
function paintComparison(page: ShelfPage, selected: Item): void {
  const { L, preview } = page;
  const sources = comparisonSources(page);
  if (!page.compareSourceId || !sources.some((item) => item.item_id === page.compareSourceId)) page.compareSourceId = sources[0]?.item_id ?? null;
  const source = sources.find((item) => item.item_id === page.compareSourceId) || null;
  const nav = sources.length > 1
    ? '<div class="shelf-compare-nav">' + sources.map((item) => '<button type="button" class="shelf-source' + (item.item_id === source?.item_id ? " is-on" : "") + '" data-shelf-source="' + escapeAttr(item.item_id) + '">' + escText(item.name) + "</button>").join("") + "</div>"
    : "";
  preview.innerHTML = '<div class="shelf-compare" data-shelf-compare-layout>'
    + '<div data-shelf-compare-pane="source">' + nav + previewPane(page, source, L("shelf.panes.source") + (source ? " · " + source.name : "")) + "</div>"
    + '<div class="shelf-rule"></div>'
    + '<div data-shelf-compare-pane="result">' + (page.editing ? editorHtml(page, selected) : previewPane(page, selected, L("shelf.preview.result") + " · " + selected.name)) + "</div>"
    + "</div>";
  renderBar(page, "result");
  focusEditor(page);
  fillReading(page);
}

export function paintPreview(page: ShelfPage): void {
  const { L, stage, bench, preview, snapshot, selected, selClip } = page;
  if (!page.lifetime.alive || page.composingAction) return;
  stage.classList.remove("is-confirm", "is-run", "is-fail");
  const line = bench.querySelector<HTMLElement>("[data-shelf-run-line]");
  if (line) line.hidden = true;
  syncStage(page);
  if (page.compare && selected?.group === "result") { paintComparison(page, selected); return; }
  if (selClip) {
    preview.innerHTML = docHtml(L("shelf.preview.selecting-only-previews"), selClip.title, selClip.body) + '<p class="shelf-clip-foot">' + escText(L("shelf.preview.previewing-a-saved-clip-add")) + "</p>";
    renderBar(page, "clipboard");
    return;
  }
  if (!selected) {
    const shelved = (snapshot.materials || []).length > 0;
    preview.innerHTML = shelved ? idle(page) : welcome(page);
    renderBar(page, shelved ? "none" : "empty");
    return;
  }
  preview.innerHTML = page.editing && isEditable(selected) ? editorHtml(page, selected) : previewPane(page, selected);
  renderBar(page, selected.group === "result" ? "result" : selected.kind);
  focusEditor(page);
  fillChildDoc(page);
  fillReading(page);
}

export function showPreview(page: ShelfPage): void {
  page.compare = false;
  page.compareSourceId = null;
  paintPreview(page);
}


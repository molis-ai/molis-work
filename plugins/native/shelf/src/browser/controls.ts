import { admitFiles, showAdmissionError } from "./admit.js";
import { renderBar } from "./bar.js";
import { closest, messageOf } from "./dom.js";
import { submitComposer } from "./composer.js";
import { copyFiles } from "./clips.js";
import { flushEdit, saveCopy, startEdit, stopEdit, focusEditor } from "./edit.js";
import { paintPreview } from "./preview.js";
import { post } from "./request.js";
import { applySnapshot } from "./snapshot.js";
import { benchClick } from "./bench.js";
import { cancelJob, runJob } from "./run.js";
import type { ShelfPage, SnapshotAnswer } from "./types.js";

/** Spans that act as buttons answer Enter and Space like one. */
function activatePaper(event: Event): void {
  const key = event as KeyboardEvent;
  if (key.key !== "Enter" && key.key !== " ") return;
  const control = closest(event, "[role=button]");
  if (!control) return;
  event.preventDefault();
  control.click();
}

/** Compare a result with its source, or leave the comparison. */
async function toggleCompare(page: ShelfPage): Promise<void> {
  if (!page.selected || page.selected.group !== "result") return;
  await flushEdit(page);
  page.compare = !page.compare;
  page.compareSourceId = page.compare ? page.selected.source_item_id : null;
  paintPreview(page);
}

/** Types in the editor are kept as the copy a moment after the person stops. */
function typedInEditor(page: ShelfPage, event: Event): void {
  const editor = closest(event, "[data-shelf-editor]") as HTMLTextAreaElement | null;
  if (!editor || !page.editing) return;
  const text = editor.value;
  page.editDraft = text;
  const itemId = page.selected?.item_id;
  if (page.editTimer) page.lifetime.clearTimeout(page.editTimer);
  page.editTimer = page.lifetime.timeout(() => {
    page.editTimer = 0;
    saveCopy(page, itemId, text).catch(() => undefined);
  }, 400);
}

/** The strip's own buttons and the file picker. */
function installStrip(page: ShelfPage): void {
  const { lifetime, bench, fileInput } = page;
  const on = (selector: string) => bench.querySelector(selector);
  lifetime.listen(on("[data-shelf-back]"), "click", () => { page.pending = null; paintPreview(page); });
  lifetime.listen(on("[data-shelf-compare]"), "click", () => toggleCompare(page));
  lifetime.listen(on("[data-shelf-edit]"), "click", async () => {
    if (!page.editing) { await startEdit(page); return; }
    try { await stopEdit(page); } catch { focusEditor(page); }
  });
  lifetime.listen(on("[data-shelf-copy-file]"), "click", async () => {
    if (!page.selected) return;
    try {
      await copyFiles(page, [page.selected]);
    } catch (error) {
      if (!lifetime.alive) return;
      page.stickyHint = messageOf(error);
      renderBar(page, page.lastBarKind);
    }
  });
  lifetime.listen(on("[data-shelf-use-material]"), "click", async () => {
    if (!page.selected) return;
    const payload = await post<SnapshotAnswer>(page, "/items/" + encodeURIComponent(page.selected.item_id) + "/use-material");
    applySnapshot(page, payload.snapshot, payload.item?.item_id);
  });
  lifetime.listen(fileInput, "change", async () => {
    if (!fileInput) return;
    const files = [...(fileInput.files || [])];
    try {
      if (files.length) await admitFiles(page, files);
    } catch (error) {
      if (lifetime.alive) showAdmissionError(page, error);
    } finally {
      fileInput.value = "";
    }
  });
}

export function installControls(page: ShelfPage): void {
  const { lifetime, bench, preview } = page;
  lifetime.listen(preview, "submit", (event) => submitComposer(page, event));
  lifetime.listen(bench, "keydown", activatePaper);
  lifetime.listen(bench, "click", (event) => benchClick(page, event));
  lifetime.listen(bench, "click", (event) => {
    if (!closest(event, "[data-shelf-retry-admit]") || !page.admitRetry) return;
    const { files } = page.admitRetry;
    page.admitRetry = null;
    page.stickyHint = "";
    renderBar(page, page.lastBarKind);
    admitFiles(page, files).catch((error) => { if (lifetime.alive) showAdmissionError(page, error); });
  });
  lifetime.listen(bench.querySelector("[data-shelf-run]"), "click", () => runJob(page));
  lifetime.listen(bench.querySelector("[data-shelf-cancel]"), "click", () => cancelJob(page));
  lifetime.listen(preview, "input", (event) => typedInEditor(page, event));
  installStrip(page);
}

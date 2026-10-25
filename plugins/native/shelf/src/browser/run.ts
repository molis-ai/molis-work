import { renderBar } from "./bar.js";
import { messageOf, said, setText } from "./dom.js";
import { aiLabel, batch, confirmRecipe, isLocalRecipe } from "./model.js";
import { paintPreview } from "./preview.js";
import { paintLists } from "./rows.js";
import { failureCode, failureSnapshot, post, read } from "./request.js";
import { applySnapshot } from "./snapshot.js";
import type { ConfirmRecipe, ShelfPage, Snapshot, SnapshotAnswer } from "./types.js";

/** Follows the running job while the stage shows it, so the cancel button knows which one to cancel. */
export function watchRun(page: ShelfPage): void {
  page.runWatch?.();
  page.runWatch = page.lifetime.poll(async (signal) => {
    if (!page.stage.classList.contains("is-run")) { page.runWatch?.(); page.runWatch = null; return; }
    const next = await read<Snapshot>(page, "/", page.L("shelf.directory.could-not-read-the-shelf"), signal);
    page.lifetime.assertCurrent(signal);
    page.runningJob = (next.running_jobs || [])[0]?.job_id ?? null;
    const cancel = page.bench.querySelector<HTMLElement>("[data-shelf-cancel]");
    if (cancel) cancel.hidden = !page.runningJob;
  }, 700, () => undefined);
}

function runLine(page: ShelfPage, recipe: ConfirmRecipe): string {
  const { L } = page;
  if (isLocalRecipe(recipe)) return page.selected?.kind === "image" ? L("shelf.run.reading-the-text-in-this") : L("shelf.run.extracting-selectable-text-from-the");
  return L("shelf.run.agent-is-running-recipe-on", { agent: aiLabel(page), recipe: said(L, recipe.short_title || recipe.label) });
}

/** The job could not be done: the stage says why, or goes back when the person cancelled it. */
function showRunFailure(page: ShelfPage, error: unknown, line: HTMLElement | null): void {
  const snapshot = failureSnapshot(error);
  if (snapshot) page.snapshot = snapshot;
  if (failureCode(error) === "shelf.cancelled") {
    page.pending = null;
    paintLists(page);
    paintPreview(page);
    return;
  }
  page.stage.classList.remove("is-run");
  page.stage.classList.add("is-fail");
  if (line) { line.hidden = false; line.textContent = messageOf(error); }
  setText(page.bench, "[data-shelf-back]", page.L("shelf.panes.back-to-materials-then-retry"));
  paintLists(page);
  renderBar(page, page.lastBarKind);
}

/** Runs the confirmed action on the chosen materials. */
export async function runJob(page: ShelfPage): Promise<void> {
  const recipe = confirmRecipe(page);
  const { selected, pending } = page;
  if (!recipe || !selected || !pending) return;
  const picked = batch(page);
  if (!picked.length) return;
  const ran = picked.map((item) => item.item_id);
  const anchor = selected.item_id;
  page.stage.classList.remove("is-fail");
  page.stage.classList.add("is-run");
  paintLists(page);
  const line = page.bench.querySelector<HTMLElement>("[data-shelf-run-line]");
  if (line) {
    line.hidden = false;
    line.textContent = runLine(page, recipe);
  }
  watchRun(page);
  try {
    const payload = await post<SnapshotAnswer & { result?: { item_id: string } }>(page, "/jobs", {
      recipe: recipe.recipe, item_ids: ran, option_id: pending.option || "", shortcut_id: pending.shortcut ? pending.shortcut.id : "",
    });
    page.pending = null;
    // Only follow the result when the person is still standing on this job's materials.
    const stayed = !page.editing && !page.selClip && page.selected?.item_id === anchor && ran.includes(anchor);
    applySnapshot(page, payload.snapshot, stayed ? payload.result?.item_id : undefined);
  } catch (error) {
    if (!page.lifetime.alive) return;
    showRunFailure(page, error, line);
  } finally {
    page.runningJob = null;
    const cancel = page.bench.querySelector<HTMLElement>("[data-shelf-cancel]");
    if (cancel) cancel.hidden = true;
    page.runWatch?.();
    page.runWatch = null;
  }
}

export async function cancelJob(page: ShelfPage): Promise<void> {
  if (!page.runningJob) return;
  await post(page, "/jobs/" + encodeURIComponent(page.runningJob) + "/cancel").catch(() => undefined);
}


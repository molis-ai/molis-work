import { openGeneric } from "./dialog.js";
import { showNote } from "./page.js";
import { API } from "./request.js";
import { isAbort, sleep0 } from "./util.js";
import type { JellyPage, JellyPlan } from "./types.js";

/** Streaming model work (break into tasks) shows real progress and stops when the dialog is dismissed. */
export async function extractMaterial(page: JellyPage, payload: Record<string, unknown>): Promise<{ plan: JellyPlan } | null> {
  const { L } = page;
  const controller = new AbortController();
  let finished = false;
  let result: { plan: JellyPlan } | null = null;
  openGeneric(page, "jelly.plan.decompose", `<p class="jelly-muted" data-jelly-extract-stage>${page.tx("jelly.plan.extracting")}</p><progress class="jelly-extract-progress" data-jelly-extract-progress max="1" value="0"></progress><p class="jelly-muted">${page.tx("jelly.plan.extract-stops")}</p>`, "", null, () => { if (!finished) controller.abort(); });
  const dialogVersion = page.dialog.version;
  let failure: unknown;
  try {
    result = await page.stream<{ plan: JellyPlan } | null>(`${API}/ai`, payload, { signal: controller.signal, onProgress: (progress) => {
      const stage = page.root.querySelector("[data-jelly-extract-stage]");
      const bar = page.root.querySelector<HTMLProgressElement>("[data-jelly-extract-progress]");
      if (stage) stage.textContent = L("jelly.plan.extracting");
      if (bar) bar.value = progress;
    } });
    if (!result) throw new Error(L("jelly.plan.no-result"));
  } catch (error) { failure = error; } finally {
    finished = true;
    if (page.dialog.version === dialogVersion) page.$<HTMLDialogElement>("[data-jelly-dialog]").close();
    await sleep0();
  }
  if (!failure) return result;
  if (isAbort(failure)) { showNote(page, L("jelly.plan.cancelled")); return null; }
  throw failure;
}

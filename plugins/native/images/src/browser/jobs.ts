import { messageOf } from "./dom.js";
import { syncParameters } from "./connections.js";
import { paintList, showCompose } from "./list.js";
import { paintResult } from "./result.js";
import type { ImageJob, ImagesPage } from "./types.js";

export function schedulePoll(page: ImagesPage): void {
  const { s, life } = page;
  life.clearTimeout(s.timer);
  if (life.visible && s.jobs.some((job) => job.status === "running")) s.timer = life.timeout(() => { void loadJobs(page).catch(() => undefined); }, 2500);
}

/** A change of project starts the page over: the other project's jobs, selection and unsent submission do not carry across. */
export function ensureContext(page: ImagesPage): void {
  const { s, el, life } = page;
  if (s.context === page.projectId()) return;
  s.context = page.projectId();
  s.listSeq += 1;
  s.loadSeq += 1;
  s.jobs = [];
  s.jobId = "";
  s.pending = null;
  s.submitting = false;
  s.cancelling = false;
  s.listSignature = "";
  s.resultSignature = "";
  life.clearTimeout(s.timer);
  page.restoreDraft();
  paintList(page);
  syncParameters(page);
  el.result.hidden = true;
  el.compose.hidden = false;
  page.say("");
}

export function rememberJob(page: ImagesPage, job: ImageJob): void {
  const { s } = page;
  s.listSeq += 1;
  const index = s.jobs.findIndex((item) => item.id === job.id);
  if (index >= 0) s.jobs[index] = job; else s.jobs.unshift(job);
  paintList(page);
  if (s.jobId === job.id) paintResult(page, job);
}

export async function loadJobs(page: ImagesPage, signal = page.s.viewSignal): Promise<void> {
  const { s, life, L } = page;
  if (!life.visible) return;
  ensureContext(page);
  const ctx = s.context;
  const seq = ++s.listSeq;
  try {
    const payload = await page.request<{ jobs?: ImageJob[] }>("GET", "/jobs", undefined, signal);
    if (ctx !== page.projectId() || seq !== s.listSeq || !page.root.isConnected) return;
    s.jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    paintList(page);
    if (s.jobId) {
      const job = s.jobs.find((item) => item.id === s.jobId);
      if (job) paintResult(page, job); else showCompose(page);
    }
    page.say("", false, "[data-images-list-note]");
  } catch (error) {
    if (!life.alive || signal?.aborted || ctx !== page.projectId() || seq !== s.listSeq) return;
    page.say(`${messageOf(error) || L("images.error.history")} ${L("images.history.retry")}`, true, "[data-images-list-note]");
    if (s.jobId) page.say(`${L("images.error.progress")} ${L("images.history.retry")}`, true);
    throw error;
  } finally {
    if (!signal?.aborted && ctx === page.projectId() && seq === s.listSeq) schedulePoll(page);
  }
}

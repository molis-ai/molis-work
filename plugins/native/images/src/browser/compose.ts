import { messageOf, statusOf } from "./dom.js";
import { loadJobs, ensureContext, rememberJob, schedulePoll } from "./jobs.js";
import type { ImageJob, ImagesPage } from "./types.js";

// A submission with no answer may still have reached the Host: the person is told so, and the same words reuse the same key.
const unconfirmed = (error: unknown): boolean => statusOf(error) === 0 || ["ui_host.outcome_unknown", "ui_host.invalid_response"].includes((error as { code?: string } | null)?.code || "");

async function submit(page: ImagesPage): Promise<void> {
  const { s, el, L } = page;
  ensureContext(page);
  const connection = page.pickedConn();
  if (s.submitting || !s.context || !connection || connection.available === false || !el.compose.reportValidity()) return;
  const currentContext = s.context;
  const body: Record<string, unknown> = { connection_id: connection.id, prompt: el.prompt.value.trim() };
  if (connection.api_format === "gemini" && el.ratio.value.trim()) body.aspect_ratio = el.ratio.value.trim();
  if (connection.api_format === "openai-images" && el.size.value.trim()) body.size = el.size.value.trim();
  const fingerprint = JSON.stringify(body);
  if (!s.pending || s.pending.fingerprint !== fingerprint) s.pending = { request_id: crypto.randomUUID(), fingerprint };
  body.request_id = s.pending.request_id;
  page.saveDraft();
  s.submitting = true;
  page.syncGenerate();
  page.say("");
  try {
    const payload = await page.request<{ job: ImageJob }>("POST", "/jobs", body);
    if (currentContext !== page.projectId()) return;
    s.pending = null;
    s.jobId = payload.job.id;
    page.expand();
    rememberJob(page, payload.job);
    page.saveDraft();
    schedulePoll(page);
  } catch (error) {
    if (currentContext !== page.projectId()) return;
    page.say(unconfirmed(error) ? L("images.compose.unconfirmed") : messageOf(error), true);
    void loadJobs(page).catch(() => undefined);
  } finally {
    if (page.life.alive && currentContext === page.projectId()) {
      s.submitting = false;
      page.syncGenerate();
    }
  }
}

export function installCompose(page: ImagesPage): void {
  const { life, el } = page;
  life.listen(el.compose, "input", () => { page.saveDraft(); page.syncGenerate(); });
  life.listen(el.compose, "submit", (event) => { event.preventDefault(); void submit(page); });
}

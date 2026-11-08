import { messageOf } from "@molis-ai/molis-work-plugin-sdk/browser";
import { statusOf } from "./dom.js";
import { loadJobs, ensureContext, rememberJob, schedulePoll } from "./jobs.js";
import { loadConnections } from "./connections.js";
import type { ImageConnection, ImageJob, ImagesPage } from "./types.js";

// A submission with no answer may still have reached the Host: the person is told so, and the same words reuse the same key.
const unconfirmed = (error: unknown): boolean => statusOf(error) === 0 || ["ui_host.outcome_unknown", "ui_host.invalid_response"].includes((error as { code?: string } | null)?.code || "");

/**
 * The picked service has no usable key: the platform's connection card in the generate area asks for one, only for this service's
 * address (ASC-70, §13.5). Connected, the same generation is submitted once more (the request id of the same
 * words, so it starts one job); cancelled, the words stay as they were. Generating has no confirmation of its own, so none is added.
 * While the card is there it is the one thing to do: the earlier note goes and 生成 steps back from primary.
 */
async function needKey(page: ImagesPage, connection: ImageConnection): Promise<void> {
  const place = page.field("connection-need");
  if (!place.hidden) return;
  place.hidden = false;
  const generate = page.el.generate;
  page.say("");
  generate.classList.replace("mw-btn--primary", "mw-btn--secondary");
  try {
    const outcome = await page.host.connectionNeed(place, { kind: "image", slot_id: connection.id, base_url: connection.base_url }, { signal: page.s.viewSignal });
    if (!page.life.alive) return;
    if (outcome.status !== "connected") { page.say(page.L("images.compose.key-cancelled")); return; }
    await loadConnections(page);
    // Still the same service: generated once more (should it still have no key, submit finds this card's place taken and stops).
    if (page.s.cid === connection.id) await submit(page);
  } catch (error) {
    if ((error as Error).name !== "AbortError") page.say(messageOf(error) || page.L("images.error.request"), true);
  } finally { generate.classList.replace("mw-btn--secondary", "mw-btn--primary"); if (page.life.alive) place.hidden = true; }
}

async function submit(page: ImagesPage): Promise<void> {
  const { s, el, L } = page;
  ensureContext(page);
  const connection = page.pickedConn();
  if (s.submitting || !s.context || !connection || !el.compose.reportValidity()) return;
  if (connection.available === false) { await needKey(page, connection); return; }
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
    // The key went away between reading the services and starting (another page removed it): asked for in place, as above.
    if ((error as { code?: string }).code === "images.key_required") { void needKey(page, connection); return; }
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

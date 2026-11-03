import { editConnection, loadConnections, openConnections, paintConn, paintConnections, syncParameters, usePreset } from "./connections.js";
import { messageOf } from "./dom.js";
import { loadJobs, rememberJob, schedulePoll } from "./jobs.js";
import { paintList, showCompose } from "./list.js";
import { paintResult } from "./result.js";
import type { ImageApiFormat, ImageJob, ImagesPage } from "./types.js";

type Run = (page: ImagesPage, target: HTMLButtonElement, value: string) => void | Promise<void>;

/** A button that stays disabled while its request runs, and is released when the view goes away too. */
async function whileBusy(page: ImagesPage, target: HTMLButtonElement, work: () => Promise<void>): Promise<void> {
  target.disabled = true;
  const enable = page.life.own(() => { target.disabled = false; });
  try { await work(); } finally { enable(); }
}

async function deleteConnection(page: ImagesPage, target: HTMLButtonElement, id: string): Promise<void> {
  const { s, L } = page;
  if (!await page.host.confirm(L("images.service.delete-confirm"))) return;
  await whileBusy(page, target, async () => {
    await page.request("DELETE", `/connections/${encodeURIComponent(id)}`);
    s.conns = s.conns.filter((item) => item.id !== id);
    if (s.editingId === id) editConnection(page, "");
    paintConnections(page);
    page.saveDraft();
    page.say(L("images.service.deleted"), false, "[data-images-connection-note]");
  });
}

async function deleteJob(page: ImagesPage, target: HTMLButtonElement, id: string): Promise<void> {
  const { s, L } = page;
  const currentContext = s.context;
  if (!await page.host.confirm(L("images.result.delete-confirm"))) return;
  await whileBusy(page, target, async () => {
    await page.request("DELETE", `/jobs/${encodeURIComponent(id)}`);
    if (currentContext !== page.projectId()) return;
    s.jobs = s.jobs.filter((item) => item.id !== id);
    if (s.jobId === id) showCompose(page);
    paintList(page);
    page.saveDraft();
    schedulePoll(page);
  });
}

async function cancelJob(page: ImagesPage, id: string): Promise<void> {
  const { s } = page;
  if (s.cancelling) return;
  const currentContext = s.context;
  const shown = () => paintResult(page, s.jobs.find((item) => item.id === s.jobId));
  s.cancelling = true;
  shown();
  try {
    const payload = await page.request<{ job: ImageJob }>("POST", `/jobs/${encodeURIComponent(id)}/cancel`, {});
    if (page.life.alive && currentContext === page.projectId()) {
      rememberJob(page, payload.job);
      schedulePoll(page);
    }
  } finally {
    if (page.life.alive && currentContext === page.projectId()) {
      s.cancelling = false;
      shown();
    }
  }
}

function reuse(page: ImagesPage, id: string): void {
  const { s, el } = page;
  const job = s.jobs.find((item) => item.id === id);
  if (!job) return;
  el.prompt.value = job.prompt;
  el.size.value = job.size || "";
  el.ratio.value = job.aspect_ratio || "";
  s.cid = job.connection_id;
  s.pending = null;
  syncParameters(page);
  page.say("");
  showCompose(page, true);
}

function openJob(page: ImagesPage, id: string): void {
  const { s } = page;
  const job = s.jobs.find((item) => item.id === id);
  if (!job) return;
  s.jobId = job.id;
  page.say("");
  page.expand();
  paintList(page);
  paintResult(page, job);
  page.saveDraft();
}

function back(page: ImagesPage): void {
  page.s.jobId = "";
  page.publishContext(null);
  page.root.dataset.expanded = "false";
  page.field("workspace").hidden = true;
  page.saveDraft();
}

const refresh: Run = (page, target) => whileBusy(page, target, async () => {
  page.say("");
  await Promise.all([loadConnections(page), loadJobs(page)]);
});

/** The page's buttons by the attribute that names them; a command that edits the connection dialog waits while a save runs. */
const COMMANDS: readonly { attr: string; run: Run }[] = [
  { attr: "data-images-connections", run: (page) => openConnections(page) },
  { attr: "data-images-dialog-close", run: (page) => { if (!page.s.saving) page.el.dialog.close(); } },
  { attr: "data-images-preset", run: (page, _target, value) => { if (!page.s.saving) usePreset(page, value); } },
  { attr: "data-images-format", run: (page, _target, value) => { if (!page.s.saving) { page.s.editingFormat = value as ImageApiFormat; paintConn(page); } } },
  { attr: "data-images-add-connection", run: (page) => { if (!page.s.saving) editConnection(page, ""); } },
  { attr: "data-images-edit-connection", run: (page, _target, value) => { if (!page.s.saving) editConnection(page, value); } },
  { attr: "data-images-delete-connection", run: (page, target, value) => deleteConnection(page, target, value) },
  { attr: "data-images-use-connection", run: (page, _target, value) => { page.s.cid = value; page.el.serviceMenu.open = false; syncParameters(page); page.saveDraft(); } },
  { attr: "data-images-new", run: (page) => { page.say(""); showCompose(page, true); } },
  { attr: "data-images-back", run: (page) => back(page) },
  { attr: "data-images-refresh", run: refresh },
  { attr: "data-images-job", run: (page, _target, value) => openJob(page, value) },
  { attr: "data-images-reuse", run: (page, _target, value) => reuse(page, value) },
  { attr: "data-images-delete-job", run: (page, target, value) => deleteJob(page, target, value) },
  { attr: "data-images-cancel", run: (page, _target, value) => cancelJob(page, value) },
];

async function click(page: ImagesPage, event: Event): Promise<void> {
  const origin = event.target as Element | null;
  const link = origin?.closest('a[href^="/settings/"]');
  if (link && page.el.dialog.contains(link)) {
    page.s.resumeConnection = page.s.cid;
    page.el.dialog.close();
    return;
  }
  const target = origin?.closest("button");
  if (!target || target.disabled) return;
  const command = COMMANDS.find(({ attr }) => target.hasAttribute(attr));
  if (!command) return;
  try { await command.run(page, target, target.getAttribute(command.attr) ?? ""); }
  catch (error) { page.say(messageOf(error) || page.L("images.error.request"), true); }
}

export function installCommands(page: ImagesPage): void {
  page.life.listen(page.root, "click", (event) => { void click(page, event); });
}

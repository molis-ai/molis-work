import { installCommands } from "./commands.js";
import { installCompose } from "./compose.js";
import { installConnections, loadConnections, paintConn, paintConnections, syncSaving } from "./connections.js";
import { installLimits } from "./limits.js";
import { ensureContext, loadJobs } from "./jobs.js";
import { paintList } from "./list.js";
import { createPage } from "./page.js";
import { paintResult } from "./result.js";
import type { ImagesHost } from "./types.js";

const uiText = globalThis.t;

/** The Images page: drafts live in the browser; jobs and credentials belong to the local host. */
export function mountImages(host: ImagesHost): void {
  const root = document.querySelector<HTMLElement>("[data-images=workbench]");
  if (!root) return;
  const life = host.mountPluginClient(root);
  if (!life) return;
  const page = createPage(host, life, root);
  const { s } = page;
  installConnections(page);
  installLimits(page);
  installCompose(page);
  installCommands(page);
  // The stage stays as the workbench set it (its list first); the composer opens from 新建图片 or a chosen record. Since the
  // client loads when its surface opens (#150), expanding here would override the workbench's own choice.
  page.restoreDraft();
  page.syncGenerate();
  syncSaving(page);
  life.listen(document, "molis-work:language-changed", () => {
    s.listSignature = "";
    s.resultSignature = "";
    paintConnections(page);
    paintConn(page);
    syncSaving(page);
    paintList(page);
    const job = s.jobId ? s.jobs.find((item) => item.id === s.jobId) : undefined;
    if (job) paintResult(page, job);
  });
  life.whenVisible((signal) => {
    s.viewSignal = signal;
    ensureContext(page);
    page.syncGenerate();
    void Promise.all([loadConnections(page, signal), loadJobs(page, signal)]).catch((error: unknown) => {
      if (!signal.aborted) page.say(error instanceof Error && error.message ? error.message : uiText.text("images.error.request"), true);
    });
    return () => { life.clearTimeout(s.timer); s.listSeq++; s.loadSeq++; };
  });
}

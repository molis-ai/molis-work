import { wireClicks } from "./click.js";
import { wireDrag } from "./drag.js";
import { messageOf, required, statusOf } from "./dom.js";
import { drawList } from "./list.js";
import { loadList, onModelReady, openRun, recalled, remember, setMode, showFlow } from "./nav.js";
import { createPage } from "./page.js";
import type { WorkflowsPage } from "./page.js";
import { wirePopover } from "./pop-events.js";
import { wireRoot } from "./root-events.js";
import { restoreDrafts } from "./save.js";
import { toast, wireToast } from "./toast.js";
import type { WorkflowsHost } from "./types.js";

/** Opens what the shell asked for; a workflow the person cannot read leaves the list with a note saying so. */
async function selectFlow(page: WorkflowsPage, id: string | null, revision: number) {
  const { ui, root, L } = page;
  if (id) {
    try { await showFlow(page, id, { revision }); }
    catch (error) {
      if (revision !== page.navId) return;
      const status = statusOf(error);
      if (status !== 404 && status !== 403) { if (!page.pickedQuiet) toast(page, messageOf(error), "error"); return; }
      root.dispatchEvent(new CustomEvent("molis-work:item-unreadable", { bubbles: true, detail: { itemId: id } }));
      ui.workflow = null; ui.instance = null; ui.returnTo = null; remember(page); setMode(page, "list"); drawList(page);
      const note = required(root, "[data-wf-gone]");
      if (!page.pickedQuiet || status === 403) { note.textContent = status === 403 ? messageOf(error) : L("workflows.flow.gone"); note.hidden = false; }
    }
    return;
  }
  ui.workflow = null; ui.instance = null; ui.returnTo = null; remember(page); setMode(page, "list"); drawList(page);
}

/** The first time the page is shown: the list, then the place this tab was in (or the one the shell asked for). */
async function start(page: WorkflowsPage) {
  if (page.started || page.root.hidden) return;
  page.started = true;
  const revision = ++page.navId;
  const wanted = page.pickedItem;
  page.listReady = loadList(page); await page.listReady;
  if (revision !== page.navId) return;
  if (wanted !== undefined) { await selectFlow(page, wanted, revision); return; }
  const memory = recalled(page);
  try {
    if (memory?.workflow) await showFlow(page, memory.workflow, { keepInstance: true, revision });
    if (revision !== page.navId) return;
    if (memory?.instance) await openRun(page, memory.instance, memory.step, revision);
  } catch { if (revision === page.navId) setMode(page, "list"); }
}

/** The Workflows page: chains of plugins, handed over by a rule, an AI, a judgment or a person. */
export function workflowsClient(host: WorkflowsHost) {
  const root = document.querySelector<HTMLElement>("[data-workflows=workbench]");
  if (!root) return;
  const page = createPage(host, root);
  wireToast(page);
  restoreDrafts(page);
  document.addEventListener("molis-work:model-ready", () => { onModelReady(page).catch((error) => toast(page, messageOf(error), "error")); });
  wireClicks(page);
  wirePopover(page);
  wireRoot(page);
  wireDrag(page);

  new MutationObserver(() => { void start(page); }).observe(root, { attributes: true, attributeFilter: ["hidden"] });
  root.addEventListener("molis-work:select-item", async (event) => {
    const detail = (event as CustomEvent<{ itemId?: string; quiet?: boolean } | undefined>).detail;
    const id = detail?.itemId || null;
    page.pickedItem = id; page.pickedQuiet = Boolean(detail?.quiet);
    const revision = ++page.navId;
    if (!page.started) { await start(page); return; }
    await page.listReady;
    if (revision === page.navId) await selectFlow(page, id, revision);
  });
  void start(page);
}

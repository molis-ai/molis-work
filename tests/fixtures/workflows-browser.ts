import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { type Workflow } from "@molis-ai/molis-work-plugin-workflows";
import { openWorkflowsStore } from "./plugin-home-stores.js";
import { locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { openGoalBrowser } from "./goal-browser.js";
import { pluginFrameBrowser } from "./plugin-frame-browser.js";

export async function openWorkflowsBrowser(t: TestContext, { open = true, chromeArgs }: { open?: boolean; chromeArgs?: readonly string[] } = {}) {
  assert.ok(locateTestChrome(), "Chrome is required for the Workflows ownership regression");
  const browser = await openGoalBrowser(t, "seeded", undefined, null, undefined, undefined, {}, undefined, chromeArgs);
  assert.ok(browser, "Chrome is required for the Workflows ownership regression");
  const frame = await pluginFrameBrowser(t, browser, "workflows");
  const path = `/projects/${browser.projectId}/api/plugins/io.molis.work.native.workflows/workflows`;
  const a = (await browser.web.post<{ workflow: Workflow }>(path, {
    title: "流程 A 的材料", chain: { stations: [{ plugin: "feed" }], links: [] },
  })).workflow;
  let b = (await browser.web.post<{ workflow: Workflow }>(path, {
    title: "流程 B 的材料", chain: { stations: [{ plugin: "feed" }, { plugin: "pages" }],
      links: [{ kind: "function", title_template: "只给 B", body_template: "{正文} · B", instructions: "" }] },
  })).workflow;
  // B's version is distinct from either of A's two receipts.
  for (let n = 0; n < 4; n++) b = (await browser.web.post<{ workflow: Workflow }>(`${path}/${b.workflow_id}`, {
    revision: b.revision, title: b.title,
  })).workflow;
  const store = openWorkflowsStore(browser.homeDirectory);
  t.after(() => store.close());
  await browser.command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, browser.sessionId);
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/` }, browser.sessionId));
  if (open) {
    await browser.click("[data-plugin-strip] [data-plugin-id=workflows]");
    await frame.waitFor(`document.querySelector('[data-wf-open="${a.workflow_id}"]')`);
    await frame.click(`[data-wf-open="${a.workflow_id}"]`);
    await frame.waitFor(`document.querySelector('.wf-editor')?.dataset.id === '${a.workflow_id}'`);
  }
  return { ...browser, frame, a: store.get(a.workflow_id, browser.projectId!), b: store.get(b.workflow_id, browser.projectId!), saved: (id: string) => store.get(id, browser.projectId!) };
}

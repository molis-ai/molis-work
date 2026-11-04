import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// N53 (adversarial review 2026-11-01, batch 07-2a): a page load reads the Assistant's works once; reads asked while one is
// in flight (the start, the panel opening, coming back to the page) share it instead of each sending its own.
test("N53: the Assistant reads its works once per page load and shares reads in flight", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "user");
  if (!browser) return;
  const { projectId, origin, command, sessionId, navigate, evaluate, waitFor } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  const reads = (path: string) => evaluate<number>(`performance.getEntriesByType("resource").filter(entry => new URL(entry.name).pathname.endsWith(${JSON.stringify(path)})).length`);
  const settle = () => new Promise(resolve => setTimeout(resolve, 2_000));

  await navigate(() => command("Page.navigate", { url: origin + "/" }, sessionId));
  await waitFor(`document.querySelector('.chooser')?.dataset.selected === ${JSON.stringify(projectId)}`);
  await settle();
  const chooser = { works: await reads("/api/assistant/works"), attention: await reads("/api/attention") };
  t.diagnostic(`chooser load: ${JSON.stringify(chooser)}`);
  assert.equal(chooser.works, 1, "the chooser reads the works once");

  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-assistant-input]')");
  await settle();
  const project = { works: await reads("/api/assistant/works"), attention: await reads("/api/attention") };
  t.diagnostic(`project load: ${JSON.stringify(project)}`);
  assert.equal(project.works, 1, "the project page reads the works once");

  // Coming back to the page asks for the list again; three returns at the same moment share one read.
  const before = await reads("/api/assistant/works");
  await evaluate(`document.dispatchEvent(new Event("visibilitychange")); document.dispatchEvent(new Event("visibilitychange")); document.dispatchEvent(new Event("visibilitychange")); 0`);
  await settle();
  assert.equal(await reads("/api/assistant/works") - before, 1, "three returns to the page at once share one read");
});

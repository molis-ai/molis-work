import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// A link to the settings in a pane (a Workbench in a frame beside the main one) reaches the main Workbench by one route, the pane's own relay of
// every settings link (tab-workspace.ts): Cognia's 「打开模型设置」 sends nothing of its own.
test("Cognia's model settings link in a pane opens the settings of the Workbench it sits in, through the pane's one relay", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { command, sessionId, navigate, evaluate, waitFor, origin, projectId } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?desktop=1` }, sessionId));
  await waitFor("!!document.querySelector('[data-tab-workspace]')", 15_000);
  await evaluate(`(() => {
    window.heardFromPane = [];
    window.addEventListener("message", event => { if (event.origin === location.origin && event.data && typeof event.data.type === "string") window.heardFromPane.push(event.data.type); });
    const frame = document.createElement("iframe");
    frame.id = "cognia-pane";
    frame.src = ${JSON.stringify(`${origin}/projects/${projectId}/?workbenchPane=probe&panePlugin=cognia`)};
    document.body.append(frame);
  })()`);
  const link = "document.getElementById('cognia-pane').contentDocument?.querySelector('[data-cognia-action=model-settings]')";
  await waitFor(`Boolean(${link}) && !${link}.hidden`, 30_000);
  const opened = "Boolean(document.querySelector('[data-work-surface=settings] [data-model-settings]') || document.querySelector('[data-directory-panel=settings] [data-settings-section=models][aria-current]'))";
  assert.equal(await evaluate(opened), false, "the settings are not open yet");
  await evaluate(`${link}.click()`);
  await waitFor(opened, 10_000);
  assert.deepEqual(await evaluate<string[]>("window.heardFromPane.filter(type => /settings/.test(type))"), ["workbench-open-settings"], "the pane asked once, in the one message every pane link uses");
});

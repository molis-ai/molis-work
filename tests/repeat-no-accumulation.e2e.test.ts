import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience VUX-36「监听/计时/观察/请求/动画可释放，无无限缓存」: doing the same thing again and again leaves
// nothing behind. Splitting a pane and closing it, switching plugins and opening and closing the side panel, each many times
// over, keep the page's nodes and listeners where they were, and its own arrays do not grow with the count (a
// closed pane's way back used to stay in the workspace's history map, one entry per pane ever opened).

test("VUX-36: splitting and closing, switching plugins and the side panel, again and again, leave nothing behind", { timeout: 420_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, navigate, command, sessionId, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=todo` }, sessionId));
  await waitFor("document.querySelector('[data-assistant-composer]') && document.querySelector('button[data-plugin-id=todo].is-current')", 20_000);
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  /** The page's nodes and listeners (Chrome's own counters) and how many arrays its heap holds, after a collection. */
  const measure = async () => {
    for (let i = 0; i < 2; i++) { await command("HeapProfiler.collectGarbage", {}, sessionId); await pause(200); }
    const { nodes, jsEventListeners } = await command<{ nodes: number; jsEventListeners: number }>("Memory.getDOMCounters", {}, sessionId);
    const count = async (kind: string) => {
      const proto = await command<{ result: { objectId: string } }>("Runtime.evaluate", { expression: `${kind}.prototype` }, sessionId);
      const found = await command<{ objects: { objectId: string } }>("Runtime.queryObjects", { prototypeObjectId: proto.result.objectId }, sessionId);
      return (await command<{ result: { value: number } }>("Runtime.callFunctionOn", { objectId: found.objects.objectId, functionDeclaration: "function () { return this.length; }", returnByValue: true }, sessionId)).result.value;
    };
    return { nodes, listeners: jsEventListeners, arrays: await count("Array") };
  };
  const split = async () => {
    await evaluate("document.querySelector('.tab-pane.is-focused [data-tab-split], [data-titlebar-tabs] [data-tab-split]').click()");
    await waitFor("document.querySelector('[data-layout-split=right]')", 10_000);
    await evaluate("document.querySelector('[data-layout-split=right]').click()");
    await waitFor("document.querySelectorAll('.tab-pane').length >= 2", 10_000);
    await pause(250);
    await evaluate("[...document.querySelectorAll('.tab-pane-close')].filter((button) => button.getClientRects().length).pop().click()");
    await waitFor("document.querySelectorAll('.tab-pane').length < 2", 10_000);
    await pause(150);
  };
  const switchAround = async () => {
    for (const plugin of ["coding", "pages", "issues", "todo"]) {
      await evaluate(`document.querySelector('button[data-plugin-id=${plugin}]').click()`);
      await waitFor(`document.querySelector('button[data-plugin-id=${plugin}].is-current')`, 15_000);
      await pause(250);
    }
  };
  const side = async () => {
    await evaluate("document.querySelector('[data-side-toggle]').click()"); await waitFor("document.body.dataset.sideOpen === 'true'", 10_000); await pause(200);
    await evaluate("document.querySelector('[data-side-close]').click()"); await waitFor("document.body.dataset.sideOpen !== 'true'", 10_000); await pause(150);
  };
  const cases: Array<[string, () => Promise<void>, number]> = [["split and close", split, 60], ["switch four plugins", switchAround, 10], ["open and close the side panel", side, 30]];
  for (const [name, run, times] of cases) {
    // Twice first: the first runs build what is kept for good (compiled code, the panes' first frames).
    await run(); await run();
    const before = await measure();
    for (let i = 0; i < times; i++) await run();
    const after = await measure();
    // What is on screen when it is counted (a pane's frame, a tip) moves the node count by a hundred or so, whatever the count.
    assert.ok(after.nodes <= before.nodes + 200, `${name} ×${times}: nodes ${before.nodes} → ${after.nodes}`);
    assert.ok(after.listeners <= before.listeners + 10, `${name} ×${times}: listeners ${before.listeners} → ${after.listeners}`);
    // A fixed few appear once whatever the count (about 25 the first time plugins are switched around: 10 rounds and 30 give
    // the same). Before the fix, each split and close kept an array (and its object and strings) for good: 40 of them gave
    // 48 more, so 60 give about 70. Plain objects are not checked: caches the engine keeps for a while move their count by a hundred either way.
    assert.ok(after.arrays - before.arrays < 40, `${name} ×${times}: arrays ${before.arrays} → ${after.arrays}`);
  }
});

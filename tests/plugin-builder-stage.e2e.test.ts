import assert from "node:assert/strict";
import test from "node:test";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// The studio is content in its isolated Host stage (SYS-15): no nested workbench shell or page brand, and
// it ends above the bottom bar. A studio taller than its stage ran under the bar and hid the composer's model note at
// narrow widths.
for (const [width, height] of [[757, 1044], [1440, 900]] as const) test(`plugin studio ${width}px: the studio is drawn in its stage and ends above the bottom bar`, { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const { origin, projectId, command, sessionId, navigate } = browser;
  const { waitFor, evaluate } = await pluginFrameBrowser(t, browser, "plugin-builder");
  await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=plugin-builder` }, sessionId));
  await waitFor("Boolean(document.querySelector('[data-work-surface=plugin-builder] [data-agent-studio]')?.getClientRects().length)", 12_000);
  // Its client runs in the isolated stage: the models it can build with are listed in its own bar.
  await waitFor("document.querySelector('[data-work-surface=plugin-builder] [data-as-model]')?.options.length > 0 || !document.querySelector('[data-work-surface=plugin-builder] [data-as-model-setup]')?.hidden", 15_000);
  assert.equal(await evaluate("Boolean(document.querySelector('[data-work-surface=plugin-builder] iframe, [data-work-surface=plugin-builder] .as-brand'))"), false, "no nested frame and no page brand");
  assert.equal(await browser.evaluate("location.pathname"), `/projects/${projectId}/`);
  // The stage ends above the bar; a studio taller than it (the narrow layout) scrolls inside it, and the composer's model
  // note can be brought into view above the bar.
  const owner = await browser.evaluate<{ top: number; bottom: number; bar: number }>(`(() => {
    const frame = document.querySelector('iframe[data-plugin-frame="plugin-builder"]').getBoundingClientRect();
    return { top: frame.top, bottom: frame.bottom, bar: document.querySelector('.workbench-bar').getBoundingClientRect().top };
  })()`);
  const box = await evaluate<{ stage: number; bar: number; note: number; noteHeight: number }>(`(() => {
    const stage = document.querySelector('[data-work-surface=plugin-builder]');
    const note = stage.querySelector('[data-as-model-note]');
    note.scrollIntoView({ block: 'end' });
    const rect = note.getBoundingClientRect();
    return { stage: stage.getBoundingClientRect().bottom, bar: ${owner.bar - owner.top}, note: rect.bottom, noteHeight: rect.height };
  })()`);
  assert.ok(owner.bottom <= owner.bar + 0.5, `the Host frame ends above the bottom bar: ${JSON.stringify(owner)}`);
  assert.ok(box.stage <= box.bar + 0.5, `the stage ends above the bottom bar: ${JSON.stringify(box)}`);
  assert.ok(box.note <= box.bar + 0.5, `the composer's model note shows above the bottom bar: ${JSON.stringify(box)}`);
});

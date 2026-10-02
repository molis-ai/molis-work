import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// The studio is framed in its stage, and the stage ends above the bottom bar. A frame taller than its stage ran under the
// bar and hid the composer's model note at narrow widths.
for (const [width, height] of [[757, 1044], [1440, 900]] as const) test(`plugin studio ${width}px: the framed studio ends above the bottom bar`, { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const { origin, projectId, command, sessionId, navigate, waitFor, evaluate } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=plugin-builder` }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'plugin-builder' && Boolean(document.querySelector('.pb-studio-frame')?.getClientRects().length)", 12_000);
  const box = await evaluate<{ frame: number; stage: number; bar: number }>(`(() => {
    const frame = document.querySelector('.pb-studio-frame');
    return { frame: frame.getBoundingClientRect().bottom, stage: frame.closest('[data-work-surface]').getBoundingClientRect().bottom,
      bar: document.querySelector('.workbench-bar').getBoundingClientRect().top };
  })()`);
  assert.ok(box.frame <= box.stage + 0.5, `the frame ends inside its stage: ${JSON.stringify(box)}`);
  assert.ok(box.frame <= box.bar + 0.5, `the frame ends above the bottom bar: ${JSON.stringify(box)}`);
});

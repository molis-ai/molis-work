import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// A completion card arrives a moment after its action (it first reads where the object went), often after the stage has
// shown the record's toolbar. On a phone the 灵光 text field fills the stage under that toolbar: the card may cover the
// field, but its buttons must never sit on one of the stage's buttons (they used to cover 「转为待办」).
for (const width of [1440, 390]) test(`placement card ${width}px: a card that arrives after the toolbar keeps its buttons off the stage's buttons`, { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null); if (!browser) return;
  const { origin, projectId, command, sessionId, navigate, evaluate, waitFor, click, surfaceReady } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-work-surface=lingguang]')");
  const visible = (selector: string) => `(() => { const node = document.querySelector(${JSON.stringify(selector)}); return Boolean(node && node.getClientRects().length); })()`;
  await click(await evaluate(visible("[data-bar-resident=lingguang]")) ? "[data-bar-resident=lingguang]" : "[data-plugin-picker-popover] [data-plugin-id=lingguang]");
  await waitFor("document.body.dataset.desktopSurface === 'lingguang'");
  await surfaceReady("lingguang");
  await evaluate(`document.querySelector("[data-lingguang-capture]").click()`);
  await waitFor(`${visible("[data-lingguang-todo]")} && Boolean(document.querySelector('.placement-toast'))`, 10_000);
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const covered = await evaluate<string[]>(`(() => {
    const region = document.querySelector('.placement-toasts'), found = [];
    for (const button of region.querySelectorAll('button')) {
      const rect = button.getBoundingClientRect(); if (!rect.width) continue;
      for (const [x, y] of [[rect.left + 2, rect.top + 2], [rect.right - 2, rect.top + 2], [rect.left + 2, rect.bottom - 2], [rect.right - 2, rect.bottom - 2]]) {
        const under = document.elementsFromPoint(x, y).find(element => !region.contains(element));
        const control = under?.closest('button, a[href], select, [role=button]');
        if (control) found.push(button.textContent.trim() + ' over ' + (control.textContent.trim() || control.getAttribute('aria-label') || control.tagName));
      }
    }
    return [...new Set(found)];
  })()`);
  assert.deepEqual(covered, [], "the card's buttons cover none of the stage's buttons");
});

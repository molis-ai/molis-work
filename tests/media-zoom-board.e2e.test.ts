import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience VUX-32, VUX-39: the component board's media zoom is the shipped helper on the shipped page,
// and its own control says what it does next, as a preview's would.
test("VUX-32 VUX-39 the board's media zoom specimen fits, zooms about the pointer and goes back to fit from its control", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, navigate, waitFor, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog#foundation` }, sessionId));
  await waitFor("document.querySelector('[data-catalog-media].mw-media-zoom')?.dataset.zoom === 'fit'");
  await evaluate("document.querySelector('[data-catalog-media]').scrollIntoView({ block: 'center' })");
  const read = () => evaluate<{ state: string; scale: number; button: string; box: { x: number; y: number } }>(`(() => { const v = document.querySelector('[data-catalog-media]'), r = v.getBoundingClientRect();
    const m = new DOMMatrix(getComputedStyle(v.querySelector('img')).transform);
    return { state: v.dataset.zoom, scale: m.a, x: m.e, y: m.f, button: document.querySelector('[data-catalog-media-zoom]').textContent, box: { x: r.left, y: r.top } }; })()`);
  const fitted = await read();
  assert.equal(fitted.button, "原始尺寸");
  assert.ok(fitted.scale > 0 && fitted.scale < 1, "a picture larger than its box fits it");
  await command("Input.dispatchMouseEvent", { type: "mouseWheel", x: fitted.box.x + 60, y: fitted.box.y + 60, deltaX: 0, deltaY: -80, modifiers: 2 }, sessionId);
  const zoomed = await read();
  assert.deepEqual([zoomed.state, zoomed.button], ["zoomed", "适应窗口"], "a pinch zooms, and the control now fits it again");
  assert.ok(zoomed.scale > fitted.scale);
  await evaluate("document.querySelector('[data-catalog-media-zoom]').click()");
  await waitFor("document.querySelector('[data-catalog-media]').dataset.zoom === 'fit'");
  assert.equal((await read()).button, "原始尺寸");
});

import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

/**
 * Lightweight deterministic-surface & side-files readiness regression (W4-12 / VUX-TOAST-01).
 * The full 11-surface x 3-width x 2-scheme screenshot & computed-style capture runner used by
 * `pnpm visual:compare` lives in `scripts/visual-capture.mts` so CI full-suite does not spend ~9 minutes
 * generating unconsumed screenshots.
 */

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

const visible = (selector: string) => `Boolean([...document.querySelectorAll(${JSON.stringify(selector)})].some(node => node.getClientRects().length && !node.closest('[hidden]')))`;
const sideFilesReady = `${visible("[data-side-panel]")} && [...document.querySelectorAll('[data-side-files-list][aria-busy=false] [data-side-file]')].some(row => row.querySelector('span')?.textContent === '试用示例.pdf' && row.getClientRects().length && !row.closest('[hidden]'))`;

const CLOCK = `(() => { const Real = Date, offset = Real.UTC(2026, 9, 15, 6) - Real.now();
  class Pinned extends Real { constructor(...args) { if (args.length) super(...args); else super(Real.now() + offset); } static now() { return Real.now() + offset; } }
  window.Date = Pinned; })();`;

const MASK = `time, [data-relative-time], [datetime] { visibility: hidden !important; }
*, *::before, *::after { caret-color: transparent !important; }`;

async function stablePicture(browser: Browser, label: string): Promise<Buffer> {
  const { command, evaluate, sessionId } = browser;
  let previous = "";
  for (let attempt = 0; attempt < 12; attempt++) {
    await evaluate(`document.fonts.ready.then(() => Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))))
      .then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))`);
    const { data } = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    if (data === previous) return Buffer.from(data, "base64");
    previous = data;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.fail(`${label} kept changing: twelve pictures in a row, no two the same`);
}

test("VUX-TOAST-01 & QEA-144: side-files readiness rejects loading/missing material and the home surface settles deterministically", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null); if (!browser) return;
  const { evaluate, waitFor, navigate, command, origin, projectId, sessionId } = browser;
  await command("Emulation.setTimezoneOverride", { timezoneId: "Asia/Shanghai" }, sessionId);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: CLOCK }, sessionId);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.dataset.visualMask = ''; style.textContent = ${JSON.stringify(MASK)}; document.head.append(style); });` }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor(visible(".workbench-bar"), 30_000);

  // QEA-144: the settled home surface renders identically across two consecutive captures in light and dark.
  for (const scheme of ["light", "dark"] as const) {
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
    const png = await stablePicture(browser, `home@1440-${scheme}`);
    assert.ok(png.length > 1000, `home@1440-${scheme} captured a real PNG`);
  }

  // VUX-TOAST-01: side-files readiness rejects loading and missing seeded material.
  await evaluate(`(() => {
    const original = window.fetch;
    let release;
    const held = new Promise(resolve => { release = resolve; });
    window.releaseVisualFiles = () => release();
    window.restoreVisualFilesFetch = () => { window.fetch = original; release(); };
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (new URL(String(args[0]), location.href).pathname.endsWith('/api/side/files/sources')) {
        window.visualFilesHeld = true; await held;
      }
      return response;
    };
  })()`);
  try {
    await evaluate("document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'files', focus: true } }))");
    await waitFor("window.visualFilesHeld === true");
    assert.equal(await evaluate(visible("[data-side-panel]")), true, "the old readiness condition already accepts the visible panel");
    assert.equal(await evaluate("document.querySelector('[data-side-files-list]').getAttribute('aria-busy')"), "true");
    assert.equal(await evaluate(sideFilesReady), false, "a visible loading list is not ready for capture");
    await evaluate("window.releaseVisualFiles()");
    await waitFor(sideFilesReady, 15_000);
    assert.match(await evaluate<string>("document.querySelector('[data-side-files-list]').innerText"), /试用示例\.pdf/);
    await evaluate("window.visualFileRow = [...document.querySelectorAll('[data-side-files-list] [data-side-file]')].find(row => row.querySelector('span')?.textContent === '试用示例.pdf'); window.visualFileRow.remove()");
    assert.equal(await evaluate("document.querySelector('[data-side-files-list]').getAttribute('aria-busy')"), "false");
    assert.equal(await evaluate(sideFilesReady), false, "a finished list without the seeded material is not a successful capture");
    await evaluate("document.querySelector('[data-side-files-list] .side-files-group').append(window.visualFileRow)");
    assert.equal(await evaluate(sideFilesReady), true, "the real completed material list is ready");
  } finally {
    await evaluate("window.restoreVisualFilesFetch()");
  }
});

import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

/**
 * The key surfaces at three widths in light and dark, the pictures `scripts/visual-compare.mjs` takes on main and on a
 * branch and diffs pixel by pixel (W4-12). Here each picture must also come out the same twice in a row once the surface
 * has settled: a surface that keeps repainting on its own (a clock, a poll that redraws, a running animation) cannot be
 * compared at all, and that is a fault of the surface, not of the comparison.
 *
 * Pictures go to MOLIS_WORK_VISUAL_OUT when it is set (the comparison script sets it), else to the ignored review folder.
 * What may differ between two runs of the same tree is pinned or masked here, by name: the page's clock starts at
 * 2026-10-15 14:00 in Shanghai on every run (and runs on from there, so timers still work), shown times are hidden, and
 * so is the text caret. What the Host computes from its own clock is not pinned; base and branch are captured minutes apart.
 */

const WIDTHS = [
  { width: 1440, height: 900, mobile: false },
  { width: 1024, height: 768, mobile: false },
  { width: 390, height: 844, mobile: true },
] as const;
const SCHEMES = ["light", "dark"] as const;

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
interface Surface { id: string; open(browser: Browser): Promise<void>; ready: string }

const visible = (selector: string) => `Boolean([...document.querySelectorAll(${JSON.stringify(selector)})].some(node => node.getClientRects().length && !node.closest('[hidden]')))`;
const plugin = (id: string): Surface => ({
  id,
  open: async ({ click, surfaceReady }) => { await click(`[data-plugin-strip] [data-plugin-id=${id}]`); await surfaceReady(id, 15_000); },
  ready: `document.body.dataset.desktopSurface === ${JSON.stringify(id)}`,
});

const SURFACES: Surface[] = [
  { id: "home", open: async () => {}, ready: visible(".workbench-bar") },
  { id: "plugin-picker", open: async ({ click }) => { await click("[data-plugin-picker-toggle]"); }, ready: visible("[data-plugin-picker-popover]") },
  { id: "goals-list", open: async ({ showGoalStageList }) => { await showGoalStageList(); }, ready: visible("[data-goal-stage-chrome]") },
  plugin("todo"),
  plugin("pages"),
  {
    id: "assistant",
    open: async ({ evaluate }) => { await evaluate("document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: {} }))"); },
    ready: visible("[data-assistant-panel]"),
  },
  {
    id: "side-files",
    open: async ({ evaluate }) => { await evaluate("document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'files', focus: true } }))"); },
    ready: visible("[data-side-panel]"),
  },
  {
    id: "settings-appearance",
    open: async ({ click }) => {
      await click("[data-personal-menu] [data-directory-open=settings]");
      await click("[data-directory-panel=settings] [data-settings-section=appearance]");
    },
    ready: `${visible("[data-work-surface=settings] [data-settings-panel=appearance]")} && !document.querySelector('[data-settings-loading]')`,
  },
];

const CLOCK = `(() => { const Real = Date, offset = Real.UTC(2026, 9, 15, 6) - Real.now();
  class Pinned extends Real { constructor(...args) { if (args.length) super(...args); else super(Real.now() + offset); } static now() { return Real.now() + offset; } }
  window.Date = Pinned; })();`;

/** Hidden, not removed, so the layout stays as it is: times shown on the page, and the blinking caret. */
const MASK = `time, [data-relative-time], [datetime] { visibility: hidden !important; }
*, *::before, *::after { caret-color: transparent !important; }`;

/** Fonts in, finite animations done, two frames laid out; then the same picture twice in a row. */
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

test("key surfaces settle to the same picture at every width, light and dark (W4-12)", { timeout: 600_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null); if (!browser) return;
  const { origin, projectId, command, sessionId, navigate, waitFor, evaluate } = browser;
  const out = process.env.MOLIS_WORK_VISUAL_OUT || join(REVIEW_EVIDENCE, "visual", "latest");
  await mkdir(out, { recursive: true });
  await command("Emulation.setTimezoneOverride", { timezoneId: "Asia/Shanghai" }, sessionId);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: CLOCK }, sessionId);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.dataset.visualMask = ''; style.textContent = ${JSON.stringify(MASK)}; document.head.append(style); });` }, sessionId);
  const pictures: string[] = [];
  for (const surface of SURFACES) {
    for (const size of WIDTHS) {
      await command("Emulation.setDeviceMetricsOverride", { ...size, deviceScaleFactor: 1 }, sessionId);
      await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
      await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
      await waitFor(visible(".workbench-bar"), 30_000);
      await surface.open(browser);
      await waitFor(surface.ready, 15_000);
      await evaluate("document.activeElement instanceof HTMLElement && document.activeElement.matches('input, textarea, [contenteditable]') ? document.activeElement.blur() : null");
      for (const scheme of SCHEMES) {
        await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
        const name = `${surface.id}@${size.width}-${scheme}`;
        await writeFile(join(out, `${name}.png`), await stablePicture(browser, name));
        pictures.push(name);
      }
    }
  }
  await writeFile(join(out, "manifest.json"), JSON.stringify({ pictures, widths: WIDTHS, schemes: SCHEMES }, null, 2) + "\n");
  assert.equal(pictures.length, SURFACES.length * WIDTHS.length * SCHEMES.length);
});

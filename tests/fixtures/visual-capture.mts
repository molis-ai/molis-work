import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openGoalBrowser } from "./goal-browser.js";
import { REVIEW_EVIDENCE } from "./review-evidence.js";

/**
 * Full visual-comparison capture runner invoked by `scripts/visual-compare.mjs` (W4-12 / W5-05):
 * captures all key surfaces at 1440, 1024 and 390 wide in light and dark plus computed-style snapshots at 1440.
 * Kept under `tests/fixtures/` (not `tests/*.test.ts`) so CI `full-suite` does not spend ~9 minutes generating
 * unconsumed screenshots on every run; deterministic picture settlement and readiness checks remain in
 * `tests/visual-surfaces.e2e.test.ts`.
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
const coreWorkVisible = `document.body.dataset.desktopSurface === 'goals' && ${visible('[data-goal-node-workspace][data-expanded-goal="CORE"]')}`;
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
    ready: `${visible("[data-side-panel]")} && [...document.querySelectorAll('[data-side-files-list][aria-busy=false] [data-side-file]')].some(row => row.querySelector('span')?.textContent === '试用示例.pdf' && row.getClientRects().length && !row.closest('[hidden]'))`,
  },
  {
    id: "settings-appearance",
    open: async ({ click }) => {
      await click("[data-personal-menu] [data-directory-open=settings]");
      await click("[data-directory-panel=settings] [data-settings-section=appearance]");
    },
    ready: `${visible("[data-work-surface=settings] [data-settings-panel=appearance]")} && !document.querySelector('[data-settings-loading]')`,
  },
  {
    id: "project-settings-general",
    open: async ({ click, evaluate }) => {
      await evaluate("document.querySelector('[data-directory-open=project-settings]').click()");
      await click("[data-directory-panel=project-settings] [data-settings-section=general]");
    },
    ready: `${visible("[data-work-surface=project-settings] [data-settings-panel=general]")} && !document.querySelector('[data-settings-loading]')`,
  },
  {
    id: "goal-frame",
    open: async ({ click, waitFor, openGoalFrame }) => {
      await click('[data-plugin-strip] [data-plugin-id="goals"]');
      await waitFor("document.querySelector('[data-goal-momentum]')?.dataset.loaded === 'true'", 15_000);
      await openGoalFrame('.tree-node[data-select-goal="CORE"]');
    },
    ready: `Boolean(document.querySelector('.tab-item[aria-current][data-plugin=goals][data-tab-kind=item][data-item-id=CORE]')) && ${visible("[data-frame-goal-work]")}`,
  },
  {
    id: "goal-work",
    open: async ({ click, evaluate, openGoalFrame, openGoalWork }) => {
      if (await evaluate(coreWorkVisible)) return;
      if (await evaluate("document.body.dataset.desktopSurface !== 'goals'")) {
        await click('[data-plugin-strip] [data-plugin-id="goals"]');
      }
      await openGoalFrame('.tree-node[data-select-goal="CORE"]');
      await openGoalWork();
    },
    ready: coreWorkVisible,
  },
];

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

const STYLE_WIDTH = 1440;
const STYLES_BEGIN = `(() => {
  const running = document.getAnimations().filter(animation => animation.effect?.getTiming().iterations === Infinity)
    .map(animation => ({ animation, time: animation.currentTime, playing: animation.playState === "running" }));
  for (const { animation } of running) { animation.pause(); animation.currentTime = 0; }
  const skip = new Set(["caret-color"]);
  const props = [], index = new Map(), vectors = [], keys = new Map(), elements = [];
  const values = style => {
    const out = new Map();
    for (let i = 0; i < style.length; i++) { const name = style.item(i); if (!skip.has(name)) out.set(name, style.getPropertyValue(name)); }
    return out;
  };
  const vector = (own, parent) => {
    const delta = [];
    for (const [name, value] of own) {
      if (parent && parent.get(name) === value) continue;
      if (!index.has(name)) { index.set(name, props.length); props.push(name); }
      delta.push(index.get(name), value);
    }
    const key = JSON.stringify(delta);
    if (!keys.has(key)) { keys.set(key, vectors.length); vectors.push(delta); }
    return keys.get(key);
  };
  const label = node => node.localName + (node.id ? "#" + node.id : "") + [...node.classList].slice(0, 3).map(name => "." + name).join("")
    + ([...node.attributes].filter(attribute => attribute.name.startsWith("data-")).slice(0, 1).map(attribute => "[" + attribute.name + "]").join(""));
  const pending = [[document.documentElement, "0", null]];
  window.__visualStyles = budget => {
    const until = performance.now() + budget;
    while (pending.length && performance.now() < until) {
      const [node, path, parent] = pending.pop();
      if (node.localName === "head" || node.localName === "script" || node.localName === "style") continue;
      const own = values(getComputedStyle(node));
      elements.push([path, label(node), vector(own, parent)]);
      for (const pseudo of ["::before", "::after"]) {
        const style = getComputedStyle(node, pseudo);
        if (style.content && style.content !== "none" && style.content !== "normal") elements.push([path + pseudo, label(node) + pseudo, vector(values(style), own)]);
      }
      for (let i = node.children.length - 1; i >= 0; i--) pending.push([node.children[i], path + "/" + i, own]);
    }
    if (pending.length) return null;
    delete window.__visualStyles;
    for (const { animation, time, playing } of running) { animation.currentTime = time; if (playing) animation.play(); }
    return { props, vectors, elements };
  };
  return true;
})()`;
const STYLES_STEP = "window.__visualStyles(1000)";

test("visual-compare capture: key surfaces settle to the same picture at every width, light and dark", { timeout: 1_200_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null); if (!browser) return;
  const { origin, projectId, command, sessionId, navigate, waitFor, evaluate } = browser;
  const out = process.env.MOLIS_WORK_VISUAL_OUT || join(REVIEW_EVIDENCE, "visual", "latest");
  await mkdir(out, { recursive: true });
  await command("Emulation.setTimezoneOverride", { timezoneId: "Asia/Shanghai" }, sessionId);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: CLOCK }, sessionId);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.dataset.visualMask = ''; style.textContent = ${JSON.stringify(MASK)}; document.head.append(style); });` }, sessionId);
  const pictures: string[] = [], styles: string[] = [];
  for (const surface of SURFACES) await t.test(surface.id, { timeout: 180_000 }, async () => {
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
      if (size.width !== STYLE_WIDTH) continue;
      for (const scheme of SCHEMES) {
        await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
        const name = `${surface.id}@${size.width}-${scheme}`;
        await stablePicture(browser, name);
        await evaluate(STYLES_BEGIN);
        let snapshot: { elements: unknown[] } | null = null;
        while (!snapshot) snapshot = await evaluate<{ elements: unknown[] } | null>(STYLES_STEP);
        assert.ok(snapshot.elements.length > 50, `${name}: the page has its elements`);
        await writeFile(join(out, `${name}.styles.json`), JSON.stringify(snapshot));
        styles.push(name);
      }
    }
  });
  await writeFile(join(out, "manifest.json"), JSON.stringify({ pictures, styles, widths: WIDTHS, schemes: SCHEMES }, null, 2) + "\n");
  assert.equal(pictures.length, SURFACES.length * WIDTHS.length * SCHEMES.length);
  assert.equal(styles.length, SURFACES.length * SCHEMES.length);
});

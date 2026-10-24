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
  // W5-05: what the old skin layers still style beyond the surfaces above — a Goal's Frame and its work, and the
  // project settings — so deleting a layer is compared where it lands.
  {
    id: "project-settings-general",
    // The project's settings opener sits in a menu; the picture is of the panel, so it is opened directly.
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
    open: async ({ click, waitFor, openGoalFrame, openGoalWork }) => {
      await click('[data-plugin-strip] [data-plugin-id="goals"]');
      await waitFor("document.querySelector('[data-goal-momentum]')?.dataset.loaded === 'true'", 15_000);
      await openGoalFrame('.tree-node[data-select-goal="CORE"]');
      await openGoalWork();
    },
    ready: visible("[data-goal-node-workspace]"),
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

/**
 * Every element's computed style (and its ::before and ::after when they draw), for the comparison's style mode (W5-05):
 * a rule can change what a surface would look like in a state the picture does not show, or by less than a pixel.
 * Taken once per surface and scheme at STYLE_WIDTH, after both of its pictures. Endless animations are read at their start (and
 * put back after), so a running one reads the same on every run; the caret is masked like in the pictures. Identical style vectors are stored
 * once. An element is named by its child indices from <html> (the DOM is the same on both trees when only CSS changes)
 * and labelled for people by tag, id, classes and its first data- attribute.
 *
 * The page has thousands of elements (every plugin's hidden surface among them), and reading all their values takes
 * seconds on a fast Mac and longer on a CI runner. So the walk is begun once (STYLES_BEGIN) and then resumed in slices of
 * about a second (STYLES_STEP) until it hands back the snapshot: no single CDP call grows with the machine's speed.
 */
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
  // Only what differs from the parent's (or, for a pseudo-element, its element's) computed values; the comparison rebuilds the rest.
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
  // Depth first, children in document order, as a recursive walk would go.
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

test("VUX-TOAST-01: side-files readiness rejects loading and missing seeded material", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null); if (!browser) return;
  const surface = SURFACES.find(item => item.id === "side-files"); assert.ok(surface);
  const { evaluate, waitFor, navigate, command, origin, projectId, sessionId } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor(visible(".workbench-bar"), 30_000);
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
    await surface.open(browser);
    await waitFor("window.visualFilesHeld === true");
    assert.equal(await evaluate(visible("[data-side-panel]")), true, "the old readiness condition already accepts the visible panel");
    assert.equal(await evaluate("document.querySelector('[data-side-files-list]').getAttribute('aria-busy')"), "true");
    assert.equal(await evaluate(surface.ready), false, "a visible loading list is not ready for capture");
    await evaluate("window.releaseVisualFiles()");
    await waitFor(surface.ready, 15_000);
    assert.match(await evaluate<string>("document.querySelector('[data-side-files-list]').innerText"), /试用示例\.pdf/);
    await evaluate("window.visualFileRow = [...document.querySelectorAll('[data-side-files-list] [data-side-file]')].find(row => row.querySelector('span')?.textContent === '试用示例.pdf'); window.visualFileRow.remove()");
    assert.equal(await evaluate("document.querySelector('[data-side-files-list]').getAttribute('aria-busy')"), "false");
    assert.equal(await evaluate(surface.ready), false, "a finished list without the seeded material is not a successful capture");
    await evaluate("document.querySelector('[data-side-files-list] .side-files-group').append(window.visualFileRow)");
    assert.equal(await evaluate(surface.ready), true, "the real completed material list is ready");
  } finally {
    await evaluate("window.restoreVisualFilesFetch()");
  }
});

test("key surfaces settle to the same picture at every width, light and dark (W4-12)", { timeout: 1_200_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null); if (!browser) return;
  const { origin, projectId, command, sessionId, navigate, waitFor, evaluate } = browser;
  const out = process.env.MOLIS_WORK_VISUAL_OUT || join(REVIEW_EVIDENCE, "visual", "latest");
  await mkdir(out, { recursive: true });
  await command("Emulation.setTimezoneOverride", { timezoneId: "Asia/Shanghai" }, sessionId);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: CLOCK }, sessionId);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.dataset.visualMask = ''; style.textContent = ${JSON.stringify(MASK)}; document.head.append(style); });` }, sessionId);
  const pictures: string[] = [], styles: string[] = [];
  // A subtest per surface, each with its own limit: a slow runner fails the surface it was on, by name, not the whole run.
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
      // After both pictures, so reading the styles never touches a picture still to be taken.
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

import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

// 07-S1 (specs/product-flow-governance PFG-22, PFG-24; §4.6.2 口径 1, 4): the right side is one pane of the project's tab
// workspace. Its tabs are glyphs at the right end of the title bar, there whether the side is open or collapsed; ⌘\ / Ctrl+\
// collapses and opens it; a closed side tab comes back with the workspace's undo; opening a view already there recalls it;
// its views stay loaded while another shows; and open, tabs, current tab and width are kept with the project.

const SHELF = "plugin:shelf/side";
const strip = "[data-side-tabs]";
const current = `document.querySelector('${strip} [role=tab][aria-selected=true]')?.dataset.sideTab`;
const stored = "JSON.parse(localStorage.getItem('molis-work-tab-workspace:' + document.body.dataset.projectId) || 'null')";

test("PFG-22 PFG-24 the side's tabs live in the title bar, collapse with ⌘\\, close and come back, recall an open view and keep their views loaded", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor(`document.querySelector('.immersive-titlebar ${strip} [data-side-tab="${SHELF}"]') && document.body.dataset.sideOpen === 'false'`, 15_000);
  const mac = await evaluate<boolean>("/Mac|iP/.test(navigator.platform)");
  const chord = async (key: string, code: string, extra = 0) => {
    const modifiers = (mac ? 4 : 2) | extra;
    await command("Input.dispatchKeyEvent", { type: "keyDown", key, code, modifiers }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers }, sessionId);
  };

  // Collapsed, the glyphs stay at the right end of the title bar; the title bar has no background-tasks button of its own,
  // and the strip has no "+".
  const shown = await evaluate<string[]>(`[...document.querySelectorAll('${strip} [role=tab]')].filter(tab => tab.checkVisibility()).map(tab => tab.dataset.sideTab)`);
  assert.ok(shown.includes(SHELF) && shown.includes("tasks"), JSON.stringify(shown));
  assert.equal(await evaluate("document.querySelector('[data-background-tasks]')"), null);
  assert.equal(await evaluate(`document.querySelector('${strip} [data-tab-add], ${strip} [aria-label*="新"]')`), null);
  const edge = await evaluate<number>(`innerWidth - [...document.querySelectorAll('${strip} [role=tab]')].filter(tab => tab.checkVisibility()).at(-1).getBoundingClientRect().right`);
  assert.ok(edge >= 0 && edge < 24, `the strip ends at the right of the title bar (${edge}px left)`);

  // Resting on a glyph writes its name before it; the glyph does not move.
  const glyph = `document.querySelector('${strip} [data-side-tab="browser"] svg').getBoundingClientRect().right`;
  const before = await evaluate<number>(glyph);
  const point = await evaluate<{ x: number; y: number }>(`(() => { const r = document.querySelector('${strip} [data-side-tab="browser"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await command("Input.dispatchMouseEvent", { type: "mouseMoved", ...point }, sessionId);
  await waitFor(`document.querySelector('${strip} [data-side-tab="browser"]').closest('.tab-item').classList.contains('is-grown') && document.querySelector('${strip} [data-side-tab="browser"] .tab-item-name').checkVisibility()`, 5_000);
  const after = await evaluate<number>(glyph);
  assert.ok(Math.abs(after - before) < 0.5, `the tab grows leftward; its glyph stays put (its right edge ${before} → ${after})`);
  await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 400, y: 400 }, sessionId);

  // A glyph opens the side on its tab.
  await click(`${strip} [data-side-tab="${SHELF}"]`);
  await waitFor(`document.body.dataset.sideOpen === 'true' && ${current} === ${JSON.stringify(SHELF)}`);
  await waitFor(`document.querySelector('[data-side-body="${SHELF}"] iframe')?.contentDocument?.readyState === 'complete'`, 15_000);
  await evaluate(`document.querySelector('[data-side-body="${SHELF}"] iframe').contentWindow.__kept = true`);
  // The tab on show is the current one while the side is open (aria-current on the tab, as on the main area's strip).
  assert.deepEqual(await evaluate<string[]>(`[...document.querySelectorAll('${strip} .tab-item[aria-current="page"] [data-side-tab]')].map(tab => tab.dataset.sideTab)`), [SHELF]);

  // Visit two more views, then switch around: the resident views are hidden, never loaded again.
  for (const tab of ["files", "browser"]) {
    await click(`${strip} [data-side-tab="${tab}"]`);
    await waitFor(`${current} === ${JSON.stringify(tab)} && !document.querySelector('[data-side-body="${tab}"]').hidden`);
  }
  const mark = await evaluate<number>("performance.getEntriesByType('resource').length");
  for (const tab of [SHELF, "files", "browser", SHELF]) {
    await click(`${strip} [data-side-tab="${tab}"]`);
    await waitFor(`${current} === ${JSON.stringify(tab)}`);
  }
  const requests = await evaluate<string[]>(`performance.getEntriesByType('resource').slice(${mark}).map(entry => entry.initiatorType + ' ' + new URL(entry.name).pathname).filter(line => !line.includes('/api/attention'))`);
  t.diagnostic(`requests while switching four times among views already open: ${requests.length} ${JSON.stringify(requests)}`);
  assert.equal(requests.filter(line => line.startsWith("iframe ")).length, 0, "no view is loaded again");
  assert.equal(await evaluate(`document.querySelector('[data-side-body="${SHELF}"] iframe').contentWindow.__kept`), true, "Shelf's document is the same one");

  // PFG-24: opening a view already on the right recalls its tab; no second copy.
  const count = await evaluate<number>(`${stored}.side.tabs.length`);
  await evaluate(`document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'files' }, cancelable: true }))`);
  await waitFor(`${current} === 'files'`);
  assert.equal(await evaluate(`${stored}.side.tabs.length`), count);
  assert.equal(await evaluate(`document.querySelectorAll('[data-side-body="files"]').length`), 1);

  // ⌘\ collapses; the glyphs stay where they were and the side keeps its tab; ⌘\ again opens it on that tab.
  await chord("\\", "Backslash");
  await waitFor("document.body.dataset.sideOpen === 'false'");
  assert.equal(await evaluate(`${stored}.side.open`), false);
  assert.equal(await evaluate(`document.querySelector('${strip} [data-side-tab="files"]').checkVisibility()`), true);
  assert.equal(await evaluate(`document.querySelector('${strip} .tab-item[aria-current]')`), null, "collapsed, no tab says it is on show");
  await chord("\\", "Backslash");
  await waitFor(`document.body.dataset.sideOpen === 'true' && ${current} === 'files'`);

  // Closing a side tab (Delete on it) is undone with ⌘⇧T, back where it was, and with the undo chip.
  const order = `[...document.querySelectorAll('${strip} [role=tab]')].filter(tab => tab.checkVisibility()).map(tab => tab.dataset.sideTab)`;
  const was = await evaluate<string[]>(order);
  await evaluate(`document.querySelector('${strip} [data-side-tab="browser"]').focus()`);
  await click(`${strip} [data-side-tab="browser"]`);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Delete", code: "Delete" }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Delete", code: "Delete" }, sessionId);
  await waitFor(`!${order}.includes('browser') && document.querySelector('[data-side-undo]')`);
  assert.equal(await evaluate(`${stored}.side.tabs.some(tab => tab.itemId === 'browser')`), false);
  await chord("T", "KeyT", 8);
  await waitFor(`${order}.includes('browser') && ${current} === 'browser'`);
  assert.deepEqual(await evaluate<string[]>(order), was, "back in its place");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Delete", code: "Delete" }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Delete", code: "Delete" }, sessionId);
  await waitFor(`!${order}.includes('browser')`);
  await click("[data-side-undo]");
  await waitFor(`${order}.includes('browser')`);

  // The width and the current tab are the project's: a reload comes back to them, open.
  const width = await evaluate<string>("getComputedStyle(document.body).getPropertyValue('--side-panel-width')");
  await navigate(() => command("Page.reload", { ignoreCache: true }, sessionId));
  await waitFor(`document.body.dataset.sideOpen === 'true' && ${current} === 'browser'`, 15_000);
  assert.equal(await evaluate<string>("getComputedStyle(document.body).getPropertyValue('--side-panel-width')"), width);

  // 口径 4: a layout saved in another shape (here, before the side joined it) is not read; the workspace starts again.
  await evaluate(`(() => { const saved = ${stored}; delete saved.side; localStorage.setItem('molis-work-tab-workspace:' + document.body.dataset.projectId, JSON.stringify(saved)); })()`);
  await navigate(() => command("Page.reload", { ignoreCache: true }, sessionId));
  await waitFor(`document.querySelector('${strip} [role=tab][aria-selected=true]') && document.body.dataset.sideOpen === 'false'`, 15_000);
  await waitFor(`${stored}?.side?.id === 'side'`);
  assert.equal(await evaluate(current), SHELF, "started again on the first tab");
});

// 口径 4 as corrected for 07-S1: only a layout of another shape starts again. A plugin taken out of the project keeps its tabs
// where they were, marked removed, with the others unmoved (design README, shared part 7); added back, it carries on. This
// replaces the old rule that a layout naming a plugin the project no longer offers started fresh (and Goals' special case).
test("PFG-22 a saved layout with a plugin taken out of the project keeps that plugin's tab in place, and it works again once added back", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId, web } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  const visit = (query = "") => navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/${query}` }, sessionId));
  const tabs = "[...document.querySelectorAll('.tab-item[data-tab-id]')].map(tab => tab.dataset.plugin + (tab.dataset.itemId ? ':' + tab.dataset.itemId : ''))";
  await visit("?openPlugin=todo");
  await waitFor("document.body.dataset.desktopSurface === 'todo'", 15_000);
  await visit("?openPlugin=pages");
  await waitFor("document.body.dataset.desktopSurface === 'pages' && document.querySelector('.tab-item[data-plugin=\"todo\"]')", 15_000);
  const before = await evaluate<string[]>(tabs);
  assert.ok(before.indexOf("todo") >= 0 && before.indexOf("todo") < before.indexOf("pages"), JSON.stringify(before));

  await web.delete(`/api/settings/projects/${projectId}/plugins`, { plugin_id: "todo" });
  await visit();
  await waitFor("document.querySelector('.tab-item[data-plugin=\"todo\"][data-tab-removed]')", 15_000);
  assert.deepEqual(await evaluate<string[]>(tabs), before, "the tab stays and nothing else moves");
  assert.match(await evaluate<string>("document.querySelector('.tab-item[data-plugin=\"todo\"]').title"), /已移除/u);
  assert.equal(await evaluate<string>("document.querySelector('[data-plugin-group=\"todo\"][data-group-state=\"removed\"] .tab-group-tag')?.textContent ?? ''"), "已移除", "its group says it was removed");
  await click(".tab-item[data-plugin=\"todo\"] .tab-item-trigger");
  await waitFor("document.querySelector('[data-tab-removed-stage=\"todo\"]')?.checkVisibility()");
  assert.match(await evaluate<string>("document.querySelector('[data-tab-removed-stage]').textContent"), /加回这个项目/u);

  await web.post(`/api/settings/projects/${projectId}/plugins`, { plugin_id: "todo" });
  await visit();
  await waitFor("document.querySelector('.tab-item[data-plugin=\"todo\"]') && !document.querySelector('.tab-item[data-tab-removed], [data-group-state=\"removed\"]')", 15_000);
  assert.deepEqual(await evaluate<string[]>(tabs), before, "added back, the same tabs in the same places");
  await click(".tab-item[data-plugin=\"todo\"] .tab-item-trigger");
  await waitFor("document.body.dataset.desktopSurface === 'todo' && !document.querySelector('[data-tab-removed-stage]')", 15_000);
});

// Review evidence (ignored folder unless MOLIS_WORK_REVIEW_EVIDENCE=1): the side collapsed and open on the background tasks,
// at three widths, in both languages and both themes.
test("PFG-22 review shots of the right side at 1440, 1024 and 390, Chinese and English, light and dark", { timeout: 240_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { waitFor, command, sessionId, navigate, origin, projectId } = browser;
  const evidence = reviewEvidenceUrl("07-s1-side-pane/"); await mkdir(evidence, { recursive: true });
  const shot = async (name: string) => writeFile(new URL(name + ".png", evidence), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  for (const lang of ["zh", "en"] as const) for (const theme of ["light", "dark"] as const) for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]] as const) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 760 }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=${lang}&next=${encodeURIComponent(`/projects/${projectId}/`)}` }, sessionId));
    await waitFor(`document.querySelector('${strip} [data-side-tab="tasks"]')`, 15_000);
    await waitFor("document.body.dataset.sideOpen === 'false' || (document.dispatchEvent(new CustomEvent('molis:side-close')), false)", 5_000);
    const name = `${lang}-${theme}-${width}`;
    await shot(name + "-collapsed");
    await waitFor("(document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'tasks' }, cancelable: true })), document.body.dataset.sideOpen === 'true')", 5_000);
    await waitFor("!document.querySelector('[data-side-body=\"tasks\"]').hidden");
    await new Promise(resolve => setTimeout(resolve, 450));
    await shot(name + "-tasks");
  }
});

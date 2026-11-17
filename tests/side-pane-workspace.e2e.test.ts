import { projectPluginRevision } from "@molis-ai/molis-work-test-kit/local-host-http";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";

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

  // Collapsed, no view of the side stands in the title bar (specs/screen-polish §3 方案 C): they are the list behind the side
  // sheet's own tab. The title bar has no background-tasks button of its own, and the list has no "+". The background tasks
  // are no side view: their mark is the line's dialog's (batch 32).
  assert.deepEqual(await evaluate<string[]>(`[...document.querySelectorAll('${strip} [role=tab]')].filter(tab => tab.checkVisibility()).map(tab => tab.dataset.sideTab)`), []);
  const shown = await evaluate<string[]>(`[...document.querySelectorAll('${strip} [role=tab]:not([hidden])')].map(tab => tab.dataset.sideTab)`);
  assert.ok(shown.includes(SHELF) && shown.includes("files") && !shown.includes("tasks"), JSON.stringify(shown));
  assert.equal(await evaluate("document.querySelector('[data-background-tasks]')"), null);
  assert.equal(await evaluate(`document.querySelector('${strip} [data-tab-add], ${strip} [aria-label*="新"]')`), null);
  // specs/screen-polish §3 方案 C (POLISH-05): the side's switch stands right before the one layout button (07-S2, 口径 6);
  // WLN-16: only the project follows it, ending the title bar.
  const [edge, layoutEdge, projectEdge] = await evaluate<[number, number, number]>(`(() => { const layout = document.querySelector('[data-layout-open]').getBoundingClientRect(), project = document.querySelector('.titlebar-end').getBoundingClientRect();
    return [layout.left - document.querySelector('[data-side-toggle]').getBoundingClientRect().right, project.left - layout.right, innerWidth - project.right]; })()`);
  assert.ok(edge >= 0 && edge < 24, `the side's switch stands right before the layout button (${edge}px between)`);
  assert.ok(layoutEdge >= 0 && layoutEdge < 24, `the project follows the layout button (${layoutEdge}px between)`);
  assert.ok(projectEdge >= 0 && projectEdge < 24, `the project ends the title bar (${projectEdge}px left)`);

  // A context tab (Pages' comments) leaves and comes back with its plugin, as the page the server renders after a picker
  // change says: the whole glyph tab goes and comes, never an empty item or a bare trigger.
  const context = await evaluate<string | null>(`document.querySelector('${strip} [data-side-context-owner]')?.dataset.sideTab ?? null`);
  assert.ok(context, "the project has a context tab on the right");
  const membership = (drop: boolean) => evaluate(`(async () => { window.__sideErrors ??= []; if (!window.__sideWatch) { window.__sideWatch = true; addEventListener('error', event => window.__sideErrors.push(String(event.message))); }
    const next = new DOMParser().parseFromString(await molisWorkRequest(location.pathname, { as: 'text', headers: { accept: 'text/html' } }), 'text/html');
    if (${drop}) next.querySelector('[data-side-tabs] [data-side-tab=${JSON.stringify(context)}]').closest('.tab-item').remove();
    document.dispatchEvent(new CustomEvent('molis-work:plugins-changed', { detail: { came: [], gone: [], next, failed: false } })); })()`);
  const items = `[...document.querySelector('${strip}').children].map(node => node.matches('.tab-item') && node.querySelectorAll(':scope > [role=tab]').length === 1 ? node.querySelector('[role=tab]').dataset.sideTab : 'stray ' + node.outerHTML.slice(0, 80))`;
  const placed = await evaluate<string[]>(items);
  await membership(true);
  await waitFor(`!document.querySelector('${strip} [data-side-tab=${JSON.stringify(context)}]')`);
  assert.ok(!(await evaluate<string[]>(items)).some(item => item.startsWith("stray")), JSON.stringify(await evaluate(items)));
  await membership(false);
  await waitFor(`document.querySelector('${strip} [data-side-tab=${JSON.stringify(context)}]')`);
  const back = await evaluate<string[]>(items);
  assert.deepEqual(back, placed, "back in its place, a whole glyph tab");
  assert.deepEqual(await evaluate("window.__sideErrors"), []);

  // The side's switch opens the side; its own tab names the view it shows, and the list behind that tab names every view.
  await click("[data-side-toggle]");
  await waitFor("document.body.dataset.sideOpen === 'true' && document.querySelector('[data-side-ear]').checkVisibility() && document.querySelector('[data-side-ear-name]').textContent.trim().length > 0");
  assert.equal(await evaluate(`document.querySelector('${strip}').checkVisibility()`), false, "the list waits behind the side's tab");
  await click("[data-side-ear]");
  await waitFor(`document.querySelector('${strip}').checkVisibility()`);
  const named = await evaluate<{ views: number; names: number }>(`(() => { const tabs = [...document.querySelectorAll('${strip} [role=tab]')].filter(tab => tab.checkVisibility());
    return { views: tabs.length, names: tabs.filter(tab => tab.querySelector('.tab-item-name')?.checkVisibility() && tab.querySelector('.tab-item-name').textContent.trim()).length }; })()`);
  assert.ok(named.views >= 6 && named.names === named.views, `every view in the list shows its name (${JSON.stringify(named)})`);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await waitFor(`!document.querySelector('${strip}').checkVisibility() && document.activeElement?.hasAttribute('data-side-ear')`);
  await click("[data-side-toggle]");
  await waitFor("document.body.dataset.sideOpen === 'false' && document.querySelector('[data-side-toggle]').getAttribute('aria-pressed') === 'false'");

  // Choosing a view in the list opens the side on it.
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

  // ⌘\ collapses: the side's own tab leaves the strip with its sheet, the switch stays and the side keeps its tab; ⌘\ again
  // opens it on that tab.
  await chord("\\", "Backslash");
  await waitFor("document.body.dataset.sideOpen === 'false'");
  assert.equal(await evaluate(`${stored}.side.open`), false);
  assert.deepEqual(await evaluate(`[document.querySelector('[data-side-ear]').checkVisibility(), document.querySelector('[data-side-toggle]').checkVisibility(), ${current}]`), [false, true, "files"]);
  assert.equal(await evaluate(`document.querySelector('${strip} .tab-item[aria-current]')`), null, "collapsed, no tab says it is on show");
  await chord("\\", "Backslash");
  await waitFor(`document.body.dataset.sideOpen === 'true' && ${current} === 'files'`);

  // Closing a side view (Delete on it in the list) is undone with ⌘⇧T, back where it was, and with the undo chip.
  const order = `[...document.querySelectorAll('${strip} [role=tab]:not([hidden]):not([data-side-closed])')].map(tab => tab.dataset.sideTab)`;
  const was = await evaluate<string[]>(order);
  await click(`${strip} [data-side-tab="browser"]`);
  await waitFor(`${current} === 'browser' && !document.querySelector('${strip}').checkVisibility()`);
  await click("[data-side-ear]");
  await waitFor(`document.querySelector('${strip}').checkVisibility() && document.activeElement?.dataset.sideTab === 'browser'`);
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
  assert.ok(projectId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  const visit = (query = "") => navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/${query}` }, sessionId));
  const tabs = "[...document.querySelectorAll('.tab-item[data-tab-id]')].map(tab => tab.dataset.plugin + (tab.dataset.itemId ? ':' + tab.dataset.itemId : ''))";
  await visit("?openPlugin=todo");
  await waitFor("document.body.dataset.desktopSurface === 'todo'", 15_000);
  await visit("?openPlugin=pages");
  await waitFor("document.body.dataset.desktopSurface === 'pages' && document.querySelector('.tab-item[data-plugin=\"todo\"]')", 15_000);
  const before = await evaluate<string[]>(tabs);
  assert.ok(before.indexOf("todo") >= 0 && before.indexOf("todo") < before.indexOf("pages"), JSON.stringify(before));

  await web.delete(`/api/settings/projects/${projectId}/plugins`, { plugin_id: "todo", expected_revision: await projectPluginRevision(web, projectId) });
  await visit();
  await waitFor("document.querySelector('.tab-item[data-plugin=\"todo\"][data-tab-removed]')", 15_000);
  assert.deepEqual(await evaluate<string[]>(tabs), before, "the tab stays and nothing else moves");
  assert.match(await evaluate<string>("document.querySelector('.tab-item[data-plugin=\"todo\"]').title"), /已移除/u);
  assert.equal(await evaluate<string>("document.querySelector('[data-plugin-group=\"todo\"][data-group-state=\"removed\"] .tab-group-tag')?.textContent ?? ''"), "已移除", "its group says it was removed");
  await click(".tab-item[data-plugin=\"todo\"] .tab-item-trigger");
  await waitFor("document.querySelector('[data-tab-removed-stage=\"todo\"]')?.checkVisibility()");
  assert.match(await evaluate<string>("document.querySelector('[data-tab-removed-stage]').textContent"), /加回这个项目/u);

  await web.post(`/api/settings/projects/${projectId}/plugins`, { plugin_id: "todo", expected_revision: await projectPluginRevision(web, projectId) });
  await visit();
  await waitFor("document.querySelector('.tab-item[data-plugin=\"todo\"]') && !document.querySelector('.tab-item[data-tab-removed], [data-group-state=\"removed\"]')", 15_000);
  assert.deepEqual(await evaluate<string[]>(tabs), before, "added back, the same tabs in the same places");
  await click(".tab-item[data-plugin=\"todo\"] .tab-item-trigger");
  await waitFor("document.body.dataset.desktopSurface === 'todo' && !document.querySelector('[data-tab-removed-stage]')", 15_000);
});

// Review evidence (ignored folder unless MOLIS_WORK_REVIEW_EVIDENCE=1): the side collapsed and open on one of its own views,
// at three widths, in both languages and both themes.
test("PFG-22 review shots of the right side at 1440, 1024 and 390, Chinese and English, light and dark", { timeout: 240_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { waitFor, command, sessionId, navigate, origin, projectId } = browser;
  const evidence = reviewEvidenceUrl("07-s1-side-pane/"); await mkdir(evidence, { recursive: true });
  const shot = async (name: string) => writeFile(new URL(name + ".png", evidence), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  for (const lang of ["zh", "en"] as const) for (const theme of ["light", "dark"] as const) for (const [width, height] of [[1440, 900], [1024, 768], [700, 900], [390, 844]] as const) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 760 }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=${lang}&next=${encodeURIComponent(`/projects/${projectId}/`)}` }, sessionId));
    await waitFor(`document.querySelector('${strip} [data-side-tab="files"]')`, 15_000);
    // The page collapses the side from the layout menu (收起右侧); the side has no close event of its own (07-1 S4b).
    await waitFor("document.body.dataset.sideOpen === 'false' || (document.querySelector('[data-layout-open]').click(), document.querySelector('[data-layout-action=side]').click(), false)", 5_000);
    const name = `${lang}-${theme}-${width}`;
    await shot(name + "-collapsed");
    await waitFor("(document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'computer' }, cancelable: true })), document.body.dataset.sideOpen === 'true')", 5_000);
    await waitFor("!document.querySelector('[data-side-body=\"computer\"]').hidden");
    await new Promise(resolve => setTimeout(resolve, 450));
    await shot(name + "-computer");
  }

  // The background tasks' count is the line's (work-line-event-tab shows it), not a side tab's.
});

// 07-S1 review B3, as specs/screen-polish §3 方案 C draws it (POLISH-07): at 760px and under the top strip is one row. With the
// side open, its view's name stands in that row, and the list behind it holds every view, inside the window and none scrolled
// out of sight; the side sheet starts below the row.
test("PFG-22 POLISH-07 at 760 and under the strip is one row: the side's views are one list inside the window, and its view's name stands in the row", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  const shown = `[...document.querySelectorAll('${strip} [role=tab]')].filter(tab => tab.checkVisibility())`;
  const outside = `(() => { const box = document.querySelector('${strip}').getBoundingClientRect(); return ${shown}.filter(tab => { const at = tab.getBoundingClientRect(); return at.left < Math.max(0, box.left) - 0.5 || at.right > Math.min(innerWidth, box.right) + 0.5; }).map(tab => tab.dataset.sideTab); })()`;
  const row = `(() => { const bar = document.querySelector('.immersive-titlebar'), at = bar.getBoundingClientRect();
    return { height: Math.round(at.height), below: [...bar.children].filter(child => { const box = child.getBoundingClientRect(); return child.checkVisibility() && !child.matches('${strip}') && box.width > 0 && box.height > 0 && box.top >= at.bottom - 0.5; }).map(child => child.className),
      wide: document.documentElement.scrollWidth > innerWidth }; })()`;
  for (const [width, height] of [[601, 900], [700, 900], [760, 900], [700, 420]]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
    await waitFor(`document.querySelector('${strip} [data-side-tab="files"]') && document.querySelector('[data-side-toggle]')?.checkVisibility()`, 15_000);
    assert.deepEqual(await evaluate(row), { height: 44, below: [], wide: false }, `${width}×${height}: the strip is one 44px row`);
    await waitFor("(document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'computer' }, cancelable: true })), document.body.dataset.sideOpen === 'true')", 5_000);
    await waitFor("document.querySelector('[data-side-ear]').checkVisibility() && document.querySelector('[data-side-ear-name]').textContent.trim().length > 0");
    assert.deepEqual(await evaluate(row), { height: 44, below: [], wide: false }, `${width}×${height}: still one row with the side open`);
    await click("[data-side-ear]");
    await waitFor(`document.querySelector('${strip}').checkVisibility()`);
    const tabs = await evaluate<string[]>(`${shown}.map(tab => tab.dataset.sideTab)`);
    assert.ok(tabs.includes("files") && tabs.length >= 6, `${width}×${height}: ${JSON.stringify(tabs)}`);
    assert.deepEqual(await evaluate<string[]>(outside), [], `${width}×${height}: every view is inside the list and the window`);
    assert.equal(await evaluate<boolean>(`(() => { const s = document.querySelector('${strip}'); return s.scrollWidth <= s.clientWidth + 1; })()`), true, `${width}×${height}: nothing scrolled out of sight sideways`);
    await click("[data-side-ear]");
    await waitFor(`!document.querySelector('${strip}').checkVisibility()`);
    const below = await evaluate<{ strip: number; panel: number }>(`(() => ({ strip: document.querySelector('.immersive-titlebar').getBoundingClientRect().bottom, panel: document.querySelector('.side-panel').getBoundingClientRect().top }))()`);
    assert.ok(below.panel >= below.strip - 0.5, `${width}×${height}: the side sheet starts below the strip (${JSON.stringify(below)})`);
  }
  // On a phone: one row and no second one, nothing wider than the window, and the side's switch inside it.
  for (const width of [390, 360, 320]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
    await waitFor(`document.querySelector('${strip} [data-side-tab="files"]') && document.querySelector('[data-side-toggle]')?.checkVisibility()`, 15_000);
    assert.deepEqual(await evaluate(row), { height: 44, below: [], wide: false }, `${width}: the strip is one 44px row`);
    const toggle = await evaluate<{ left: number; right: number }>("(() => { const at = document.querySelector('[data-side-toggle]').getBoundingClientRect(); return { left: at.left, right: at.right }; })()");
    assert.ok(toggle.left >= -0.5 && toggle.right <= width + 0.5, `${width}: the side's switch is inside the window (${JSON.stringify(toggle)})`);
  }
  // At 320 the first and the last view, opened by an event, each stand by name in the row, inside the window.
  await command("Emulation.setDeviceMetricsOverride", { width: 320, height: 720, deviceScaleFactor: 1, mobile: true }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor(`document.querySelector('${strip} [data-side-tab="files"]')`, 15_000);
  const ends = await evaluate<string[]>(`[...document.querySelectorAll('${strip} [role=tab]:not([hidden])')].map(tab => tab.dataset.sideTab)`);
  for (const tab of [ends[0], ends.at(-1)]) {
    await waitFor(`(document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: ${JSON.stringify(tab)} }, cancelable: true })), document.querySelector('${strip} [aria-selected=true]')?.dataset.sideTab === ${JSON.stringify(tab)})`, 5_000);
    await waitFor(`(() => { const ear = document.querySelector('[data-side-ear]'), at = ear.getBoundingClientRect(); return ear.checkVisibility() && at.left >= -0.5 && at.right <= innerWidth + 0.5
      && document.querySelector('[data-side-ear-name]').textContent.trim() === document.querySelector('${strip} [aria-selected=true] .tab-item-name').textContent.trim(); })()`, 3_000);
    assert.deepEqual(await evaluate(row), { height: 44, below: [], wide: false }, `320: one row with ${tab} open`);
  }
  // 07-1 S3: on a phone only one column shows, so the side opened by an event (the focus where it was, as the Assistant or ⌘\
  // opens it) is the one shown. Since specs/screen-polish §3 方案 C (POLISH-07) the top strip says so with the side's switch
  // pressed and the side view's name standing where the current tab was (主区 | 右侧 is gone).
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor(`document.querySelector('${strip} [data-side-tab="files"]') && document.querySelector('[data-side-toggle]')?.checkVisibility()`, 15_000);
  await waitFor("(document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'computer' }, cancelable: true })), document.body.dataset.sideOpen === 'true')", 5_000);
  await waitFor("document.querySelector('[data-side-toggle]')?.getAttribute('aria-pressed') === 'true' && document.querySelector('[data-side-ear]')?.checkVisibility() && !document.querySelector('[data-side-ear]').hasAttribute('data-unfocused') && !document.querySelector('[data-titlebar-tabs]').checkVisibility()", 5_000)
    .catch(async () => assert.fail(`390: the side opened by an event shows its switch pressed and its view's name (${await evaluate<string>("JSON.stringify({ pressed: document.querySelector('[data-side-toggle]')?.getAttribute('aria-pressed'), ear: document.querySelector('[data-side-ear]')?.checkVisibility(), unfocused: document.querySelector('[data-side-ear]')?.hasAttribute('data-unfocused') })")})`));
  // 07-1 S3: just after a group closes, a 360 or 320 phone row cannot hold the switch, a 98px current tab, the undo chip and
  // 全部标签 at once (English is the wider switch). The row scrolls rather than clips, as scheme A narrows the tabs to
  // 96px and then scrolls: the current tab is in view as the chip comes in and each part shows whole once scrolled to. Since
  // WLN-16 the tab row's own ＋ is folded and the top bar's ＋ (the start page) is the one way to open a plugin
  // (specs/work-line「顶条」, decided 2026-11-15): it stays whole in the window and takes the press.
  for (const width of [360, 320]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=en&next=${encodeURIComponent(`/projects/${projectId}/`)}` }, sessionId));
    await waitFor("typeof molisWorkOpenPlugin === 'function' && document.querySelector('[data-side-toggle]')?.checkVisibility()", 15_000);
    await evaluate("molisWorkOpenPlugin('todo')");
    await waitFor("document.querySelector('[data-titlebar-tabs] .tab-item[aria-current][data-plugin=todo]')", 15_000);
    await evaluate("molisWorkOpenPlugin('pages')");
    await waitFor("document.querySelector('[data-titlebar-tabs] .tab-item[aria-current][data-plugin=pages]')", 15_000);
    await click("[data-titlebar-tabs] .tab-item[aria-current][data-plugin=pages] [data-tab-close]");
    await waitFor("document.querySelector('[data-titlebar-tabs] [data-tab-undo]')?.checkVisibility() && document.querySelector('[data-titlebar-tabs] .tab-item[aria-current][data-plugin=todo]')", 5_000);
    const row = await evaluate<{ en: boolean; scrolls: boolean; current: { width: number; inView: boolean }; parts: string[]; plus: { inside: boolean; hit: boolean } }>(`(() => {
      const strip = document.querySelector('[data-titlebar-tabs]'), edge = () => strip.getBoundingClientRect();
      const inside = (el) => { const at = el.getBoundingClientRect(), box = edge(); return at.width > 0 && at.left >= box.left - 0.5 && at.right <= box.right + 0.5 && at.top >= box.top - 0.5 && at.bottom <= box.bottom + 0.5; };
      const tab = strip.querySelector('.tab-item[aria-current]'), current = { width: Math.round(tab.getBoundingClientRect().width), inView: inside(tab) };
      const overflowing = strip.scrollWidth > strip.clientWidth + 1, scrolls = !overflowing || getComputedStyle(strip).overflowX === 'auto';
      const parts = [...strip.children].filter((child) => child.getClientRects().length && getComputedStyle(child).display !== 'none').flatMap((child) => {
        child.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const own = child.scrollWidth <= child.clientWidth + 1 || child.classList.contains('tab-scroll');
        return inside(child) && own ? [] : [String(child.className).split(' ').pop() + ' ' + Math.round(child.getBoundingClientRect().left) + '→' + Math.round(child.getBoundingClientRect().right)];
      });
      const add = document.querySelector('[data-plugin-picker-toggle]'); add.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const box = add.getBoundingClientRect(), hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      const whole = box.width > 0 && box.left >= -0.5 && box.right <= innerWidth + 0.5 && box.top >= -0.5;
      return { en: document.documentElement.lang.startsWith('en'), scrolls, current, parts, plus: { inside: whole, hit: Boolean(hit && add.contains(hit)) } };
    })()`);
    assert.equal(row.en, true, `${width}: the page is in English`);
    assert.ok(row.current.width >= 98 && row.current.inView, `${width}: the current tab keeps its 98px and is in view as the undo chip comes in (${JSON.stringify(row)})`);
    assert.ok(row.scrolls, `${width}: a row that cannot hold it all scrolls rather than clips (${JSON.stringify(row)})`);
    assert.deepEqual(row.parts, [], `${width}: every part of the row shows whole once scrolled to (${JSON.stringify(row)})`);
    assert.ok(row.plus.inside && row.plus.hit, `${width}: the top bar's ＋ is whole in the window and takes the press (${JSON.stringify(row)})`);
  }
});

// PFG-22, 定样第 9 条 (760 and under shows only the focused pane): a window that wide or narrower loads with the side collapsed,
// its tabs, current tab and width as kept, and opening it shows that current tab again; a wide window keeps an open side open.
// The saved layout keeps the side open, so going back to a wide window does not lose it.
test("PFG-22 定样第 9 条 a narrow window loads with the side collapsed and its tabs kept; a wide one reloads it open", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  const shown = `[...document.querySelectorAll('${strip} [role=tab]')].filter(tab => tab.checkVisibility()).map(tab => tab.dataset.sideTab)`;
  const load = async (width: number, height: number, mobile: boolean) => {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
    await waitFor(`document.querySelector('${strip} [data-side-tab="files"]') && document.body.dataset.sideOpen`, 15_000);
  };
  await load(1440, 900, false);
  await waitFor("(document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'computer' }, cancelable: true })), document.body.dataset.sideOpen === 'true')", 5_000);
  await waitFor(`${stored}?.side?.open === true && ${current} === 'computer'`, 5_000);
  const tabs = await evaluate<string[]>(shown);

  await load(1440, 900, false);
  await waitFor(`document.body.dataset.sideOpen === 'true' && ${current} === 'computer'`, 5_000);

  await load(390, 844, true);
  // Give a late restore the chance to open it before reading that it stayed collapsed.
  await evaluate("new Promise(resolve => setTimeout(resolve, 600))");
  assert.equal(await evaluate("document.body.dataset.sideOpen"), "false", "a phone loads with the side collapsed");
  assert.deepEqual(await evaluate<string[]>(shown), tabs, "every side tab is still there");
  assert.equal(await evaluate(current), "computer", "the current tab is kept");
  assert.equal(await evaluate(`${stored}?.side?.open`), true, "the saved layout keeps the side open for a wide window");
  await click(`${strip} [data-side-tab="computer"]`);
  await waitFor(`document.body.dataset.sideOpen === 'true' && ${current} === 'computer' && !document.querySelector('[data-side-body="computer"]').hidden`, 5_000);

  // 601 to 760 counts as narrow too.
  await load(700, 900, false);
  await evaluate("new Promise(resolve => setTimeout(resolve, 600))");
  assert.equal(await evaluate("document.body.dataset.sideOpen"), "false", "700 wide loads with the side collapsed");
  await load(1440, 900, false);
  await waitFor(`document.body.dataset.sideOpen === 'true' && ${current} === 'computer'`, 5_000);
});

// 07-S1 review, small fix 2: a plugin taken out of the project keeps its side tab where it was, marked removed, as the main
// area's tabs are; its view says how to bring the plugin back, and once it is added back the tab works again.
test("PFG-22 a plugin taken out of the project keeps its side tab in place, marked removed, and it works again once added back", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId, web } = browser;
  assert.ok(projectId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  const visit = () => navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  const VIEW = "plugin:lingguang/side";
  const order = `[...document.querySelectorAll('${strip} [role=tab]')].filter(tab => tab.checkVisibility()).map(tab => tab.dataset.sideTab)`;
  await visit();
  await waitFor(`document.querySelector('${strip} [data-side-tab="${VIEW}"]')`, 15_000);
  const before = await evaluate<string[]>(order);

  await web.delete(`/api/settings/projects/${projectId}/plugins`, { plugin_id: "lingguang", expected_revision: await projectPluginRevision(web, projectId) });
  await visit();
  await waitFor(`document.querySelector('${strip} [data-side-tab="${VIEW}"][data-side-removed]')`, 15_000);
  assert.deepEqual(await evaluate<string[]>(order), before, "the tab stays and nothing else moves");
  assert.match(await evaluate<string>(`document.querySelector('${strip} [data-side-tab="${VIEW}"]').getAttribute('aria-label')`), /已移除/u);
  assert.equal(await evaluate(`${stored}.side.tabs.some(tab => tab.itemId === ${JSON.stringify(VIEW)})`), true, "the workspace keeps it");
  await click(`${strip} [data-side-tab="${VIEW}"]`);
  await waitFor(`document.body.dataset.sideOpen === 'true' && [...document.querySelectorAll('[data-side-removed-body]')].find(body => body.dataset.sideBody === ${JSON.stringify(VIEW)})?.checkVisibility()`);
  assert.match(await evaluate<string>("document.querySelector('[data-side-removed-body]').textContent"), /加回这个项目/u);

  await web.post(`/api/settings/projects/${projectId}/plugins`, { plugin_id: "lingguang", expected_revision: await projectPluginRevision(web, projectId) });
  await visit();
  await waitFor(`document.querySelector('${strip} [data-side-tab="${VIEW}"]:not([data-side-removed])') && !document.querySelector('[data-side-removed], [data-side-removed-body]')`, 15_000);
  assert.deepEqual(await evaluate<string[]>(order), before, "added back, the same tabs in the same places");
  assert.equal(await evaluate(`${JSON.stringify(VIEW)} === document.querySelector('${strip} [aria-selected=true]')?.dataset.sideTab`), true, "still the side's current tab");
});

// 07-S1 review B2: ⌘\ / Ctrl+\ is the side's only when nothing under the caret took it. Pages clears a selection's formatting
// with it; in a Pages document the formatting goes and the side stays as it was.
test("PFG-22 ⌘\\ in a Pages document clears the selection's formatting and leaves the side alone", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  const store = openPagesStore(homeDirectory);
  const page = (() => { try { return store.create({ project_id: projectId!, title: "Format", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Bold words", marks: [{ type: "strong" }] }] }] } }); } finally { store.close(); } })();
  const frame = await pluginFrameBrowser(t, browser, "pages");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
  await frame.waitFor("document.querySelector('[data-pages-editor] .ProseMirror strong')", 20_000);
  const side = await evaluate<string>("document.body.dataset.sideOpen");
  await frame.evaluate("(() => { const p=document.querySelector('[data-pages-editor] .ProseMirror p');p.closest('.ProseMirror').focus();const range=document.createRange();range.selectNodeContents(p);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange')); })()");
  await frame.waitFor("getSelection().toString() === 'Bold words'");
  const mac = await evaluate<boolean>("/Mac|iP/.test(navigator.platform)");
  for (const type of ["keyDown", "keyUp"]) await command("Input.dispatchKeyEvent", { type, key: "\\", code: "Backslash", windowsVirtualKeyCode: 220, modifiers: mac ? 4 : 2 }, sessionId);
  await frame.waitFor("!document.querySelector('[data-pages-editor] .ProseMirror strong') && document.querySelector('[data-pages-editor] .ProseMirror p').textContent === 'Bold words'", 5_000);
  await evaluate("new Promise(resolve => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), 50))");
  assert.equal(await evaluate("document.body.dataset.sideOpen"), side, "the side neither opened nor closed");
});

// 07-AUDIT (BL-record-gone-from-framed-plugins): a tab moved to the right side shows in the workbench's own pane page, which
// is another document. A record that page read as missing reports it to the page around it through the one pane-message
// check (S-30): from a pane frame, from this origin, in its exact shape. Only then is the tab it was opened for marked; the
// event is dispatched where the plugin page runs, and the report crosses the document boundary as a real pane message.
test("07-AUDIT a record gone in a pane page marks its tab only after the page takes the report", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  const LAYOUT = "[data-workspace-layout]";
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home' && document.querySelector('[data-layout-open]')", 15_000);
  // One Goal record, opened from its canvas as a tab.
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goals' && document.querySelector('[data-board-view-tab=canvas]')", 15_000);
  await evaluate("document.querySelector('[data-board-view-tab=canvas]').click()");
  await waitFor("document.querySelector('[data-graph-node][data-goal-id=CORE] [data-graph-frame]')", 15_000);
  await evaluate("document.querySelector('[data-graph-node][data-goal-id=CORE] [data-graph-frame]').click()");
  await waitFor("document.querySelector('[data-titlebar-tabs] .tab-item[data-plugin=goals][data-item-id=CORE][aria-current]')", 15_000);
  // Moved to the right side: its content is the workbench's pane page (another document) with no tab drawn there.
  await click("[data-layout-open]");
  await waitFor(`document.querySelector('${LAYOUT}')?.matches(':popover-open')`);
  await click(`${LAYOUT} [data-layout-action=to-side]`);
  await waitFor("document.querySelector('iframe[data-side-pane-src]')", 15_000);
  const src = await evaluate<string>("document.querySelector('iframe[data-side-pane-src]')?.getAttribute('src') || ''");
  assert.match(src, /panePlugin=goals/u, src);
  assert.match(src, /paneItem=CORE/u, src);
  // The pane page is another document in this same origin: it sends its report up with a real pane message, and the page takes it
  // only from that frame. Wait for it to be the workbench's pane page, then let the record it shows go missing (the record-gone it
  // dispatches is the one a plugin's page sends when its read answers 404).
  await waitFor(`(() => { const frame = document.querySelector('iframe[data-side-pane-src]'); try {
    // The pane page starts the same tab workspace after its body says it is embedded: the workspace's public entry is up when
    // its record-gone listener is, so the report below cannot be sent before there is anyone to send it.
    return frame.contentDocument?.readyState === 'complete' && frame.contentDocument.body.dataset.paneEmbedded === 'true'
      && typeof frame.contentWindow.molisWorkOpenPlugin === 'function'; } catch { return false; } })()`, 15_000);
  const marked = "document.querySelectorAll('[data-side-tabs] .tab-item[data-tab-state=gone]').length";
  assert.equal(await evaluate(marked), 0, "no tab is marked before the pane reports");
  await evaluate(`(() => { const frame = document.querySelector('iframe[data-side-pane-src]');
    frame.contentDocument.dispatchEvent(new CustomEvent('molis-work:record-gone', { detail: { plugin: 'goals', itemId: 'CORE' } })); })()`);
  await waitFor(`${marked} === 1`, 15_000);
  const gone = await evaluate<{ title: string; label: string | null }>(`(() => { const item = document.querySelector('[data-side-tabs] .tab-item[data-tab-state=gone]');
    return { title: item.title, label: item.querySelector('[role=tab]')?.getAttribute('aria-label') ?? null }; })()`);
  assert.match(gone.title, /这一条已经不在了/u);
  assert.match(gone.label ?? "", /这一条已经不在了/u);
  });

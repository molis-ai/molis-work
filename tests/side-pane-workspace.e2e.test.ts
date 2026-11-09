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

  // Collapsed, the glyphs stay at the right end of the title bar; the title bar has no background-tasks button of its own,
  // and the strip has no "+".
  const shown = await evaluate<string[]>(`[...document.querySelectorAll('${strip} [role=tab]')].filter(tab => tab.checkVisibility()).map(tab => tab.dataset.sideTab)`);
  assert.ok(shown.includes(SHELF) && shown.includes("tasks"), JSON.stringify(shown));
  assert.equal(await evaluate("document.querySelector('[data-background-tasks]')"), null);
  assert.equal(await evaluate(`document.querySelector('${strip} [data-tab-add], ${strip} [aria-label*="新"]')`), null);
  // 07-S2 (口径 6): the title bar ends with its one layout button; the strip ends right before it.
  const [edge, layoutEdge] = await evaluate<[number, number]>(`(() => { const layout = document.querySelector('[data-layout-open]').getBoundingClientRect();
    return [layout.left - [...document.querySelectorAll('${strip} [role=tab]')].filter(tab => tab.checkVisibility()).at(-1).getBoundingClientRect().right, innerWidth - layout.right]; })()`);
  assert.ok(edge >= 0 && edge < 24, `the strip ends right before the layout button (${edge}px between)`);
  assert.ok(layoutEdge >= 0 && layoutEdge < 24, `the layout button ends the title bar (${layoutEdge}px left)`);

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

// Review evidence (ignored folder unless MOLIS_WORK_REVIEW_EVIDENCE=1): the side collapsed and open on the background tasks,
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
    await waitFor(`document.querySelector('${strip} [data-side-tab="tasks"]')`, 15_000);
    // The page collapses the side from the layout menu (收起右侧); the side has no close event of its own (07-1 S4b).
    await waitFor("document.body.dataset.sideOpen === 'false' || (document.querySelector('[data-layout-open]').click(), document.querySelector('[data-layout-action=side]').click(), false)", 5_000);
    const name = `${lang}-${theme}-${width}`;
    await shot(name + "-collapsed");
    await waitFor("(document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'tasks' }, cancelable: true })), document.body.dataset.sideOpen === 'true')", 5_000);
    await waitFor("!document.querySelector('[data-side-body=\"tasks\"]').hidden");
    await new Promise(resolve => setTimeout(resolve, 450));
    await shot(name + "-tasks");
  }

  // The badge's first time in the product (design README 13): two tasks not finished, one running and one waiting on the
  // person. The attention read answers with them; everything else in it is the Host's own answer.
  const at = new Date().toISOString();
  const rows = [
    { project_id: projectId, project_name: "Demo", surface: "coding", id: "shot-running", title: "整理发布说明", state: "running", updated_at: at, waiting: false, standing: [{ text: "你负责 {n} 步", count: 2 }], commands: [] },
    { project_id: projectId, project_name: "Demo", surface: "coding", id: "shot-waiting", title: "检查迁移脚本", state: "waiting", updated_at: at, waiting: true, standing: [{ text: "等你审查" }], commands: [] },
  ];
  await command("Fetch.enable", { patterns: [{ urlPattern: "*/api/attention*", requestStage: "Response" }] }, sessionId);
  const stop = browser.on("Fetch.requestPaused", (event, session) => {
    if (session !== sessionId) return;
    const requestId = String(event.requestId);
    void (async () => {
      const { body, base64Encoded } = await command<{ body: string; base64Encoded: boolean }>("Fetch.getResponseBody", { requestId }, sessionId);
      const answer = JSON.parse(base64Encoded ? Buffer.from(body, "base64").toString("utf8") : body) as Record<string, unknown>;
      await command("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "content-type", value: "application/json" }], body: Buffer.from(JSON.stringify({ ...answer, background_tasks: rows })).toString("base64") }, sessionId);
    })();
  });
  t.after(() => { stop(); });
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }, sessionId);
  for (const lang of ["zh", "en"] as const) for (const [width, height] of [[1440, 900], [700, 900]] as const) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=${lang}&next=${encodeURIComponent(`/projects/${projectId}/`)}` }, sessionId));
    await waitFor(`document.querySelector('${strip} [data-background-tasks-count]')?.textContent === '2' && !document.querySelector('${strip} [data-background-tasks-count]').hidden`, 15_000);
    await waitFor("(document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'tasks' }, cancelable: true })), document.body.dataset.sideOpen === 'true')", 5_000);
    await waitFor("document.querySelectorAll('[data-background-tasks-list] .background-task').length === 2");
    await new Promise(resolve => setTimeout(resolve, 450));
    await shot(`${lang}-light-${width}-tasks-badge`);
  }
});

// 07-S1 review B3: from 601 to 760 the side's strip is a row of its own, as on a phone (S3 sets its final look), so every tab,
// the background tasks with their count among them, shows; on the narrowest phone, where it still scrolls, the current tab is
// kept in view.
test("PFG-22 between 601 and 760 every side tab shows on its own row, and a phone's strip keeps the current tab in view while the layout button ends the tabs' row", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  const shown = `[...document.querySelectorAll('${strip} [role=tab]')].filter(tab => tab.checkVisibility())`;
  const outside = `(() => { const box = document.querySelector('${strip}').getBoundingClientRect(); return ${shown}.filter(tab => { const at = tab.getBoundingClientRect(); return at.left < Math.max(0, box.left) - 0.5 || at.right > Math.min(innerWidth, box.right) + 0.5; }).map(tab => tab.dataset.sideTab); })()`;
  for (const [width, height] of [[601, 900], [700, 900], [760, 900], [700, 420]]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
    await waitFor(`document.querySelector('${strip} [data-side-tab="tasks"]')`, 15_000);
    await waitFor("(document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'tasks' }, cancelable: true })), document.body.dataset.sideOpen === 'true')", 5_000);
    const tabs = await evaluate<string[]>(`${shown}.map(tab => tab.dataset.sideTab)`);
    assert.ok(tabs.includes("tasks") && tabs.length >= 6, `${width}×${height}: ${JSON.stringify(tabs)}`);
    assert.deepEqual(await evaluate<string[]>(outside), [], `${width}×${height}: every tab is inside the strip and the window`);
    assert.equal(await evaluate<boolean>(`(() => { const s = document.querySelector('${strip}'); return s.scrollWidth <= s.clientWidth + 1; })()`), true, `${width}×${height}: nothing scrolled out of sight`);
    const rows = await evaluate<{ strip: number; tabs: number }>(`(() => ({ strip: document.querySelector('${strip}').getBoundingClientRect().top, tabs: document.querySelector('[data-titlebar-tabs]').getBoundingClientRect().top }))()`);
    assert.ok(rows.strip > rows.tabs, `${width}×${height}: the side's strip is on a row below the main tabs (${JSON.stringify(rows)})`);
    // The strip's own box, not the title bar's: a bar pinned at one row lets the strip spill over the work below it.
    const below = await evaluate<{ strip: number; stage: number; panel: number; corner: boolean }>(`(() => {
      const stage = document.querySelector('[data-plugin-stage]').getBoundingClientRect();
      const corner = document.elementFromPoint(stage.right - 12, stage.top + 12);
      return { strip: document.querySelector('${strip}').getBoundingClientRect().bottom, stage: stage.top, panel: document.querySelector('.side-panel').getBoundingClientRect().top,
        corner: Boolean(corner && document.querySelector('[data-plugin-stage]').contains(corner) && !corner.closest('${strip}')) };
    })()`);
    assert.ok(below.stage >= below.strip - 0.5, `${width}×${height}: the work starts below the side's strip (${JSON.stringify(below)})`);
    assert.ok(below.panel >= below.strip - 0.5, `${width}×${height}: the side sheet starts below its strip (${JSON.stringify(below)})`);
    assert.equal(below.corner, true, `${width}×${height}: the main area's top right corner is the work's own, not the strip`);
  }
  // 07-S2 on a phone: the title bar keeps the two rows S1 gave it (the strip shares the first); nothing that takes room starts below
  // the tabs. 07-1 S3: the layout button ends the first row, after the side's strip, as it ends the bar after the side's glyphs on
  // a wide window (the Home tools left that row in S4b), so the second row keeps its whole width for the main strip, which holds
  // everything it shows. Measured at 390, 360 and 320 before the 320 walk below.
  for (const width of [390, 360, 320]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
    await waitFor(`document.querySelector('${strip} [data-side-tab="tasks"]') && document.querySelector('[data-layout-open]')`, 15_000);
    const bar = await evaluate<{ tabs: { top: number; bottom: number; fits: boolean; clipped: string[] }; layout: { top: number; left: number; right: number }; strip: number; stripRight: number; history: number; below: string[] }>(`(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const tabs = box('[data-titlebar-tabs]');
      const bar = document.querySelector('[data-titlebar-tabs]');
      const clipped = [...bar.children].filter(child => { const at = child.getBoundingClientRect(); return at.width > 0 && (at.left < tabs.left - 0.5 || at.right > tabs.right + 0.5 || at.top < tabs.top - 0.5 || at.bottom > tabs.bottom + 0.5); }).map(child => child.className);
      return { tabs: { top: tabs.top, bottom: tabs.bottom, fits: bar.scrollWidth <= bar.clientWidth + 1, clipped }, layout: { top: box('[data-layout-open]').top, left: box('[data-layout-open]').left, right: box('[data-layout-open]').right },
        strip: box('${strip}').top, stripRight: box('${strip}').right, history: box('[data-workspace-history]').top,
        below: [...document.querySelector('.immersive-titlebar').children].filter(child => { const at = child.getBoundingClientRect(); return at.width > 0 && at.height > 0 && at.top >= tabs.bottom - 0.5; }).map(child => child.className) };
    })()`);
    assert.ok(Math.abs(bar.layout.top - bar.history) <= 3 && bar.layout.left >= bar.stripRight - 0.5, `${width}: the layout button ends the first row, after the side's strip (${JSON.stringify(bar)})`);
    assert.ok(bar.layout.right <= width + 0.5, `${width}: the layout button is inside the window (${JSON.stringify(bar)})`);
    assert.ok(bar.tabs.fits && bar.tabs.clipped.length === 0, `${width}: the main strip holds all it shows, none of it clipped (${JSON.stringify(bar)})`);
    assert.ok(Math.abs(bar.strip - bar.history) <= 3 && bar.tabs.top > bar.strip, `${width}: the side's strip shares the first row; the tabs are the second (${JSON.stringify(bar)})`);
    assert.deepEqual(bar.below, [], `${width}: no third row in the title bar (${JSON.stringify(bar)})`);
  }
  await command("Emulation.setDeviceMetricsOverride", { width: 320, height: 720, deviceScaleFactor: 1, mobile: true }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor(`document.querySelector('${strip} [data-side-tab="tasks"]')`, 15_000);
  const ends = await evaluate<string[]>(`${shown}.map(tab => tab.dataset.sideTab)`);
  for (const tab of [ends[0], ends.at(-1)]) {
    await waitFor(`(document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: ${JSON.stringify(tab)} }, cancelable: true })), document.querySelector('${strip} [aria-selected=true]')?.dataset.sideTab === ${JSON.stringify(tab)})`, 5_000);
    await waitFor(`!${outside}.includes(${JSON.stringify(tab)})`, 3_000);
  }
  // 07-1 S3: on a phone only one column shows, so the side opened by an event (the focus where it was, as the Assistant or ⌘\
  // opens it) is the one shown, and 主区 | 右侧 says 右侧.
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor(`document.querySelector('${strip} [data-side-tab="tasks"]') && document.querySelector('[data-pane-switch=side]')`, 15_000);
  await waitFor("(document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'tasks' }, cancelable: true })), document.body.dataset.sideOpen === 'true')", 5_000);
  await waitFor("document.querySelector('[data-pane-switch=side]')?.getAttribute('aria-pressed') === 'true' && document.querySelector('[data-pane-switch=main]')?.getAttribute('aria-pressed') === 'false'", 5_000)
    .catch(async () => assert.fail(`390: the side opened by an event shows 右侧 pressed (${await evaluate<string>("JSON.stringify([...document.querySelectorAll('[data-pane-switch]')].map(b => b.dataset.paneSwitch + ':' + b.getAttribute('aria-pressed')))")})`));
  // 07-1 S3: just after a group closes, a 360 or 320 phone row cannot hold the switch, a 98px current tab, the undo chip,
  // 全部标签 and ＋ at once (English is the wider switch). The row scrolls rather than clips, as scheme A narrows the tabs to
  // 96px and then scrolls: the current tab is in view as the chip comes in, each part shows whole once scrolled to, and ＋ is
  // reached that way and takes the press.
  for (const width of [360, 320]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=en&next=${encodeURIComponent(`/projects/${projectId}/`)}` }, sessionId));
    await waitFor("typeof molisWorkOpenPlugin === 'function' && document.querySelector('[data-titlebar-tabs] .tab-pane-switch')", 15_000);
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
      const add = strip.querySelector('.tab-add-button'); add.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const box = add.getBoundingClientRect(), hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return { en: document.documentElement.lang.startsWith('en'), scrolls, current, parts, plus: { inside: inside(add), hit: Boolean(hit && add.contains(hit)) } };
    })()`);
    assert.equal(row.en, true, `${width}: the page is in English`);
    assert.ok(row.current.width >= 98 && row.current.inView, `${width}: the current tab keeps its 98px and is in view as the undo chip comes in (${JSON.stringify(row)})`);
    assert.ok(row.scrolls, `${width}: a row that cannot hold it all scrolls rather than clips (${JSON.stringify(row)})`);
    assert.deepEqual(row.parts, [], `${width}: every part of the row shows whole once scrolled to (${JSON.stringify(row)})`);
    assert.ok(row.plus.inside && row.plus.hit, `${width}: ＋ is reached by scrolling and takes the press (${JSON.stringify(row)})`);
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
    await waitFor(`document.querySelector('${strip} [data-side-tab="tasks"]') && document.body.dataset.sideOpen`, 15_000);
  };
  await load(1440, 900, false);
  await waitFor("(document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'tasks' }, cancelable: true })), document.body.dataset.sideOpen === 'true')", 5_000);
  await waitFor(`${stored}?.side?.open === true && ${current} === 'tasks'`, 5_000);
  const tabs = await evaluate<string[]>(shown);

  await load(1440, 900, false);
  await waitFor(`document.body.dataset.sideOpen === 'true' && ${current} === 'tasks'`, 5_000);

  await load(390, 844, true);
  // Give a late restore the chance to open it before reading that it stayed collapsed.
  await evaluate("new Promise(resolve => setTimeout(resolve, 600))");
  assert.equal(await evaluate("document.body.dataset.sideOpen"), "false", "a phone loads with the side collapsed");
  assert.deepEqual(await evaluate<string[]>(shown), tabs, "every side tab is still there");
  assert.equal(await evaluate(current), "tasks", "the current tab is kept");
  assert.equal(await evaluate(`${stored}?.side?.open`), true, "the saved layout keeps the side open for a wide window");
  await click(`${strip} [data-side-tab="tasks"]`);
  await waitFor(`document.body.dataset.sideOpen === 'true' && ${current} === 'tasks' && !document.querySelector('[data-side-body="tasks"]').hidden`, 5_000);

  // 601 to 760 counts as narrow too.
  await load(700, 900, false);
  await evaluate("new Promise(resolve => setTimeout(resolve, 600))");
  assert.equal(await evaluate("document.body.dataset.sideOpen"), "false", "700 wide loads with the side collapsed");
  await load(1440, 900, false);
  await waitFor(`document.body.dataset.sideOpen === 'true' && ${current} === 'tasks'`, 5_000);
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

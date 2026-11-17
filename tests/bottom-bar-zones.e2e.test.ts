import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// The global entries, in the titlebar strip since the work line took the foot (specs/work-line §4.1, §6.5; first laid out as the
// bar's three zones by 07-1 S4b, PFG-22): the plugins kept at hand, the tabs, ＋ (the start page, its glyph alone), the person's
// own plugins they keep, then the project; the foot is the line with the Assistant's input and nothing else. No side button in
// the foot, no personal-tool slot in the titlebar. Who is the person's own is one rule (`isPersonalPlugin`) that the start page's
// 个人 group and the strip's own group both read; a plugin that did not start carries the amber point on its pin and its entry.
//
// specs/screen-polish §3 方案 C「纸上的页签」 (user 2026-11-15) redraws the strip: the kept plugins, the person's own among them,
// are glyphs before the tabs; the right end is the side's switch, the layout button and the project and nothing else (POLISH-05);
// a phone has one row (POLISH-07), where the kept plugins other than 项目首页 are in the start page.

const PINS = ["goals", "pages", "todo", "jelly"];

test("PFG-22 WLN-16 POLISH-05 the strip carries the kept plugins, ＋, the side's switch, the layout button and the project, and the foot is the line with the Assistant's input; one 个人 rule for the start page", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  // A stand-in for a plugin that did not start: its stage placeholder carries the Host's mark before the page's scripts read it
  // (a real one is RAC-2623). Jelly is kept in the strip, so the point shows there, in the switcher and in ＋.
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `new MutationObserver((_, observer) => {
    const stage = document.querySelector('[data-work-surface="jelly"]'); if (!stage) return;
    stage.setAttribute('data-home-plugin-unavailable', 'workbench'); observer.disconnect();
  }).observe(document, { subtree: true, childList: true });` }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await evaluate(`localStorage.setItem('molis-work:dock-pins', ${JSON.stringify(JSON.stringify(PINS))})`);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-dock-pins] [data-dock-pin=jelly]') && document.querySelector('[data-dock-pins] [data-dock-pin=pages]')", 20_000);

  // The strip, left to right, none covering another; the foot holds the line and the input, and no plugin entry.
  const zones = await evaluate<Record<string, unknown>>(`(() => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect();
    const strip = '.workbench-header[data-dock] ';
    const dock = box(strip + '[data-dock-pins]'), picker = box(strip + '.plugin-picker'), side = box(strip + '[data-side-toggle]'), layout = box(strip + '[data-layout-open]'), project = box(strip + '.titlebar-end .navigator-project-selector');
    const foot = document.querySelector('.workbench-bar[data-work-bar]');
    return {
      order: dock.right <= picker.left + 4 && picker.right <= side.left && side.right <= layout.left && layout.right <= project.left,
      dock: [...document.querySelectorAll('[data-dock-pins] [data-dock-pin]')].map((pin) => pin.dataset.dockPin),
      own: document.querySelector('[data-bar-own]') !== null,
      foot: [!!foot.querySelector('[data-work-line] [data-assistant-composer]'), foot.querySelectorAll('[data-dock-pin], [data-plugin-picker-toggle], .navigator-project-selector').length],
      sideButton: document.querySelector('[data-side-toggle]') !== null,
      homeTools: document.querySelector('.immersive-titlebar [data-home-plugin-open]') !== null,
      glyphOnly: getComputedStyle(document.querySelector(strip + '.plugin-picker-current')).display === 'none' && !!document.querySelector(strip + '.plugin-picker-trigger > svg'),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  })()`);
  assert.deepEqual(zones, { order: true, dock: ["home", "goals", "pages", "todo", "jelly"], own: false, foot: [true, 0], sideButton: true, homeTools: false, glyphOnly: true, overflow: false });
  // The glyph-only ＋ says where the work area is to a screen reader.
  await waitFor("/^切换插件 · 现在：/.test(document.querySelector('[data-plugin-picker-toggle]').getAttribute('aria-label'))");

  // One rule: the start page's 个人 group, the strip's own group and the plugin directory list the same built-ins (Pages is personal per project, 灵光 too: not the person's own here).
  const personal = await evaluate<{ switcher: string[]; plus: string[] }>(`(() => ({
    switcher: [...document.querySelectorAll('[data-plugin-tile][data-rail-group="personal"]')].map((tile) => tile.dataset.pluginTile).sort(),
    plus: JSON.parse(document.querySelector('script[data-plugin-directory]').textContent).filter((entry) => entry.personal).map((entry) => entry.id).sort(),
  }))()`);
  for (const id of ["todo", "jelly"]) assert.ok(personal.switcher.includes(id) && personal.plus.includes(id), `${id} is the person's own in both`);
  for (const id of ["pages", "lingguang"]) assert.ok(!personal.switcher.includes(id) && !personal.plus.includes(id), `${id} is not the person's own`);
  assert.deepEqual(personal.switcher.filter((id) => !personal.plus.includes(id)), [], "every 个人 entry of the switcher is in ＋'s 个人 section");

  // The plugin that did not start: the amber point on its pin (and its name says so), its switcher entry and its ＋ row.
  assert.deepEqual(await evaluate(`(() => {
    const pin = document.querySelector('[data-dock-pins] [data-dock-pin=jelly]');
    return { pin: !!pin.querySelector('.nav-warn-dot'), label: pin.getAttribute('aria-label'), others: document.querySelectorAll('[data-dock-pin]:not([data-dock-pin=jelly]) .nav-warn-dot').length,
      switcher: !!document.querySelector('.plugin-rail-items [data-plugin-id=jelly] .nav-warn-dot') };
  })()`), { pin: true, label: "Jelly · 没能启动", others: 0, switcher: true });
  // ＋ opens the start page from the strip; the tab strip has no ＋ of its own.
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-titlebar-tabs] .tab-add-button') ?? document.body).display === 'none' || !document.querySelector('[data-titlebar-tabs] .tab-add-button')"), true);
  await click("[data-plugin-picker-toggle]");
  await waitFor("!document.querySelector('[data-plugin-picker-popover]').hidden");
  assert.deepEqual(await evaluate(`(() => {
    const row = (id) => document.querySelector('[data-plugin-picker-popover] .plugin-rail-items [data-plugin-id="' + id + '"]');
    return { jelly: row('jelly')?.querySelector('.nav-warn-dot')?.getAttribute('aria-label') ?? null, todo: !!row('todo')?.querySelector('.nav-warn-dot') };
  })()`), { jelly: "没能启动", todo: false });
});

test("PFG-22 WLN-18 POLISH-07 on a phone the strip is one row of whole 44px targets; the kept plugins other than 项目首页 are in the start page", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await evaluate(`localStorage.setItem('molis-work:dock-pins', ${JSON.stringify(JSON.stringify(["goals", "pages", "feed", "inbox", "todo", "jelly", "cognia", "issues"]))})`);
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('.workbench-header[data-dock-drawn] [data-dock-pins] [data-dock-pin=home]') && document.querySelector('[data-dock-pins] [data-dock-pin=jelly]')", 20_000);
  await mkdir(new URL("../.impeccable/qa/review/work-line/", import.meta.url), { recursive: true });
  await evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 200))))");
  const row = await evaluate<Record<string, unknown>>(`(() => {
    const strip = document.querySelector('.workbench-header[data-dock]');
    const shown = (tray) => [...document.querySelectorAll(tray + ' [data-dock-pin]:not([hidden])')].filter((pin) => pin.getClientRects().length).map((pin) => pin.dataset.dockPin);
    const more = (tray) => document.querySelector(tray + ' [data-dock-more]');
    const targets = [...strip.querySelectorAll('[data-dock-pin]:not([hidden]), [data-dock-more], [data-plugin-picker-toggle], .navigator-project-selector, [data-workspace-history], [data-layout-open], [data-side-toggle]')].filter((node) => node.getClientRects().length);
    const boxes = targets.map((node) => node.getBoundingClientRect());
    return { overflow: document.documentElement.scrollWidth > innerWidth,
      // Every target of the strip is whole, inside the window, and 44px.
      cut: targets.filter((node, index) => boxes[index].left < -0.5 || boxes[index].right > innerWidth + 0.5 || !node.contains(document.elementFromPoint(boxes[index].left + boxes[index].width / 2, boxes[index].top + boxes[index].height / 2))).map((node) => node.dataset.dockPin || node.className),
      small: targets.filter((node, index) => boxes[index].height < 44 || boxes[index].width < 44).map((node) => node.dataset.dockPin || node.className),
      overlap: boxes.some((one, index) => boxes.slice(index + 1).some((other) => Math.min(one.right, other.right) - Math.max(one.left, other.left) > 0.5 && Math.min(one.bottom, other.bottom) - Math.max(one.top, other.top) > 0.5)),
      // One row (POLISH-07): the way back, 项目首页, ＋, the side's switch and the project.
      // With the dialog closed, the task mark and the button that opens it stand at the end of the line's track: above the input, over nothing of the work.
      rows: new Set(boxes.map((one) => Math.round(one.top))).size, tall: Math.round(strip.getBoundingClientRect().height),
      mini: (() => { const mini = document.querySelector('[data-reply-mini]')?.getBoundingClientRect(), track = document.querySelector('.work-line-track')?.getBoundingClientRect(); return !!mini && !!track && mini.top >= track.top - 4 && mini.bottom <= track.bottom + 4 && mini.right <= innerWidth; })(),
      dock: shown('[data-dock-pins]'), folds: !!more('[data-dock-pins]')?.isConnected && more('[data-dock-pins]').getClientRects().length > 0,
      keptInStart: [...document.querySelectorAll('[data-plugin-picker-popover] .plugin-rail-tile.is-kept')].map((tile) => tile.dataset.pluginTile).filter((id) => ['goals', 'pages', 'todo', 'jelly'].includes(id)).sort(),
      foot: document.querySelectorAll('.workbench-bar[data-work-bar] [data-dock-pin]').length };
  })()`);
  await writeFile(new URL("../.impeccable/qa/review/work-line/strip-390.png", import.meta.url), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  assert.deepEqual(row, { overflow: false, cut: [], small: [], overlap: false, rows: 1, tall: 44, mini: true, dock: ["home"], folds: false, keptInStart: ["goals", "jelly", "pages", "todo"], foot: 0 });
});

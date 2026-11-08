import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// 07-1 S4b, the bar in three zones (specs/product-flow-governance §4.6.2 S4b, 口径 9; docs/design/workbench-navigation ② H1;
// PFG-22): at the left the switcher as its glyph alone, a hairline, then the Dock; the Assistant in the middle; at the right the
// person's own plugins they keep, then the project. No side button in the bar, no personal-tool slot in the titlebar. Who is the
// person's own is one rule (`isPersonalPlugin`) that the switcher's 个人 group, the right tray and ＋ all read; a plugin that did
// not start carries the amber point in the Dock, the switcher and ＋.

const PINS = ["goals", "pages", "todo", "jelly"];

test("PFG-22 the bar's three zones: the glyph-only switcher and the Dock, the Assistant, the person's own tray; one 个人 rule for the switcher, the tray and ＋", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  // A stand-in for a plugin that did not start: its stage placeholder carries the Host's mark before the page's scripts read it
  // (a real one is RAC-2623). Jelly is kept in the right tray, so the point shows there, in the switcher and in ＋.
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `new MutationObserver((_, observer) => {
    const stage = document.querySelector('[data-work-surface="jelly"]'); if (!stage) return;
    stage.setAttribute('data-home-plugin-unavailable', 'workbench'); observer.disconnect();
  }).observe(document, { subtree: true, childList: true });` }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await evaluate(`localStorage.setItem('molis-work:dock-pins', ${JSON.stringify(JSON.stringify(PINS))})`);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelectorAll('[data-bar-own] [data-dock-pin]').length === 2 && document.querySelector('[data-dock-pins] [data-dock-pin=pages]')", 20_000);

  // The zones, left to right, none covering another; no side button anywhere, no Home tool in the titlebar.
  const zones = await evaluate<Record<string, unknown>>(`(() => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect();
    const picker = box('.bar-start .plugin-picker'), dock = box('[data-dock-pins]'), composer = box('[data-assistant-composer]'), own = box('[data-bar-own]'), project = box('.bar-end .navigator-project-selector');
    return {
      order: picker.right <= dock.left && dock.right <= composer.left && composer.right <= own.left && own.right <= project.left,
      dock: [...document.querySelectorAll('[data-dock-pins] [data-dock-pin]')].map((pin) => pin.dataset.dockPin),
      own: [...document.querySelectorAll('[data-bar-own] [data-dock-pin]')].map((pin) => pin.dataset.dockPin),
      ownLabel: document.querySelector('[data-bar-own]').getAttribute('aria-label'),
      sideButton: document.querySelector('[data-side-toggle]') !== null,
      homeTools: document.querySelector('.immersive-titlebar [data-home-plugin-open]') !== null,
      glyphOnly: getComputedStyle(document.querySelector('.bar-start .plugin-picker-current')).display === 'none' && getComputedStyle(document.querySelector('.bar-start .plugin-picker-all')).display !== 'none',
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  })()`);
  assert.deepEqual(zones, { order: true, dock: ["home", "goals", "pages"], own: ["todo", "jelly"], ownLabel: "你自己的", sideButton: false, homeTools: false, glyphOnly: true, overflow: false });
  // The glyph-only switcher says where the work area is to a screen reader.
  await waitFor("/^切换插件 · 现在：/.test(document.querySelector('[data-plugin-picker-toggle]').getAttribute('aria-label'))");

  // One rule: the switcher's 个人 group, the tray and ＋ list the same built-ins (Pages is personal per project, 灵光 too: not the person's own here).
  const personal = await evaluate<{ switcher: string[]; plus: string[] }>(`(() => ({
    switcher: [...document.querySelectorAll('[data-plugin-tile][data-rail-group="personal"]')].map((tile) => tile.dataset.pluginTile).sort(),
    plus: JSON.parse(document.querySelector('script[data-plugin-directory]').textContent).filter((entry) => entry.personal).map((entry) => entry.id).sort(),
  }))()`);
  for (const id of ["todo", "jelly"]) assert.ok(personal.switcher.includes(id) && personal.plus.includes(id), `${id} is the person's own in both`);
  for (const id of ["pages", "lingguang"]) assert.ok(!personal.switcher.includes(id) && !personal.plus.includes(id), `${id} is not the person's own`);
  assert.deepEqual(personal.switcher.filter((id) => !personal.plus.includes(id)), [], "every 个人 entry of the switcher is in ＋'s 个人 section");

  // The plugin that did not start: the amber point on its pin (and its name says so), its switcher entry and its ＋ row.
  assert.deepEqual(await evaluate(`(() => {
    const pin = document.querySelector('[data-bar-own] [data-dock-pin=jelly]');
    return { pin: !!pin.querySelector('.nav-warn-dot'), label: pin.getAttribute('aria-label'), others: document.querySelectorAll('[data-dock-pin]:not([data-dock-pin=jelly]) .nav-warn-dot').length,
      switcher: !!document.querySelector('.plugin-rail-items [data-plugin-id=jelly] .nav-warn-dot') };
  })()`), { pin: true, label: "Jelly · 没能启动", others: 0, switcher: true });
  await click("[data-titlebar-tabs] .tab-add-button");
  await waitFor("document.querySelector('[data-workspace-open-menu]').matches(':popover-open')");
  assert.deepEqual(await evaluate(`(() => {
    const row = (id) => document.querySelector('[data-workspace-open-menu] [data-plus-open="' + id + '"]');
    return { jelly: row('jelly')?.querySelector('.nav-warn-dot')?.getAttribute('aria-label') ?? null, todo: !!row('todo')?.querySelector('.nav-warn-dot') };
  })()`), { jelly: "没能启动", todo: false });
});

test("PFG-22 on a phone the Dock and the person's own tray share the bar's second row and each folds into its own +N", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await evaluate(`localStorage.setItem('molis-work:dock-pins', ${JSON.stringify(JSON.stringify(["goals", "pages", "feed", "inbox", "todo", "jelly", "cognia", "issues"]))})`);
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-bar-own] [data-dock-pin]') && document.querySelector('[data-dock-pins] [data-dock-pin=home]')", 20_000);
  await evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 200))))");
  const row = await evaluate<Record<string, unknown>>(`(() => {
    const start = document.querySelector('.bar-start').getBoundingClientRect(), end = document.querySelector('.bar-end').getBoundingClientRect();
    const shown = (tray) => [...document.querySelectorAll(tray + ' [data-dock-pin]:not([hidden])')].map((pin) => pin.dataset.dockPin);
    const more = (tray) => document.querySelector(tray + ' [data-dock-more]');
    return { overflow: document.documentElement.scrollWidth > innerWidth, apart: start.right <= end.left + 1,
      dockKeepsHome: shown('[data-dock-pins]')[0] === 'home', dockFolds: !!more('[data-dock-pins]')?.isConnected, ownFolds: !!more('[data-bar-own]')?.isConnected || shown('[data-bar-own]').length === 4 };
  })()`);
  assert.deepEqual(row, { overflow: false, apart: true, dockKeepsHome: true, dockFolds: true, ownFolds: true });
  // The right tray's +N opens its own list, the kept plugins it could not hold.
  if (await evaluate("!!document.querySelector('[data-bar-own] [data-dock-more]')?.isConnected")) {
    await click("[data-bar-own] [data-dock-more]");
    await waitFor("[...document.querySelectorAll('.bar-end > [data-dock-overflow]')].some((list) => !list.hidden && list.querySelector('[data-dock-pin]'))");
    assert.equal(await evaluate("document.querySelector('[data-bar-own] [data-dock-more]').getAttribute('aria-expanded')"), "true");
  }
});

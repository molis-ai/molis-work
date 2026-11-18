import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/screen-polish §3 方案 C「纸上的页签」: the top strip holds tabs only; the current one is an ear grown on its sheet.
// Acceptance: POLISH-03, POLISH-05, POLISH-06, POLISH-07, POLISH-38.

/** Read in the page: boxes and marks of the top strip. */
const READ = `(() => {
  const header = document.querySelector('.workbench-header[data-dock]');
  const shown = (node) => Boolean(node) && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  const box = (node) => { const rect = node.getBoundingClientRect(); return { left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) }; };
  const paper = (node) => getComputedStyle(node).backgroundColor;
  const line = (node) => getComputedStyle(node).backgroundImage !== 'none';
  return { header, shown, box, paper, line };
})()`;

test("the top strip holds tabs only: the current one is an ear on its sheet and the right end has three controls (POLISH-03, POLISH-05, POLISH-06, POLISH-38)", { timeout: 240_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home' && document.querySelector('.workbench-header[data-dock-drawn] [data-dock-pin=home][data-ear]')");

  // 项目首页: its glyph is the ear, joined to the sheet below, in the sheet's colour; the strip has no tab, so ＋ stands at the hairline.
  const home = await evaluate<{ earBottom: number; sheetTop: number; samePaper: boolean; focusLine: boolean; plusGap: number; right: string[]; history: number }>(`(() => {
    const { header, shown, box, paper, line } = ${READ};
    const pin = header.querySelector('[data-dock-pin=home]'), sheet = document.querySelector('[data-tab-pane]');
    const drag = box(header.querySelector('.desktop-titlebar-drag'));
    const controls = [...header.querySelectorAll('button, a[href], summary, [role=tab]')].filter((node) => shown(node) && box(node).left >= drag.right - 1);
    return { earBottom: box(pin).bottom, sheetTop: box(sheet).top, samePaper: paper(pin) === paper(sheet), focusLine: line(pin),
      plusGap: box(header.querySelector('[data-plugin-picker-toggle]')).left - box(header.querySelector('[data-dock-pins]')).right,
      right: controls.map((node) => node.hasAttribute('data-side-toggle') ? 'side' : node.hasAttribute('data-layout-open') ? 'layout' : 'project'),
      history: [...header.querySelectorAll('[data-workspace-history]')].filter(shown).length };
  })()`);
  assert.equal(home.earBottom, home.sheetTop, "the home glyph reaches the sheet");
  assert.equal(home.samePaper, true, "and is the sheet's colour");
  assert.equal(home.focusLine, true, "with the accent line while its column has the focus");
  assert.ok(home.plusGap >= 0 && home.plusGap <= 12, `POLISH-03: ＋ is within 12px of the hairline when there is no tab (${home.plusGap}px)`);
  assert.deepEqual(home.right, ["side", "layout", "project"], "POLISH-05: the right end is the side's switch, the layout button and the project");
  assert.equal(home.history, 2, "one pair of back and forward");

  // A plugin that is not kept: its own page is a tab with its name, and that tab is the ear.
  await click('[data-plugin-strip] [data-plugin-id="pages"]');
  await waitFor("document.body.dataset.desktopSurface === 'pages' && document.querySelector('[data-titlebar-tabs] .tab-item[aria-current][data-tab-kind=plugin][data-plugin=pages]')");
  const tab = await evaluate<{ earBottom: number; sheetTop: number; samePaper: boolean; focusLine: boolean; nameWhole: boolean; homeEar: boolean; plusGap: number }>(`(() => {
    const { header, box, paper, line } = ${READ};
    const tab = header.querySelector('[data-titlebar-tabs] .tab-item[aria-current]'), sheet = document.querySelector('[data-tab-pane]'), name = tab.querySelector('.tab-item-name');
    return { earBottom: box(tab).bottom, sheetTop: box(sheet).top, samePaper: paper(tab) === paper(sheet), focusLine: line(tab), nameWhole: name.scrollWidth <= name.clientWidth,
      homeEar: header.querySelector('[data-dock-pin=home]').hasAttribute('data-ear'),
      plusGap: box(header.querySelector('[data-plugin-picker-toggle]')).left - box(tab).right };
  })()`);
  assert.equal(tab.earBottom, tab.sheetTop, "the current tab reaches the sheet");
  assert.equal(tab.samePaper && tab.focusLine, true, "in the sheet's colour, with the accent line");
  assert.equal(tab.nameWhole, true, "POLISH-06: a short plugin name is not cut");
  assert.equal(tab.homeEar, false, "only one ear in the strip");
  assert.ok(tab.plusGap >= 0 && tab.plusGap <= 12, `POLISH-03: ＋ is within 12px of the last tab (${tab.plusGap}px)`);

  // A plugin's own page is a tab like any other: the strip keeps only 项目首页 (specs/screen-polish §3 方案 C), and Goals' page is
  // the ear while it shows.
  await click("[data-plugin-picker-popover] [data-plugin-id=goals]");
  await waitFor("document.body.dataset.desktopSurface === 'goals' && document.querySelector('[data-titlebar-tabs] .tab-item[data-tab-kind=plugin][data-plugin=goals][data-ear]')");
  const page = await evaluate<{ pins: string[]; ears: number; plusGap: number }>(`(() => {
    const { header, shown, box } = ${READ};
    const drawn = [...header.querySelectorAll('[data-titlebar-tabs] .tab-item')].filter(shown);
    return { pins: [...header.querySelectorAll('[data-dock-pin]')].map((pin) => pin.dataset.dockPin),
      ears: [...header.querySelectorAll('[data-dock-pin][data-ear], [data-titlebar-tabs] .tab-item[aria-current]')].filter(shown).length,
      plusGap: box(header.querySelector('[data-plugin-picker-toggle]')).left - box(drawn.at(-1)).right };
  })()`);
  assert.deepEqual({ pins: page.pins, ears: page.ears }, { pins: ["home"], ears: 1 });
  assert.ok(page.plusGap >= 0 && page.plusGap <= 12, `POLISH-03: ＋ is within 12px of the last tab (${page.plusGap}px)`);

  // Settings is a tab like the others: after them, with its whole name and its close (POLISH-06).
  await evaluate("document.querySelector('[data-directory-open=settings]').click()");
  await waitFor("document.querySelector('[data-titlebar-tabs] [data-cover-chip=settings]')");
  const cover = await evaluate<{ afterTabs: boolean; nameWhole: boolean; close: boolean; ears: number }>(`(() => {
    const { header, shown } = ${READ};
    const chip = header.querySelector('[data-cover-chip=settings]'), name = chip.querySelector(':scope > span');
    return { afterTabs: chip.previousElementSibling?.matches('.tab-scroll') === true, nameWhole: name.scrollWidth <= name.clientWidth && name.textContent.length > 0,
      close: shown(chip.querySelector('[data-cover-close]')), ears: [...header.querySelectorAll('[data-dock-pin][data-ear]')].length };
  })()`);
  assert.deepEqual(cover, { afterTabs: true, nameWhole: true, close: true, ears: 0 });
  await click("[data-cover-close]");
  await waitFor("!document.querySelector('[data-cover-chip]')");

  // The side sheet has its own tab: the name of the view it shows, 18px in from the sheet's edge; it opens the list of views.
  await click("[data-side-toggle]");
  await waitFor("document.body.dataset.sideOpen === 'true' && document.querySelector('[data-side-ear]:not([hidden])')");
  const side = await evaluate<{ inset: number; earBottom: number; panelTop: number; pressed: string | null; listHidden: boolean; name: string; tabsEnd: number; panelLeft: number }>(`(() => {
    const { header, box } = ${READ};
    const ear = header.querySelector('[data-side-ear]'), panel = document.querySelector('[data-side-panel]');
    return { inset: box(ear).left - box(panel).left, earBottom: box(ear).bottom, panelTop: box(panel).top, pressed: header.querySelector('[data-side-toggle]').getAttribute('aria-pressed'),
      listHidden: header.querySelector('[data-side-tabs]').hidden, name: ear.querySelector('[data-side-ear-name]').textContent,
      tabsEnd: box(header.querySelector('[data-plugin-picker-toggle]')).right, panelLeft: box(panel).left };
  })()`);
  assert.equal(side.inset, 18, "the side's name stands 18px in from its sheet's left edge");
  assert.equal(side.earBottom, side.panelTop, "and reaches that sheet");
  assert.equal(side.pressed, "true");
  assert.equal(side.listHidden, true, "the list of views is closed until the name is pressed");
  assert.ok(side.name.length > 0);
  assert.ok(side.tabsEnd <= side.panelLeft, "the tabs and ＋ stop before the side's column");
  await click("[data-side-ear]");
  await waitFor("document.querySelector('[data-side-tabs]').hidden === false");
  const list = await evaluate<{ named: boolean; count: number }>(`(() => {
    const { header, shown } = ${READ};
    const rows = [...header.querySelectorAll('[data-side-tabs] [data-side-tab]')].filter(shown);
    return { count: rows.length, named: rows.every((row) => shown(row.querySelector('.tab-item-name')) && row.querySelector('.tab-item-name').textContent.length > 0) };
  })()`);
  assert.ok(list.count > 1 && list.named, "every view in the list has its name");
  await click("[data-side-tab=files]");
  await waitFor("document.querySelector('[data-side-tabs]').hidden && document.querySelector('[data-side-ear]').dataset.sideEar === 'files'");
  assert.equal(await evaluate("document.querySelector('[data-side-ear-name]').textContent === document.querySelector('[data-side-tab=files] .tab-item-name').textContent"), true);
  await click("[data-side-toggle]");
  await waitFor("document.body.dataset.sideOpen !== 'true' && document.querySelector('[data-side-ear]').hidden");

  // Split: each sheet carries its own tabs from its own left edge; only the focused sheet's current tab has the line (POLISH-38).
  await evaluate("document.querySelector('[data-rail-beside=pages]').click()");
  await waitFor("document.querySelectorAll('.tab-workspace-panes > [data-tab-pane]').length === 2 && document.querySelectorAll('[data-tab-pane] > [data-tab-strip] .tab-item[aria-current]').length === 2");
  const split = await evaluate<{ panes: { inset: number; joined: boolean; line: boolean; focused: boolean }[]; history: number; titlebarTabs: boolean }>(`(() => {
    const { header, shown, box, line } = ${READ};
    return { history: [...header.querySelectorAll('[data-workspace-history]')].filter(shown).length, titlebarTabs: shown(header.querySelector('[data-titlebar-tabs] .tab-item')),
      panes: [...document.querySelectorAll('.tab-workspace-panes > [data-tab-pane]')].map((pane) => {
        const body = box(pane.querySelector('.tab-pane-body')), tabs = [...pane.querySelectorAll(':scope > [data-tab-strip] .tab-item')].filter(shown), current = pane.querySelector(':scope > [data-tab-strip] .tab-item[aria-current]');
        return { inset: box(tabs[0]).left - body.left, joined: box(current).bottom === body.top, line: line(current), focused: pane.classList.contains('is-focused') };
      }) };
  })()`);
  assert.equal(split.history, 2, "split keeps one pair of back and forward");
  assert.equal(split.titlebarTabs, false);
  for (const pane of split.panes) {
    assert.equal(pane.inset, 18, "POLISH-38: a pane's tabs start at its sheet's left edge (18px in)");
    assert.equal(pane.joined, true, "its current tab reaches its sheet");
    assert.equal(pane.line, pane.focused, "the accent line is the focused sheet's alone");
  }
});

test("at 390px the top strip is one row (POLISH-07)", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home' && document.querySelector('.workbench-header[data-dock-drawn] [data-dock-pin=home]')");
  const read = () => evaluate<{ height: number; rows: number; overflow: boolean; has: string[]; stageTop: number }>(`(() => {
    const { header, shown, box } = ${READ};
    const parts = [...header.children].filter(shown);
    const has = ['[data-workspace-history=back]', '[data-dock-pin=home]', '[data-plugin-picker-toggle]', '[data-side-toggle]', '.titlebar-end'].filter((selector) => shown(header.querySelector(selector)));
    return { height: box(header).height, rows: new Set(parts.map((part) => box(part).top + box(part).height / 2)).size, overflow: document.documentElement.scrollWidth > innerWidth || parts.some((part) => box(part).right > innerWidth),
      has, stageTop: box(document.querySelector('[data-plugin-stage]')).top };
  })()`);
  const whole = ["[data-workspace-history=back]", "[data-dock-pin=home]", "[data-plugin-picker-toggle]", "[data-side-toggle]", ".titlebar-end"];
  const home = await read();
  assert.deepEqual({ height: home.height, rows: home.rows, overflow: home.overflow, stageTop: home.stageTop }, { height: 44, rows: 1, overflow: false, stageTop: 44 }, "POLISH-07: one 44px row and the work area starts right under it");
  assert.deepEqual(home.has, whole, "the way back, 项目首页, ＋, the side's switch and the project");

  // With a tab open the row holds the current tab and 全部标签 as well, and is still one row.
  await click('[data-plugin-strip] [data-plugin-id="pages"]');
  await waitFor("document.body.dataset.desktopSurface === 'pages' && document.querySelector('[data-titlebar-tabs] .tab-item[aria-current][data-plugin=pages]')");
  const tabbed = await read();
  assert.deepEqual({ height: tabbed.height, rows: tabbed.rows, overflow: tabbed.overflow }, { height: 44, rows: 1, overflow: false }, "POLISH-07: still one row with a tab open");
  // 项目首页 is in the row only while the project home is the current page; with a tab current it is in the start page.
  assert.deepEqual(tabbed.has, whole.filter((selector) => selector !== "[data-dock-pin=home]"));
  const current = await evaluate<{ shown: boolean; others: number; all: boolean }>(`(() => {
    const { header, shown } = ${READ};
    return { shown: shown(header.querySelector('[data-titlebar-tabs] .tab-item[aria-current]')), others: [...header.querySelectorAll('[data-titlebar-tabs] .tab-item:not([aria-current])')].filter(shown).length, all: shown(header.querySelector('[data-tab-all]')) };
  })()`);
  assert.deepEqual(current, { shown: true, others: 0, all: true }, "the current tab and 全部标签; the other tabs are in that list");

  // POLISH-06: 设置 is a piece of that row too, beside the directory button of its page: its name whole, its close mark a 44px
  // target, and still one row.
  await click("[data-directory-open=settings]");
  await waitFor("document.querySelector('[data-titlebar-tabs] .tab-view-chip.is-exclusive .tab-view-chip-close')?.checkVisibility()");
  const cover = await evaluate<{ name: string; whole: boolean; close: number[] }>(`(() => {
    const chip = document.querySelector('[data-titlebar-tabs] .tab-view-chip.is-exclusive'), name = chip.querySelector(':scope > span'), close = chip.querySelector('.tab-view-chip-close').getBoundingClientRect();
    return { name: name.textContent.trim(), whole: name.scrollWidth <= name.clientWidth && name.getBoundingClientRect().width > 0, close: [Math.round(close.width), Math.round(close.height)] };
  })()`);
  assert.deepEqual(cover, { name: "设置", whole: true, close: [44, 44] }, "POLISH-06: 设置 reads whole at 390px and closes from a 44px mark");
  const covered = await read();
  assert.deepEqual({ height: covered.height, rows: covered.rows, overflow: covered.overflow }, { height: 44, rows: 1, overflow: false }, "POLISH-07: still one row with 设置 open");
});

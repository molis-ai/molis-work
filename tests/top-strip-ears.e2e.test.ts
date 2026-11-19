import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/screen-polish §3 方案 C「纸上的页签」: the top strip holds tabs only; the current one is an ear grown on its sheet.
// The first place, 「项目 › 项目主页」, takes ⌂ in (§4「底栏第十三版」第 1 条; mock helm.html, screen 34).
// Acceptance: POLISH-03, POLISH-05, POLISH-06, POLISH-07, POLISH-38; the parts of POLISH-62～64 that are not about items (the items are 37-2's).

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
  await waitFor("document.body.dataset.desktopSurface === 'home' && document.querySelector('.workbench-header[data-dock-drawn] [data-top-corner-toggle][data-ear]')");

  // 项目主页: the first place is the ear, joined to the sheet below, in the sheet's colour; the strip has no tab, so ＋ stands at the hairline.
  const home = await evaluate<{ earBottom: number; sheetTop: number; samePaper: boolean; focusLine: boolean; plusGap: number; right: string[]; history: number }>(`(() => {
    const { header, shown, box, paper, line } = ${READ};
    const pin = header.querySelector('[data-top-corner-toggle]'), sheet = document.querySelector('[data-tab-pane]');
    const drag = box(header.querySelector('.desktop-titlebar-drag'));
    const controls = [...header.querySelectorAll('button, a[href], summary, [role=tab]')].filter((node) => shown(node) && box(node).left >= drag.right - 1);
    return { earBottom: box(pin).bottom, sheetTop: box(sheet).top, samePaper: paper(pin) === paper(sheet), focusLine: line(pin),
      plusGap: box(header.querySelector('[data-plugin-picker-toggle]')).left - box(header.querySelector('[data-dock-pins]')).right,
      right: controls.map((node) => node.hasAttribute('data-side-toggle') ? 'side' : node.hasAttribute('data-layout-open') ? 'layout' : 'project'),
      history: [...header.querySelectorAll('[data-workspace-history]')].filter(shown).length };
  })()`);
  assert.equal(home.earBottom, home.sheetTop, "the first place reaches the sheet");
  assert.equal(home.samePaper, true, "and is the sheet's colour");
  assert.equal(home.focusLine, true, "with the accent line while its column has the focus");
  assert.ok(home.plusGap >= 0 && home.plusGap <= 12, `POLISH-03: ＋ is within 12px of the hairline when there is no tab (${home.plusGap}px)`);
  assert.deepEqual(home.right, ["side", "layout"], "POLISH-05, POLISH-71: from 960px the right end is the side's switch and the layout button alone");
  assert.equal(home.history, 2, "one pair of back and forward");

  // A plugin that is not kept: its own page is a tab with its name, and that tab is the ear.
  await click('[data-plugin-strip] [data-plugin-id="pages"]');
  await waitFor("document.body.dataset.desktopSurface === 'pages' && document.querySelector('[data-titlebar-tabs] .tab-item[aria-current][data-tab-kind=plugin][data-plugin=pages]')");
  const tab = await evaluate<{ earBottom: number; sheetTop: number; samePaper: boolean; focusLine: boolean; nameWhole: boolean; homeEar: boolean; plusGap: number }>(`(() => {
    const { header, box, paper, line } = ${READ};
    const tab = header.querySelector('[data-titlebar-tabs] .tab-item[aria-current]'), sheet = document.querySelector('[data-tab-pane]'), name = tab.querySelector('.tab-item-name');
    return { earBottom: box(tab).bottom, sheetTop: box(sheet).top, samePaper: paper(tab) === paper(sheet), focusLine: line(tab), nameWhole: name.scrollWidth <= name.clientWidth,
      homeEar: header.querySelector('[data-top-corner-toggle]').hasAttribute('data-ear'),
      plusGap: box(header.querySelector('[data-plugin-picker-toggle]')).left - box(tab).right };
  })()`);
  assert.equal(tab.earBottom, tab.sheetTop, "the current tab reaches the sheet");
  assert.equal(tab.samePaper && tab.focusLine, true, "in the sheet's colour, with the accent line");
  assert.equal(tab.nameWhole, true, "POLISH-06: a short plugin name is not cut");
  assert.equal(tab.homeEar, false, "only one ear in the strip");
  assert.ok(tab.plusGap >= 0 && tab.plusGap <= 12, `POLISH-03: ＋ is within 12px of the last tab (${tab.plusGap}px)`);

  // A plugin's own page is a tab like any other: before the tabs the strip keeps only the first place (§4「底栏第十三版」第 1 条), and Goals' page is
  // the ear while it shows.
  await click("[data-plugin-picker-popover] [data-plugin-id=goals]");
  await waitFor("document.body.dataset.desktopSurface === 'goals' && document.querySelector('[data-titlebar-tabs] .tab-item[data-tab-kind=plugin][data-plugin=goals][data-ear]')");
  const page = await evaluate<{ pins: string[]; ears: number; plusGap: number }>(`(() => {
    const { header, shown, box } = ${READ};
    const drawn = [...header.querySelectorAll('[data-titlebar-tabs] .tab-item')].filter(shown);
    return { pins: [...header.querySelectorAll('[data-dock-pins] > *')].map((node) => node.className),
      ears: [...header.querySelectorAll('[data-dock-pins] [data-ear], [data-titlebar-tabs] .tab-item[aria-current]')].filter(shown).length,
      plusGap: box(header.querySelector('[data-plugin-picker-toggle]')).left - box(drawn.at(-1)).right };
  })()`);
  assert.deepEqual({ pins: page.pins, ears: page.ears }, { pins: ["top-corner"], ears: 1 });
  assert.ok(page.plusGap >= 0 && page.plusGap <= 12, `POLISH-03: ＋ is within 12px of the last tab (${page.plusGap}px)`);

  // Settings is a tab like the others: after them, with its whole name and its close (POLISH-06).
  await evaluate("document.querySelector('[data-directory-open=settings]').click()");
  await waitFor("document.querySelector('[data-titlebar-tabs] [data-cover-chip=settings]')");
  const cover = await evaluate<{ afterTabs: boolean; nameWhole: boolean; close: boolean; ears: number }>(`(() => {
    const { header, shown } = ${READ};
    const chip = header.querySelector('[data-cover-chip=settings]'), name = chip.querySelector(':scope > span');
    return { afterTabs: chip.previousElementSibling?.matches('.tab-scroll') === true, nameWhole: name.scrollWidth <= name.clientWidth && name.textContent.length > 0,
      close: shown(chip.querySelector('[data-cover-close]')), ears: [...header.querySelectorAll('[data-dock-pins] [data-ear]')].length };
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
  await waitFor("document.body.dataset.desktopSurface === 'home' && document.querySelector('.workbench-header[data-dock-drawn] [data-top-corner-toggle]')");
  const read = () => evaluate<{ height: number; rows: number; overflow: boolean; has: string[]; stageTop: number; place: { width: number; text: string } }>(`(() => {
    const { header, shown, box } = ${READ};
    const parts = [...header.children].filter(shown);
    const has = ['[data-workspace-history=back]', '[data-top-corner-toggle]', '[data-plugin-picker-toggle]', '[data-side-toggle]', '.titlebar-end'].filter((selector) => shown(header.querySelector(selector)));
    const place = header.querySelector('[data-top-corner-toggle]');
    return { height: box(header).height, rows: new Set(parts.map((part) => box(part).top + box(part).height / 2)).size, overflow: document.documentElement.scrollWidth > innerWidth || parts.some((part) => box(part).right > innerWidth),
      has, stageTop: box(document.querySelector('[data-plugin-stage]')).top, place: { width: box(place).width, text: [...place.children].filter((node) => shown(node) && !node.classList.contains('top-corner-count')).map((node) => node.textContent.trim()).join('') } };
  })()`);
  // POLISH-07, §4 第 6 条: at 540px and under the row has no way back (the first place takes its 44px; the mock has none).
  const whole = ["[data-top-corner-toggle]", "[data-plugin-picker-toggle]", "[data-side-toggle]", ".titlebar-end"];
  const home = await read();
  assert.deepEqual({ height: home.height, rows: home.rows, overflow: home.overflow, stageTop: home.stageTop }, { height: 44, rows: 1, overflow: false, stageTop: 44 }, "POLISH-07: one 44px row and the work area starts right under it");
  assert.deepEqual(home.has, whole, "the first place, ＋, the side's switch and the project");
  assert.equal(home.place.text, "项目主页", "§4 第 6 条: at 540px and under the first place names the page alone");

  // With a tab open the row holds the current tab and 全部标签 as well, and is still one row.
  await click('[data-plugin-strip] [data-plugin-id="pages"]');
  await waitFor("document.body.dataset.desktopSurface === 'pages' && document.querySelector('[data-titlebar-tabs] .tab-item[aria-current][data-plugin=pages]')");
  const tabbed = await read();
  assert.deepEqual({ height: tabbed.height, rows: tabbed.rows, overflow: tabbed.overflow }, { height: 44, rows: 1, overflow: false }, "POLISH-07: still one row with a tab open");
  // The first place stays in the row; while a tab is current the tab names the page, and the place is its ⌂ alone (plus any waiting count), at least a 44px target.
  assert.deepEqual(tabbed.has, whole);
  assert.equal(tabbed.place.text, "");
  assert.ok(tabbed.place.width >= 44, `the collapsed first place stays a 44px target (${tabbed.place.width}px)`);
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

// §4「底栏第十三版」第 1 条 (mock helm.html, screen 34): ⌂ is in the first place, 「项目 › 项目主页」; pressed, it always opens its
// list, and only choosing in it changes the page. The items of 62～64 are 37-2's; what is checked here is the project and its home.
test("the first place names the project and opens its list; the tabs and the start page around it (POLISH-01, POLISH-02, POLISH-04, POLISH-62, POLISH-63, POLISH-64)", { timeout: 240_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
  const key = async (name: string, code: string) => {
    for (const type of ["keyDown", "keyUp"] as const) await command("Input.dispatchKeyEvent", { type, key: name, code, windowsVirtualKeyCode: name === "Escape" ? 27 : 0 }, sessionId);
  };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home' && document.querySelector('.workbench-header[data-dock-drawn] [data-top-corner-toggle][data-ear]')");
  /** What the page is: what shows, which tabs are open and which is current, the place's marks, and whether its list is open. */
  const state = () => evaluate<{ surface: string; tabs: string[]; current: string | null; ear: boolean; here: string | null; open: boolean; expanded: string | null }>(`(() => {
    const { header } = ${READ};
    const toggle = header.querySelector('[data-top-corner-toggle]');
    return { surface: document.body.dataset.desktopSurface, tabs: [...header.querySelectorAll('[data-titlebar-tabs] .tab-item[data-tab-kind=plugin]')].map((tab) => tab.dataset.plugin),
      current: header.querySelector('[data-titlebar-tabs] .tab-item[aria-current]')?.dataset.plugin ?? null, ear: toggle.hasAttribute('data-ear'), here: toggle.getAttribute('aria-current'),
      open: !header.querySelector('[data-top-corner-list]').hidden, expanded: toggle.getAttribute('aria-expanded') };
  })()`);

  // POLISH-62: the place names the project and its home, and is the home's ear while that page shows.
  const place = await evaluate<{ project: string; page: string; label: string | null }>(`(() => {
    const { header } = ${READ};
    const toggle = header.querySelector('[data-top-corner-toggle]');
    return { project: toggle.querySelector('.top-corner-project-name').textContent.trim(), page: toggle.querySelector('.top-corner-page-name').textContent.trim(), label: toggle.getAttribute('aria-label') };
  })()`);
  assert.ok(place.project.length > 0, "POLISH-62: the place names the project");
  assert.equal(place.page, "项目主页", "POLISH-62: with no item chosen it reads the project and 项目主页");
  assert.ok(place.label?.includes(place.project) && place.label.includes("项目主页"), "and says both to a screen reader");
  const before = await state();
  assert.deepEqual(before, { surface: "home", tabs: [], current: null, ear: true, here: "page", open: false, expanded: "false" });

  // Pressed, it opens its list: the projects, this one pressed and marked 当前, and its pages, 项目主页 the current one with the focus.
  await click("[data-top-corner-toggle]");
  await waitFor("!document.querySelector('[data-top-corner-list]').hidden");
  const list = await evaluate<{ projects: number; pressed: string[]; mark: string; pages: string[]; current: string[]; focus: boolean; inWindow: boolean }>(`(() => {
    const { header, shown, box } = ${READ};
    const list = header.querySelector('[data-top-corner-list]'), rows = [...list.querySelectorAll('[data-corner-project]')];
    const pages = [...list.querySelectorAll('[data-corner-pages]')].filter(shown), rect = box(list);
    return { projects: rows.length, pressed: rows.filter((row) => row.getAttribute('aria-pressed') === 'true').map((row) => row.dataset.cornerProject),
      mark: rows.find((row) => row.getAttribute('aria-pressed') === 'true')?.querySelector('small')?.textContent.trim() ?? '',
      pages: pages.map((group) => group.dataset.cornerPages), current: [...list.querySelectorAll('[aria-current=page]')].filter(shown).map((node) => node.textContent.trim()),
      focus: document.activeElement?.matches('[data-corner-home]') === true, inWindow: rect.left >= 0 && rect.right <= innerWidth };
  })()`);
  assert.ok(list.projects >= 1);
  assert.deepEqual({ pressed: list.pressed, mark: list.mark, pages: list.pages, current: list.current, focus: list.focus, inWindow: list.inWindow },
    { pressed: [projectId], mark: "当前", pages: [projectId], current: ["项目主页"], focus: true, inWindow: true }, "POLISH-62: the list has this project's home, marked as the current one");
  // POLISH-62: looking changes nothing — pressing the project only shows its pages, and Esc closes the list onto the place.
  await click(`[data-corner-project="${projectId}"]`);
  await key("Escape", "Escape");
  await waitFor("document.querySelector('[data-top-corner-list]').hidden && document.activeElement?.matches('[data-top-corner-toggle]')");
  assert.deepEqual(await state(), before, "POLISH-62: opening the list and looking in it changed nothing");

  // A plugin's own page is a tab; the place is no longer the ear or the current page (POLISH-01: one named tab grows on the sheet).
  await click('[data-plugin-picker-popover] [data-plugin-id="pages"]');
  await waitFor("document.body.dataset.desktopSurface === 'pages' && document.querySelector('[data-titlebar-tabs] .tab-item[aria-current][data-plugin=pages]')");
  const ears = () => evaluate<{ ears: number; named: boolean }>(`(() => {
    const { header, shown } = ${READ};
    const ears = [...header.querySelectorAll('[data-ear]')].filter(shown), name = ears[0]?.querySelector('.tab-item-name');
    return { ears: ears.length, named: Boolean(name) && shown(name) && name.textContent.trim().length > 0 };
  })()`);
  assert.deepEqual(await ears(), { ears: 1, named: true }, "POLISH-01: on a plugin's page one tab, with its name, grows on the sheet");
  const onPages = await state();
  assert.deepEqual({ ear: onPages.ear, here: onPages.here, tabs: onPages.tabs }, { ear: false, here: null, tabs: ["pages"] });

  // POLISH-63: choosing 项目主页 in the list takes the page there: the place is the ear again and no tab is current.
  // POLISH-64: the tabs are the pages that were opened and not closed — going home neither opens nor closes one.
  await click("[data-corner-home]");
  await waitFor("document.body.dataset.desktopSurface === 'home' && document.querySelector('[data-top-corner-toggle][data-ear]')");
  assert.deepEqual(await state(), { ...before, tabs: ["pages"] }, "POLISH-63, POLISH-64: home is shown, the place is current, the opened tab stays");
  // A press outside the open list closes it and changes nothing.
  await click("[data-top-corner-toggle]");
  await waitFor("!document.querySelector('[data-top-corner-list]').hidden");
  await click("[data-plugin-stage]");
  await waitFor("document.querySelector('[data-top-corner-list]').hidden");
  assert.deepEqual(await state(), { ...before, tabs: ["pages"] }, "POLISH-62: a press outside closes the list and changes nothing");

  // POLISH-04: with no tab current ＋ stands near the place; the start page hangs from it: its left edge at ＋'s, no wider than
  // 560px, search the first thing in it to take the focus.
  await click("[data-plugin-picker-toggle]");
  await waitFor("!document.querySelector('[data-plugin-picker-popover]').hidden");
  const start = await evaluate<{ left: number; plus: number; width: number; first: boolean }>(`(() => {
    const { header, shown, box } = ${READ};
    const page = header.querySelector('[data-plugin-picker-popover]');
    const first = [...page.querySelectorAll('button, a[href], input, [tabindex]:not([tabindex="-1"])')].find(shown);
    return { left: box(page).left, plus: box(header.querySelector('[data-plugin-picker-toggle]')).left, width: box(page).width, first: first?.matches('[data-global-search-open]') === true };
  })()`);
  assert.ok(Math.abs(start.left - start.plus) <= 1, `POLISH-04: the start page's left edge is ＋'s (${start.left} / ${start.plus})`);
  assert.ok(start.width <= 560, `POLISH-04: no wider than 560px (${start.width}px)`);
  assert.equal(start.first, true, "POLISH-04: search is its first control");
  await key("Escape", "Escape");
  await waitFor("document.querySelector('[data-plugin-picker-popover]').hidden");

  // POLISH-02: each tab carries its own plugin's glyph and says the plugin's name once at most; the other plugins' tabs stay when
  // another is chosen; at 1440 and 1024 no tab's glyph is cut.
  for (const plugin of ["todo", "goals"]) {
    await click(`[data-plugin-picker-popover] [data-plugin-id="${plugin}"]`);
    await waitFor(`document.querySelector('[data-titlebar-tabs] .tab-item[aria-current][data-plugin=${plugin}]')`);
    assert.deepEqual(await ears(), { ears: 1, named: true }, `POLISH-01: on ${plugin}'s page one named tab grows on the sheet`);
  }
  for (const width of [1440, 1024]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await waitFor(`innerWidth === ${width}`);
    const tabs = await evaluate<{ plugin: string; glyph: boolean; repeats: boolean; cut: boolean }[]>(`(() => {
      const { header, shown } = ${READ};
      return [...header.querySelectorAll('[data-titlebar-tabs] .tab-item[data-tab-kind=plugin]')].filter(shown).map((tab) => {
        const glyph = tab.querySelector('svg.tab-item-icon'), name = tab.querySelector('.tab-item-name')?.textContent.trim() ?? '';
        const entry = document.querySelector('[data-plugin-picker-popover] [data-plugin-id="' + tab.dataset.plugin + '"] > span')?.textContent.trim() ?? '';
        const g = glyph?.getBoundingClientRect();
        let cut = !g || g.width === 0;
        for (let node = glyph?.parentElement; g && node && node !== tab.parentElement; node = node.parentElement) {
          if (getComputedStyle(node).overflow === 'visible') continue;
          const b = node.getBoundingClientRect();
          if (g.left < b.left - 0.5 || g.right > b.right + 0.5 || g.top < b.top - 0.5 || g.bottom > b.bottom + 0.5) cut = true;
        }
        return { plugin: tab.dataset.plugin, glyph: shown(glyph), repeats: Boolean(entry) && name.split(entry).length > 2, cut };
      });
    })()`);
    assert.deepEqual(tabs.map((tab) => tab.plugin), ["pages", "todo", "goals"], `POLISH-02 · ${width}: switching plugins keeps the other plugins' tabs`);
    assert.deepEqual(tabs.filter((tab) => !tab.glyph || tab.repeats || tab.cut), [], `POLISH-02 · ${width}: every tab has its plugin's glyph, whole, and the plugin's name at most once`);
  }
});

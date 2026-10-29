import assert from "node:assert/strict";
import test from "node:test";
import { openAuditBrowser } from "./fixtures/workbench-audit-browser.js";

test("W1-18-TAB-FORMAT-01: real item tabs, collapsed user groups and a nested split restore; unsupported stored tabs are discarded instead of converted", { timeout: 120_000 }, async t => {
  const browser = await openAuditBrowser(t); if (!browser) return;
  await browser.click('[data-plugin-strip] [data-plugin-id="goals"]');
  await browser.waitFor("document.querySelector('.tree-node[data-select-goal=CORE]')?.getClientRects().length > 0", 15_000);
  await browser.openGoalFrame('.tree-node[data-select-goal="CORE"]');
  await browser.waitFor("document.querySelector('.tab-item[aria-current][data-item-id=CORE]')");
  await browser.evaluate("document.querySelector('.tab-item[aria-current] .tab-item-trigger').focus()");
  await browser.command("Input.dispatchKeyEvent", { type: "keyDown", key: "F10", code: "F10", windowsVirtualKeyCode: 121, modifiers: 8 }, browser.sessionId);
  await browser.waitFor("document.querySelector('[data-workspace-tab-menu]').matches(':popover-open')");
  await browser.click("[data-tab-menu-action=new-group]");
  await browser.click(".tab-group-label");
  await browser.waitFor("!!document.querySelector('.tab-group[data-collapsed=true]')");
  await browser.click("[data-tab-split]"); await browser.click('[data-layout-split="right"]');
  await browser.waitFor("document.querySelectorAll('[data-tab-pane]').length === 2");
  const key = "molis-work-tab-workspace:" + browser.projectId;
  await browser.evaluate(`(() => { const state=JSON.parse(localStorage.getItem(${JSON.stringify(key)}));
    document.querySelector('[data-tab-pane="'+state.focusedPaneId+'"] [data-tab-edge=bottom]').click(); })()`);
  await browser.waitFor("document.querySelectorAll('[data-tab-pane]').length === 3");
  const saved = await browser.evaluate<string>(`localStorage.getItem(${JSON.stringify(key)})`);
  const before = JSON.parse(saved) as { panes: Array<{ tabs: Array<{ kind: string; itemId?: string }>; groups: Array<{ collapsed: boolean }> }> };
  assert.equal(before.panes.length, 3);
  assert.ok(before.panes.every(pane => pane.tabs.some(tab => tab.kind === "item" && tab.itemId === "CORE")));
  assert.ok(before.panes.some(pane => pane.groups.some(group => group.collapsed)));
  assert.equal(await browser.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).layout.tree.children[1].direction`), "column");
  await browser.reloadPage();
  await browser.waitFor("document.querySelectorAll('[data-tab-pane]').length === 3", 15_000);
  assert.deepEqual(JSON.parse(await browser.evaluate<string>(`localStorage.getItem(${JSON.stringify(key)})`)), JSON.parse(saved));
  assert.equal(await browser.evaluate("document.querySelector('.tab-item[data-tab-kind=mother], .tab-item[data-preview]')"), null);
  await browser.waitFor("document.querySelectorAll('.tab-content-frame').length === 3", 15_000);
  await browser.waitFor("[...document.querySelectorAll('.tab-content-frame')].every(frame=>frame.contentDocument?.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'CORE')", 15_000);

  for (const change of [
    "tab.kind='mother'", "tab.preview=true", "pane.collapsed=true",
    "tab.plugin='task';tab.kind='task';tab.goalId='CORE';delete tab.itemId",
    "tab.plugin='task';tab.kind='item'", "tab.goalView='canvas'",
  ]) {
    await browser.evaluate(`(() => { const stored=${saved},pane=stored.panes[0],tab=pane.tabs.find(row=>row.kind==='item');${change};
      localStorage.setItem(${JSON.stringify(key)},JSON.stringify(stored)); })()`);
    await browser.reloadPage();
    await browser.waitFor("document.querySelectorAll('[data-tab-pane]').length === 1", 15_000);
    const current = JSON.parse(await browser.evaluate<string>(`localStorage.getItem(${JSON.stringify(key)})`)) as typeof before;
    assert.equal(current.panes.length, 1, change);
    assert.ok(current.panes.every(pane => pane.tabs.every(tab => tab.kind === "home")), change + " starts from current Home rather than converting the old item");
    assert.equal(await browser.evaluate("document.querySelector('.tab-item[data-tab-kind=mother], .tab-item[data-preview]')"), null);
  }
});

test("personal Home uses the bottom navigation while Goals retains its current plugin group", { timeout: 90_000 }, async t => {
  const browser = await openAuditBrowser(t); if (!browser) return;
  await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + "/projects/personal/" }, browser.sessionId));
  await browser.waitFor("document.body.dataset.projectId === 'personal' && document.body.dataset.desktopSurface === 'home'", 15_000);

  const duplicatePrimaryEntry = "[data-titlebar-tabs] :is([data-plugin=home], .tab-view-chip)";
  assert.equal(await browser.evaluate(`document.querySelector(${JSON.stringify(duplicatePrimaryEntry)})`), null);
  assert.equal(await browser.evaluate("Boolean(document.querySelector('[data-plugin-strip] [data-plugin-id=home]'))"), true);
  assert.equal(await browser.evaluate("Boolean(document.querySelector('[data-plugin-strip] [data-plugin-id=goals]'))"), true);

  await browser.click('[data-plugin-strip] [data-plugin-id="goals"]');
  // PTG-01/PTG-07: the current plugin tab replaces the removed location chip.
  await browser.waitFor("document.body.dataset.desktopSurface === 'goals' && document.querySelector('[data-titlebar-tabs] [data-plugin-group=goals] .tab-item[aria-current][data-tab-kind=plugin]')", 15_000);
  assert.equal(await browser.evaluate(`document.querySelector(${JSON.stringify(duplicatePrimaryEntry)})`), null);
  await browser.waitFor("document.querySelector('[data-create-dialog]')?.open === true");
  await browser.click('[data-create-dialog] [data-close-create]');
  await browser.waitFor("document.querySelector('[data-create-dialog]')?.open === false");
  await browser.click('[data-plugin-strip] [data-plugin-id="home"]');
  await browser.waitFor("document.body.dataset.desktopSurface === 'home' && !document.querySelector('[data-titlebar-tabs] [data-plugin=home]')", 15_000);
  await browser.click('[data-titlebar-tabs] .tab-item[data-plugin="goals"][data-tab-kind="plugin"] .tab-item-trigger');
  await browser.waitFor("document.body.dataset.desktopSurface === 'goals'", 15_000);
  await browser.reloadPage();
  await browser.waitFor("!document.querySelector('[data-titlebar-tabs] [data-plugin=home]') && document.querySelectorAll('[data-titlebar-tabs] .tab-item[data-plugin=goals][data-tab-kind=plugin]').length === 1", 15_000);
});

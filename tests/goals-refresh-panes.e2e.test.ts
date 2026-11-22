import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { boardSnapshot } from "./fixtures/goal-application.js";

test("QEA-113 split Goal documents follow actual pane visibility through focus, solo, cover and narrow layout", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  await b.setViewport(1440, 1000);
  const prefix = `/projects/${b.projectId}`, panes = "[...document.querySelectorAll('[data-tab-pane]')]";
  const doc = "pane.querySelector('[data-goal-event-document]')";
  const mark = () => b.evaluate(`${panes}.forEach(pane => { pane.__beforeProjection = ${doc}; pane.__beforeCursor = pane.querySelector('[data-document-pane]')?.dataset.boardCursor || ''; })`);
  const add = (id: string) => b.web.post(prefix + "/api/plugins/io.molis.work.goals/goals", { goal_id: id, title: id, outcome: "Follow current pane visibility", priority: 10 });
  const collection = async (id: string, visibleOnly = false) => {
    try {
      await b.waitFor(`document.querySelectorAll('iframe.tab-content-frame').length === 0 && Boolean(document.querySelector('.tree-node[data-select-goal="${id}"]')) && ${panes}.length === 2 && ${panes}.filter(pane => ${visibleOnly ? "pane.checkVisibility({visibilityProperty:true})" : "true"}).every(pane => ${doc} && ${doc} !== pane.__beforeProjection && pane.querySelector('[data-document-pane]')?.dataset.boardCursor === String(document.querySelector('#molis-work-data').boardCursor))`, 15_000);
    } catch (error) {
      t.diagnostic(JSON.stringify(await b.evaluate(`({ boardCursor: document.querySelector('#molis-work-data').boardCursor, treeFound: !!document.querySelector('.tree-node[data-select-goal="${id}"]'), panes: ${panes}.map(pane => ({ id: pane.dataset.tabPane, shown: pane.checkVisibility({visibilityProperty:true}), cursor: pane.querySelector('[data-document-pane]')?.dataset.boardCursor, beforeCursor: pane.__beforeCursor, replaced: ${doc} !== pane.__beforeProjection })) })`)));
      throw error;
    }
  };
  const fresh = () => b.waitFor(`${panes}.every(pane => ${doc} && ${doc} !== pane.__beforeProjection)`, 12_000);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/goals/V1?desktop=1" }, b.sessionId));
  await b.click('[data-layout-open]'); await b.click('[data-layout-split=right]');
  await b.waitFor(`${panes}.length === 2 && document.querySelectorAll('iframe.tab-content-frame').length === 0 && ${panes}.every(pane => pane.querySelector('[data-goal-frame-surface]')?.hidden === false)`, 15_000);
  await b.evaluate(`${panes}.forEach(pane => pane.querySelector('[data-frame-goal-work]').click())`);
  await b.waitFor(`${panes}.every(pane => pane.querySelector('[data-goal-node-workspace]')?.hidden === false)`);
  await b.evaluate(`${panes}.forEach(pane => { const toggle = pane.querySelector('[data-goal-details-toggle]'); if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click(); })`);
  await b.waitFor(`${panes}.every(pane => pane.checkVisibility({visibilityProperty:true}) && pane.querySelector('[data-document-pane] [data-work-surface=goals]')?.checkVisibility({visibilityProperty:true}) && pane.querySelector('[data-goal-event-document]'))`, 15_000);
  assert.equal(await b.evaluate(`${panes}.filter(pane => pane.classList.contains('is-focused')).length`), 1);
  await mark(); await add("SPLIT-VISIBLE"); await collection("SPLIT-VISIBLE"); await fresh();

  await b.click('[data-layout-open]'); await b.click('[data-layout-action=solo]');
  await b.waitFor("document.querySelector('[data-tab-workspace]').hasAttribute('data-solo')");
  await mark(); await add("SPLIT-SOLO"); await collection("SPLIT-SOLO", true);
  assert.equal(await b.evaluate(`${panes}.filter(pane => !pane.checkVisibility({visibilityProperty:true})).length`), 1);
  assert.equal(await b.evaluate(`${panes}.filter(pane => !pane.checkVisibility({visibilityProperty:true})).every(pane => ${doc} === pane.__beforeProjection)`), true);
  await b.click('[data-layout-open]'); await b.click('[data-layout-action=solo]'); await collection("SPLIT-SOLO"); await fresh();

  await b.click('[data-directory-open="settings"]');
  await b.waitFor("document.querySelector('[data-tab-workspace]').dataset.exclusive === 'settings'");
  await mark(); await add("SPLIT-COVERED");
  // The outer workbench owns the background directory; covered panes keep their current document untouched until uncovered.
  await b.waitFor("document.querySelector('.tree-node[data-select-goal=SPLIT-COVERED]')", 12_000);
  assert.equal(await b.evaluate(`${panes}.every(pane => !pane.checkVisibility({visibilityProperty:true}) && ${doc} === pane.__beforeProjection)`), true);
  await b.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, b.sessionId);
  await b.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, b.sessionId);
  await b.waitFor("!document.querySelector('[data-tab-workspace]').dataset.exclusive");
  await collection("SPLIT-COVERED"); await fresh();

  await b.setViewport(700, 1000);
  await b.waitFor(`${panes}.filter(pane => pane.checkVisibility({visibilityProperty:true})).length === 1`);
  await mark(); await add("SPLIT-NARROW"); await collection("SPLIT-NARROW", true);
  assert.equal(await b.evaluate(`${panes}.filter(pane => !pane.checkVisibility({visibilityProperty:true})).every(pane => ${doc} === pane.__beforeProjection)`), true);
  const after = boardSnapshot(b.store, DEMO_PROJECT_ID);
  await b.setViewport(1440, 1000); await collection("SPLIT-NARROW"); await fresh();
  assert.deepEqual(boardSnapshot(b.store, DEMO_PROJECT_ID), after, "pane visibility does not change business facts");
});

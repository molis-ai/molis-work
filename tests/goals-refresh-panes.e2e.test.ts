import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { boardSnapshot } from "./fixtures/goal-application.js";

test("QEA-113 split Goal documents follow actual pane visibility through focus, solo, cover and narrow layout", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  await b.setViewport(1440, 1000);
  const prefix = `/projects/${b.projectId}`, frames = "[...document.querySelectorAll('iframe.tab-content-frame')]";
  const doc = "frame.contentDocument.querySelector('[data-goal-event-document]')";
  const mark = () => b.evaluate(`${frames}.forEach(frame => { frame.contentWindow.__beforeProjection = ${doc}; })`);
  const add = (id: string) => b.web.post(prefix + "/api/plugins/io.molis.work.goals/goals", { goal_id: id, title: id, outcome: "Follow current pane visibility", priority: 10 });
  const collection = async (id: string, visibleOnly = false) => {
    try { await b.waitFor(`${frames}.length === 2 && ${frames}.filter(frame => ${visibleOnly ? "frame.checkVisibility({visibilityProperty:true})" : "true"}).every(frame => frame.contentDocument.querySelector('.tree-node[data-select-goal="${id}"]'))`, 15_000); }
    catch (error) {
      t.diagnostic(JSON.stringify(await b.evaluate(`${frames}.map(frame => ({ id:frame.dataset.paneOwner, hidden:frame.hidden, ancestor:frame.closest('[hidden]')?.outerHTML.slice(0,120), shown:frame.checkVisibility({visibilityProperty:true}), documentHidden:frame.contentDocument.hidden, cursor:frame.contentDocument.querySelector('#molis-work-data').boardCursor, found:!!frame.contentDocument.querySelector('.tree-node[data-select-goal="${id}"]'), requests:frame.contentWindow.__projectionReads }))`)));
      throw error;
    }
  };
  const fresh = () => b.waitFor(`${frames}.every(frame => ${doc} !== frame.contentWindow.__beforeProjection)`, 12_000);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/goals/V1?desktop=1" }, b.sessionId));
  await b.click('[data-layout-open]'); await b.click('[data-layout-split=right]');
  await b.waitFor(`${frames}.length === 2 && ${frames}.every(frame => frame.contentDocument?.querySelector('[data-goal-frame-surface]')?.hidden === false)`, 15_000);
  await b.evaluate(`${frames}.forEach(frame => frame.contentDocument.querySelector('[data-frame-goal-work]').click())`);
  await b.waitFor(`${frames}.every(frame => frame.contentDocument.querySelector('[data-goal-node-workspace]')?.hidden === false)`);
  await b.evaluate(`${frames}.forEach(frame => { const toggle = frame.contentDocument.querySelector('[data-goal-details-toggle]'); if (toggle.getAttribute('aria-expanded') === 'false') toggle.click(); })`);
  await b.waitFor(`${frames}.every(frame => frame.checkVisibility({visibilityProperty:true}) && frame.contentDocument.querySelector('[data-document-pane] [data-work-surface=goals]').checkVisibility({visibilityProperty:true}))`);
  assert.equal(await b.evaluate(`${frames}.filter(frame => frame.classList.contains('is-focused')).length`), 1);
  await b.evaluate(`${frames}.forEach(frame => { const view=frame.contentWindow, original=view.fetch.bind(view); view.__projectionReads=[]; view.fetch=(input,options)=>{ const url=new URL(String(input),view.location.href); if(url.pathname.endsWith('/api/board/refresh'))view.__projectionReads.push(url.search); return original(input,options); }; })`);
  await mark(); await add("SPLIT-VISIBLE"); await collection("SPLIT-VISIBLE"); await fresh();

  await b.click('[data-layout-open]'); await b.click('[data-layout-action=solo]');
  await b.waitFor("document.querySelector('[data-tab-workspace]').hasAttribute('data-solo')");
  await mark(); await add("SPLIT-SOLO"); await collection("SPLIT-SOLO", true);
  assert.equal(await b.evaluate(`${frames}.filter(frame => !frame.checkVisibility({visibilityProperty:true})).length`), 1);
  assert.equal(await b.evaluate(`${frames}.filter(frame => !frame.checkVisibility({visibilityProperty:true})).every(frame => ${doc} === frame.contentWindow.__beforeProjection)`), true);
  await b.click('[data-layout-open]'); await b.click('[data-layout-action=solo]'); await collection("SPLIT-SOLO"); await fresh();

  await b.click('[data-directory-open="settings"]');
  await b.waitFor("document.querySelector('[data-tab-workspace]').dataset.exclusive === 'settings'");
  await mark(); await add("SPLIT-COVERED");
  // Embedded pane documents intentionally have no attention client. The outer workbench owns the background directory;
  // hidden panes resume their own current read when shown, instead of each opening a second attention stream.
  await b.waitFor("document.querySelector('.tree-node[data-select-goal=SPLIT-COVERED]')", 12_000);
  assert.equal(await b.evaluate(`${frames}.every(frame => !frame.checkVisibility({visibilityProperty:true}) && ${doc} === frame.contentWindow.__beforeProjection)`), true);
  await b.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, b.sessionId);
  await b.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, b.sessionId);
  await b.waitFor("!document.querySelector('[data-tab-workspace]').dataset.exclusive");
  await collection("SPLIT-COVERED"); await fresh();

  await b.setViewport(700, 1000);
  await b.waitFor(`${frames}.filter(frame => frame.checkVisibility({visibilityProperty:true})).length === 1`);
  await mark(); await add("SPLIT-NARROW"); await collection("SPLIT-NARROW", true);
  assert.equal(await b.evaluate(`${frames}.filter(frame => !frame.checkVisibility({visibilityProperty:true})).every(frame => ${doc} === frame.contentWindow.__beforeProjection)`), true);
  const after = boardSnapshot(b.store, DEMO_PROJECT_ID);
  await b.setViewport(1440, 1000); await collection("SPLIT-NARROW"); await fresh();
  assert.deepEqual(boardSnapshot(b.store, DEMO_PROJECT_ID), after, "pane visibility does not change business facts");
});

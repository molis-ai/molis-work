import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

test("SYS-15 Schedule isolated page creates, edits, pauses, reopens, resumes and archives persisted tasks", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "schedule");
  const api = `/projects/${browser.projectId}/api/plugins/io.molis.work.schedule`;
  const open = async () => {
    await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?openPlugin=schedule` }, browser.sessionId));
    await browser.surfaceReady("schedule");
  };
  await open();
  assert.equal(await child.evaluate("(()=>{try{return Boolean(parent.document)}catch(error){return error.name}})()"), "SecurityError");
  // The stage chrome can still be settling behind the surface's loading flag on a slow runner; wait for the button to be laid out
  // before a real pointer press, rather than pressing a hidden target (the CI shard 4 failure).
  await child.waitFor("document.querySelector('[data-schedule-new]')?.getClientRects().length > 0", 20_000);
  await child.click('[data-schedule-new]');
  await child.waitFor("!document.querySelector('[data-schedule-create-pane]').hidden");
  await child.evaluate(`(()=>{const form=document.querySelector('[data-schedule-create-form]');form.elements.title.value='Isolated daily task';form.elements.instructions.value='Read the current project';form.elements.time.value='10:30';})()`);
  await child.click('[data-schedule-create-form] button[type=submit]');
  await child.waitFor("document.querySelector('[data-schedule-task-id]') && document.querySelector('[data-schedule-create-pane]').hidden");
  const tasks = await browser.web.get<{ tasks: Array<{ task_id: string; title: string; enabled: boolean; clock_label: string }> }>(api + '/list');
  assert.equal(tasks.tasks.length, 1); assert.equal(tasks.tasks[0]!.title, 'Isolated daily task');
  await child.click('[data-schedule-task-edit]');
  await child.waitFor("!document.querySelector('[data-schedule-create-pane]').hidden");
  await child.evaluate("document.querySelector('[data-schedule-create-form]').elements.title.value='Updated daily task'");
  await child.click('[data-schedule-create-form] button[type=submit]');
  await child.waitFor("document.querySelector('[data-schedule-detail] h1')?.textContent==='Updated daily task' && document.querySelector('[data-schedule-create-pane]').hidden");
  await child.click('[data-schedule-task-enabled-action=false]');
  await child.waitFor("document.querySelector('[data-schedule-task-enabled-action=true]')");
  await open();
  // Reload may restore the selected task's detail, where the directory is intentionally collapsed.
  await child.waitFor("document.querySelector('[data-schedule-task-enabled-action=true]') || document.querySelector('[data-schedule-row]')?.getClientRects().length");
  if (!await child.evaluate("Boolean(document.querySelector('[data-schedule-task-enabled-action=true]'))")) await child.click('[data-schedule-row]');
  await child.waitFor("document.querySelector('[data-schedule-task-enabled-action=true]')");
  assert.equal((await browser.web.get<typeof tasks>(api + '/list')).tasks[0]!.enabled, false);
  await child.click('[data-schedule-task-enabled-action=true]');
  await child.waitFor("document.querySelector('[data-schedule-task-enabled-action=false]')");
  await child.click('[data-schedule-task-archive]');
  await child.waitFor("document.querySelector('dialog[data-page-dialog]')?.open");
  await child.click('dialog[data-page-dialog] button[type=submit]');
  await child.waitFor("document.querySelector('[data-schedule-empty]')");
  assert.deepEqual((await browser.web.get<typeof tasks>(api + '/list')).tasks, []);
});

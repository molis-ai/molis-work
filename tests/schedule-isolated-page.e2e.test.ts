import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { SCHEDULE_ACTION_PERMISSIONS, scheduleActions } from "@molis-ai/molis-work-plugin-schedule";
import { molisWorkHostProjectReference, scheduleServiceFor } from "@molis-ai/molis-work-app-local-host";

test("SYS-15 Schedule isolated page creates, edits, pauses, reopens, resumes and archives persisted tasks", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  // The stage keeps its new-task chrome on a desktop window; the CI browser can start at a 780px window, where the narrow stage
  // hides the directory chrome (the shard 4 failure). Set the size the test describes before looking for the button.
  await browser.setViewport(1440, 900);
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
  // A daily task's edit offers its time; a one-off task's (marked by its detail, as a risk's review is) leaves the field out, so
  // an edit cannot look like it moved the time and keep the old one (PR #2058 评审台小修).
  const timeField = "(()=>{const input=document.querySelector('[data-schedule-create-form]').elements.time;return {disabled:input.disabled,shown:input.closest('.schedule-time-field').getClientRects().length>0};})()";
  await child.click('[data-schedule-task-edit]');
  await child.waitFor("!document.querySelector('[data-schedule-create-pane]').hidden");
  assert.deepEqual(await child.evaluate(timeField), { disabled: false, shown: true }, "a daily task's edit shows its time");
  await child.click('[data-schedule-create-close]');
  await child.waitFor("document.querySelector('[data-schedule-create-pane]').hidden");
  await child.evaluate("document.querySelector('[data-schedule-task-time]').setAttribute('data-schedule-task-once','')");
  await child.click('[data-schedule-task-edit]');
  await child.waitFor("!document.querySelector('[data-schedule-create-pane]').hidden");
  assert.deepEqual(await child.evaluate(timeField), { disabled: true, shown: false }, "a one-off task's edit leaves the daily time out");
  await child.click('[data-schedule-create-close]');
  await child.waitFor("document.querySelector('[data-schedule-create-pane]').hidden");
  await child.click('[data-schedule-new]');
  await child.waitFor("!document.querySelector('[data-schedule-create-pane]').hidden");
  assert.deepEqual(await child.evaluate(timeField), { disabled: false, shown: true }, "a new task asks for its time again");
  await child.click('[data-schedule-create-close]');
  await child.waitFor("document.querySelector('[data-schedule-create-pane]').hidden && document.querySelector('[data-schedule-row]')?.getClientRects().length");
  await child.click('[data-schedule-row]');
  await child.waitFor("document.querySelector('[data-schedule-task-enabled-action=false]')?.getClientRects().length");
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

test("96-2 an open task's detail shows the round that just failed and why without a reload; a late answer keeps the newer choice", { timeout: 150_000 }, async t => {
  // The Host is this test's own (no model configured), so the test can reach the project's clock.
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  await browser.setViewport(1440, 900);
  const child = await pluginFrameBrowser(t, browser, "schedule");
  const ref = molisWorkHostProjectReference({ databasePath: browser.databasePath, projectId: browser.projectId! });
  const caller: ActionCallContext = { actor_id: "browser-test", project_id: browser.projectId!, audience: "user", permissions: SCHEDULE_ACTION_PERMISSIONS };
  const actions = browser.localHost!.actionClient(ref);
  // One-off tasks due shortly: their rounds run for real (this Home has no model, so each fails and says why).
  const soon = async (title: string, seconds: number) => (await actions.invoke(caller, scheduleActions.createTask,
    { title, instructions: "Read the project", repeat: "none", at: new Date(Date.now() + seconds * 1000).toISOString() })).task;
  const first = await soon("First round", 12), second = await soon("Second round", 30);
  const other = (await actions.invoke(caller, scheduleActions.createTask, { title: "Other task", instructions: "Read", time: "06:00" })).task;
  // The project's own clock is told the time has come once it has: the wakeup it starts is the real one.
  const round = async (task: { next_due_at: string | null }) => {
    const due = Date.parse(task.next_due_at!);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, due - Date.now()) + 200));
    await browser.localHost!.withProject(ref, runtime => scheduleServiceFor(runtime.store.db).tick(new Date(due + 1000)));
  };
  const row = (id: string) => `[data-schedule-row][data-schedule-task-id="${id}"]`, detail = (id: string) => `[data-schedule-detail="${id}"]`;
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?openPlugin=schedule` }, browser.sessionId));
  await browser.surfaceReady("schedule");
  await child.waitFor(`document.querySelector('${row(first.task_id)}')?.getClientRects().length > 0`, 20_000);
  // Marks this page: a reload would lose it.
  await child.evaluate("window.__scheduleStayed = true");

  await child.click(row(first.task_id));
  await child.waitFor(`!document.querySelector('${detail(first.task_id)}').hidden`);
  assert.equal(await child.evaluate(`document.querySelectorAll('${detail(first.task_id)} .schedule-turn--system').length`), 0);
  const before = { next: await child.evaluate<string>(`document.querySelector('${detail(first.task_id)} .feed-detail-header p').textContent`) };
  await round(first);
  await child.waitFor(`document.querySelector('${detail(first.task_id)} .schedule-turn--system')`, 30_000);
  // A one-off task that ran its time is switched off by Schedule's next pass a few seconds later; the open detail follows that too.
  await child.waitFor(`document.querySelector('${detail(first.task_id)} [data-schedule-task-enabled-action=true]')`, 30_000);
  assert.equal(await child.evaluate("window.__scheduleStayed"), true, "the detail changed in place: the page was not loaded again");
  const shown = await child.evaluate<{ open: boolean; text: string; next: string; resumable: boolean }>(`(() => { const d = document.querySelector('${detail(first.task_id)}');
    return { open: !d.hidden, text: d.querySelector('.schedule-turn--system p').textContent, next: d.querySelector('.feed-detail-header p').textContent, resumable: Boolean(d.querySelector('[data-schedule-task-enabled-action=true]')) }; })()`);
  assert.equal(shown.open, true, "the failed round shows in the detail that was open");
  assert.match(shown.text, /没跑成：\S/, "with the reason it did not run");
  assert.equal(shown.resumable, true, "a one-off task that ran its time is off: the detail offers to turn it back on");
  assert.notEqual(shown.next, before.next, "the detail no longer says the time that has passed");

  // The second task's round lands while the page is read again for it; the person has opened another task by then.
  await child.click(row(second.task_id));
  await child.waitFor(`!document.querySelector('${detail(second.task_id)}').hidden`);
  let held: { requestId: string } | null = null;
  const off = browser.on("Fetch.requestPaused", (event, session) => {
    if (session !== browser.sessionId) return;
    const paused = event as { requestId: string; request: { url: string } };
    if (!held && !new URL(paused.request.url).pathname.includes("/api/")) held = paused;
    else void browser.command("Fetch.continueRequest", { requestId: paused.requestId }, browser.sessionId);
  });
  t.after(off);
  // The shell reads the page document again for the frame (readDocument): that fetch of the workbench page is held, not the
  // revision checks the page makes on its own.
  await browser.command("Fetch.enable", { patterns: [{ urlPattern: `*/projects/${browser.projectId}/*`, resourceType: "Fetch", requestStage: "Request" }] }, browser.sessionId);
  await round(second);
  const deadline = Date.now() + 30_000;
  while (!held && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(held, "the landed round reads the page again");
  await child.click(row(other.task_id));
  await child.waitFor(`!document.querySelector('${detail(other.task_id)}').hidden`);
  await browser.command("Fetch.continueRequest", { requestId: held!.requestId }, browser.sessionId);
  await child.waitFor(`document.querySelector('${detail(second.task_id)} .schedule-turn--system')`, 30_000);
  await browser.command("Fetch.disable", {}, browser.sessionId);
  const after = await child.evaluate<{ open: string[]; selected: string[] }>(`({
    open: [...document.querySelectorAll('[data-schedule-detail]')].filter(d => !d.hidden).map(d => d.dataset.scheduleDetail),
    selected: [...document.querySelectorAll('[data-schedule-row].is-selected')].map(r => r.dataset.scheduleTaskId) })`);
  assert.deepEqual(after, { open: [other.task_id], selected: [other.task_id] }, "the late answer did not take the person's newer choice away");
  assert.equal(await child.evaluate(`document.querySelectorAll('${detail(other.task_id)} .schedule-turn--system').length`), 0, "nothing of the other round is written into it");
  // Opening the second task again shows its failed round.
  await child.click(row(second.task_id));
  await child.waitFor(`!document.querySelector('${detail(second.task_id)}').hidden && document.querySelector('${detail(second.task_id)} .schedule-turn--system')`);
});

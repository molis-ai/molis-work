import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { SCHEDULE_ACTION_PERMISSIONS, handleScheduleTaskWakeup, scheduleActions } from "@molis-ai/molis-work-plugin-schedule";
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
  // A daily task's edit offers its time (a one-off task's: BL-schedule-one-off-detail below).
  const timeField = "(()=>{const input=document.querySelector('[data-schedule-create-form]').elements.time;return {disabled:input.disabled,shown:input.closest('.schedule-time-field').getClientRects().length>0};})()";
  await child.click('[data-schedule-task-edit]');
  await child.waitFor("!document.querySelector('[data-schedule-create-pane]').hidden");
  assert.deepEqual(await child.evaluate(timeField), { disabled: false, shown: true }, "a daily task's edit shows its time");
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
    // The page also reads on its own now (every change through Schedule's actions tells it): a request paused as interception is
    // switched off below is let go by the switch itself, and continuing it then is refused.
    else browser.command("Fetch.continueRequest", { requestId: paused.requestId }, browser.sessionId).catch(() => undefined);
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

test("BL-schedule-one-off-detail editing a real one-off task says the day and time it runs instead of a daily time; a daily task keeps its time", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  await browser.setViewport(1440, 900);
  const child = await pluginFrameBrowser(t, browser, "schedule");
  const ref = molisWorkHostProjectReference({ databasePath: browser.databasePath, projectId: browser.projectId! });
  const caller: ActionCallContext = { actor_id: "browser-test", project_id: browser.projectId!, audience: "user", permissions: SCHEDULE_ACTION_PERMISSIONS };
  const actions = browser.localHost!.actionClient(ref);
  // Made the way a risk's review makes one: by Schedule's action, with a day and a time. Nothing on the page is marked by hand.
  const at = new Date(); at.setDate(at.getDate() + 2); at.setHours(14, 35, 0, 0);
  const once = (await actions.invoke(caller, scheduleActions.createTask, { title: "Review the risk", instructions: "Read the risk", repeat: "none", at: at.toISOString() })).task;
  const daily = (await actions.invoke(caller, scheduleActions.createTask, { title: "Morning summary", instructions: "Read the project", time: "10:30" })).task;
  const row = (id: string) => `[data-schedule-row][data-schedule-task-id="${id}"]`, detail = (id: string) => `[data-schedule-detail="${id}"]`;
  const form = `(() => { const form = document.querySelector('[data-schedule-create-form]'), once = form.querySelector('[data-schedule-form-once]');
    return { time: { disabled: form.elements.time.disabled, shown: form.querySelector('.schedule-time-field').getClientRects().length > 0 },
      once: { shown: once.getClientRects().length > 0, when: once.querySelector('[data-schedule-form-once-at]').textContent } }; })()`;
  type Form = { time: { disabled: boolean; shown: boolean }; once: { shown: boolean; when: string } };
  const edit = async (id: string) => {
    await child.click(row(id));
    await child.waitFor(`!document.querySelector('${detail(id)}').hidden`);
    await child.click(`${detail(id)} [data-schedule-task-edit]`);
    await child.waitFor("!document.querySelector('[data-schedule-create-pane]').hidden");
    return child.evaluate<Form>(form);
  };
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?openPlugin=schedule` }, browser.sessionId));
  await browser.surfaceReady("schedule");
  await child.waitFor(`document.querySelector('${row(once.task_id)}')?.getClientRects().length > 0`, 20_000);

  const oneOff = await edit(once.task_id);
  assert.deepEqual(oneOff.time, { disabled: true, shown: false }, "the daily time is left out of a one-off task's edit");
  assert.equal(oneOff.once.shown, true, "the edit says when the one-off task runs");
  assert.match(oneOff.once.when, /14:35/u, "with its time");
  assert.ok(oneOff.once.when.includes(String(at.getDate())), `and its day (${oneOff.once.when})`);
  // Saving the edit keeps the task one-off at its time.
  await child.evaluate("document.querySelector('[data-schedule-create-form]').elements.title.value='Review the risk again'");
  await child.click('[data-schedule-create-form] button[type=submit]');
  await child.waitFor(`document.querySelector('${detail(once.task_id)} h1')?.textContent === 'Review the risk again' && document.querySelector('[data-schedule-create-pane]').hidden`);
  const saved = (await actions.invoke(caller, scheduleActions.list, {})).tasks.find(task => task.task_id === once.task_id)!;
  assert.deepEqual({ repeat: saved.repeat, run_at: saved.run_at }, { repeat: "none", run_at: at.toISOString() });

  const repeating = await edit(daily.task_id);
  assert.deepEqual(repeating, { time: { disabled: false, shown: true }, once: { shown: false, when: "" } }, "a daily task's edit keeps its own time");
  assert.equal(await child.evaluate<string>("document.querySelector('[data-schedule-create-form]').elements.time.value"), "10:30");
});

test("BL-schedule-view-refresh-followups the open page follows changes made through actions and one made before its first check; a read that answers late draws nothing; reads of its own leave an unread task unread", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  await browser.setViewport(1440, 900);
  const child = await pluginFrameBrowser(t, browser, "schedule");
  const ref = molisWorkHostProjectReference({ databasePath: browser.databasePath, projectId: browser.projectId! });
  // The changes below come through Schedule's actions as the Assistant's or an MCP client's would, not through the page.
  const caller: ActionCallContext = { actor_id: "browser-test", project_id: browser.projectId!, audience: "user", permissions: SCHEDULE_ACTION_PERMISSIONS };
  const actions = browser.localHost!.actionClient(ref);
  const daily = async (title: string, time: string) => (await actions.invoke(caller, scheduleActions.createTask, { title, instructions: "Read the project", time, notify_important: true })).task;
  const alpha = await daily("Alpha", "06:00"), beta = await daily("Beta", "07:00");
  const rename = (task: typeof alpha, title: string) => actions.invoke(caller, scheduleActions.updateTask, { task_id: task.task_id, title, instructions: "Read the project", time: task.clock_label, notify_important: true });
  const row = (id: string) => `[data-schedule-row][data-schedule-task-id="${id}"]`, detail = (id: string) => `[data-schedule-detail="${id}"]`;
  const titled = (id: string, title: string) => `document.querySelector('${row(id)} strong')?.textContent === ${JSON.stringify(title)}`;
  const within = <T>(value: Promise<T>, what: string) => Promise.race([value, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(what)), 20_000))]);

  // Requests are held by the test where it says so; every other one goes on. A request paused as interception is switched off is
  // let go by the switch itself, and continuing it then is refused.
  let hold: ((requestId: string) => void) | null = null, holds: (url: URL) => boolean = () => false;
  const holding = (which: (url: URL) => boolean) => new Promise<string>(resolve => { holds = which; hold = resolve; });
  const release = (requestId: string) => browser.command("Fetch.continueRequest", { requestId }, browser.sessionId);
  t.after(browser.on("Fetch.requestPaused", (event, session) => {
    if (session !== browser.sessionId) return;
    const paused = event as { requestId: string; request: { url: string } };
    const take = hold;
    if (take && holds(new URL(paused.request.url))) { hold = null; take(paused.requestId); }
    else release(paused.requestId).catch(() => undefined);
  }));
  t.after(() => browser.command("Fetch.disable", {}, browser.sessionId).then(() => undefined, () => undefined));

  // ② The page is drawn; its first check of Schedule's version is held before it reaches the Host, and Alpha is renamed meanwhile.
  // The check then answers the version after the rename: the page was drawn before it, so it reads the page again.
  await browser.command("Fetch.enable", { patterns: [{ urlPattern: "*/plugins/io.molis.work.schedule/view-revision*", requestStage: "Request" }] }, browser.sessionId);
  const checked = holding(url => url.pathname.endsWith("/view-revision"));
  const loading = browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?openPlugin=schedule` }, browser.sessionId));
  await loading;
  await browser.surfaceReady("schedule");
  await child.waitFor(`document.querySelector('${row(alpha.task_id)}')?.getClientRects().length > 0`, 20_000);
  await child.evaluate("window.__scheduleStayed = true");
  const first = await within(checked, "the page did not check Schedule's version");
  assert.equal(await child.evaluate<string>(`document.querySelector('${row(alpha.task_id)} strong').textContent`), "Alpha", "the page was drawn before the rename");
  await rename(alpha, "Alpha renamed");
  await release(first);
  await child.waitFor(titled(alpha.task_id, "Alpha renamed"), 20_000);

  // From here the page document the shell reads for the frame (readDocument) is held after the Host answered it, before it reaches
  // the page: the answer is the page as it was when the Host drew it.
  await browser.command("Fetch.enable", { patterns: [{ urlPattern: `*/projects/${browser.projectId}/*`, resourceType: "Fetch", requestStage: "Response" }] }, browser.sessionId);
  const pageDocument = (url: URL) => !url.pathname.includes("/api/");

  // ③ A read of its own starts (Beta renamed through an action, ①) and its answer, with Alpha still on, is held. Meanwhile the
  // person pauses Alpha and the page reads again for it. The held answer then arrives late and must not draw Alpha on again.
  await child.click(row(alpha.task_id));
  await child.waitFor(`!document.querySelector('${detail(alpha.task_id)}').hidden`);
  const background = holding(pageDocument);
  await rename(beta, "Beta v1");
  const late = await within(background, "a change made through an action did not read the open page again");
  await child.click(`${detail(alpha.task_id)} [data-schedule-task-enabled-action=false]`);
  await child.waitFor(`document.querySelector('${detail(alpha.task_id)} [data-schedule-task-enabled-action=true]')`);
  await child.evaluate(`window.__staleDrawn = 0; window.__watching = setInterval(() => {
    if (!document.querySelector('${detail(alpha.task_id)} [data-schedule-task-enabled-action=true]')) window.__staleDrawn++; }, 5)`);
  await release(late);
  await new Promise(resolve => setTimeout(resolve, 1_500));
  assert.equal(await child.evaluate<number>("(clearInterval(window.__watching), window.__staleDrawn)"), 0, "the late answer drew nothing: Alpha stayed paused");
  await child.waitFor(titled(beta.task_id, "Beta v1"), 20_000);
  assert.equal(await child.evaluate<boolean>(`!document.querySelector('${detail(alpha.task_id)}').hidden && Boolean(document.querySelector('${detail(alpha.task_id)} [data-schedule-task-enabled-action=true]'))`), true,
    "the page shows the newest state, Alpha still open");
  assert.equal((await actions.invoke(caller, scheduleActions.list, {})).tasks.find(task => task.task_id === alpha.task_id)!.enabled, false);

  // ① Alpha turned on again through an action shows on the open page.
  await actions.invoke(caller, scheduleActions.setTaskEnabled, { task_id: alpha.task_id, enabled: true });
  await child.waitFor(`document.querySelector('${detail(alpha.task_id)} [data-schedule-task-enabled-action=false]')`, 20_000);

  // ④ A round of Alpha's says something important while its detail is open: Alpha is unread. The page reads again on its own (a
  // change through an action) and shows the round, but the person has not opened it since: it stays unread.
  await browser.localHost!.withProject(ref, runtime => handleScheduleTaskWakeup(runtime.store.db, alpha.task_id,
    { run: async () => ({ text: "Something needs a look", important: true }) }));
  await rename(beta, "Beta v2");
  await child.waitFor(`document.querySelector('${detail(alpha.task_id)} .schedule-turn--assistant') && ${titled(beta.task_id, "Beta v2")}`, 20_000);
  await new Promise(resolve => setTimeout(resolve, 1_000));
  assert.deepEqual(await child.evaluate(`({ open: !document.querySelector('${detail(alpha.task_id)}').hidden,
    detail: document.querySelector('${detail(alpha.task_id)} [data-schedule-detail-status]').dataset.mwState,
    row: document.querySelector('${row(alpha.task_id)} [data-schedule-row-status]').dataset.mwState })`), { open: true, detail: "unread", row: "unread" },
    "the page shows Alpha unread");
  assert.equal((await actions.invoke(caller, scheduleActions.list, {})).tasks.find(task => task.task_id === alpha.task_id)!.unread, true, "and Alpha is still unread");
  assert.equal(await child.evaluate("window.__scheduleStayed"), true, "every change showed in place: the page was not loaded again");

  // ⑤ Failed ordinary command does not bump view-revision; open recoveryDialog pauses background refresh until closed;
  // opening Schedule when SSR data-view-revision matches /view-revision performs zero redundant readDocument fetches.
  const revBeforeFail = await child.evaluate<string>("document.querySelector('[data-schedule-workbench]')?.dataset.viewRevision ?? ''");
  assert.ok(revBeforeFail.includes(":"), `SSR stamped data-view-revision (${revBeforeFail})`);
  await assert.rejects(actions.invoke(caller, scheduleActions.updateTask, {
    task_id: "missing-task-id",
    title: "Nope",
    instructions: "Read",
    time: "08:00",
    notify_important: false,
  }));
  const revAfterFail = await child.evaluate<string>(`fetch('/projects/${browser.projectId}/api/plugins/io.molis.work.schedule/view-revision').then(r => r.json()).then(d => d.revision)`);
  assert.equal(revAfterFail, revBeforeFail, "failed ordinary command must not invalidate view revision");

  await child.evaluate("document.querySelector('[data-schedule-recovery-dialog]').showModal()");
  await rename(beta, "Beta while dialog open");
  await new Promise(resolve => setTimeout(resolve, 2_500));
  assert.equal(await child.evaluate<string>(`document.querySelector('${row(beta.task_id)} strong').textContent`), "Beta v2", "open recoveryDialog blocks silent refresh");
  await child.evaluate("document.querySelector('[data-schedule-recovery-dialog]').close()");
  await child.waitFor(titled(beta.task_id, "Beta while dialog open"), 10_000);

  // Reopen with no changes: watchRevision observes matching data-view-revision and triggers zero redundant readDocument fetches.
  let redundantPageReads = 0;
  let revisionPolls = 0;
  await browser.command("Fetch.enable", { patterns: [{ urlPattern: `*/projects/${browser.projectId}/*`, resourceType: "Fetch", requestStage: "Request" }] }, browser.sessionId);
  const stopCounting = browser.on("Fetch.requestPaused", (event, session) => {
    if (session !== browser.sessionId) return;
    const url = new URL((event as { request: { url: string } }).request.url);
    if (url.pathname.endsWith("/view-revision")) revisionPolls += 1;
    else if (pageDocument(url)) redundantPageReads += 1;
  });
  try {
    await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?openPlugin=schedule` }, browser.sessionId));
    await browser.surfaceReady("schedule");
    await child.waitFor(`document.querySelector('${row(alpha.task_id)}')?.getClientRects().length > 0`, 20_000);
    const deadline = Date.now() + 8_000;
    while (revisionPolls < 2 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(revisionPolls >= 2, `expected at least 2 view-revision checks, got ${revisionPolls}`);
    assert.equal(redundantPageReads, 0, "matching SSR data-view-revision avoids redundant readDocument fetches");
  } finally {
    stopCounting();
  }
});

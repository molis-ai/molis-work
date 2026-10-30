import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { SchedulePluginRouteTable } from "./schedule-direct-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { bindActionClient, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { getScheduleReminder, scheduleActions, SCHEDULE_ACTION_PERMISSIONS, createScheduleRouteHandlers, reminderActions, type ScheduleJobView } from "@molis-ai/molis-work-plugin-schedule";
import { molisWorkHostProjectReference, seedDemoBoard, scheduleServiceFor, type LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { scheduledOwnerPlugin, scheduleRuntimeFixture } from "./fixtures/schedule-runtime.js";

const confirmation = (view: ScheduleJobView) => ({ job_id: view.job_id,
  expected_installation_id: view.reminder!.installation!.installation_id, expected_generation: view.reminder!.installation!.generation });

/** Preserve a real public registration, then model retained domain data from before a reinstall. */
async function setBeforeReinstall(db: LocalProjectDatabase["db"], sdk: BoundActionClient, person: BoundActionClient, at: string, repeat: "daily" | "none" = "none") {
  const { reminderId } = await sdk.invoke(reminderActions.add, { at, text: "复习 <今天> 的笔记", repeat });
  const record = getScheduleReminder(db, reminderId)!;
  await person.invoke(scheduleActions.setJobEnabled, { job_id: record.jobId, enabled: false });
  db.prepare("UPDATE schedule_plugin_reminders SET record_json = ? WHERE id = ?").run(JSON.stringify({ ...record,
    installationGeneration: "before-reinstall", pluginTitle: "原笔记插件" }), reminderId);
  return { id: reminderId, job: scheduleServiceFor(db).get(record.jobId)! };
}
async function fixture(t: Parameters<typeof scheduleRuntimeFixture>[0]) {
  const f = await scheduleRuntimeFixture(t), store = await f.store();
  const caller = { actor_id: "web-user", project_id: f.project.project_id, audience: "user" as const, permissions: SCHEDULE_ACTION_PERMISSIONS };
  const person = bindActionClient(f.client, () => caller);
  const view = async (id: string) => { const found = (await person.invoke(scheduleActions.list, {})).jobs.find(row => row.job_id === id); assert.ok(found); return found; };
  return { ...f, person, caller, view, db: store.db, clock: scheduleServiceFor(store.db) };
}

test("recovery respects the current installation's reminder limit and requires a running unique target", async t => {
  const f = await fixture(t), installed = await f.record(), repository = new SqlitePluginRuntimeRepository(f.db);
  const at = new Date(Date.now() + 86400000).toISOString();
  const { id, job } = await setBeforeReinstall(f.db, f.sdk, f.person, at), input = confirmation(await f.view(job.job_id));
  repository.save({ ...installed, state: "disabled" });
  assert.equal((await f.view(job.job_id)).reminder?.installation, null);
  await assert.rejects(f.person.invoke(scheduleActions.recoverReminder, input), /安装并启用/);
  repository.save(installed);
  repository.save({ ...installed, installation_generation: "another", install_id: "another", publisher_signature: "another" });
  assert.equal((await f.view(job.job_id)).reminder?.installation, null);
  await assert.rejects(f.person.invoke(scheduleActions.recoverReminder, input), /安装并启用/);
  repository.save({ ...repository.get("another")!, state: "uninstalled" });
  const created = [];
  for (let index = 0; index < 200; index++) created.push(await f.sdk.invoke(reminderActions.add, { at, text: "current reminder" }));
  await assert.rejects(f.person.invoke(scheduleActions.recoverReminder, input), /提醒已经太多/);
  assert.equal(f.clock.get(job.job_id)?.enabled, false); assert.equal(getScheduleReminder(f.db, id)?.installationGeneration, "before-reinstall");
  await f.sdk.invoke(reminderActions.cancel, created[0]!);
  assert.equal((await f.person.invoke(scheduleActions.recoverReminder, input)).job.enabled, true);
  await assert.rejects(f.sdk.invoke(reminderActions.add, { at, text: "overflow" }), /提醒已经太多/);
});

test("W3-02-E: inactive or foreign installations cannot set or cancel reminders and receive coded failures", async t => {
  const f = await fixture(t), installed = await f.record(), repository = new SqlitePluginRuntimeRepository(f.db);
  const at = new Date(Date.now() + 86400000).toISOString(), refused = { code: "schedule.job_invalid", kind: "invalid" };
  const unissued = bindActionClient(f.client, () => ({ ...f.caller, actor_id: "plugin:" + f.id, audience: "plugin", permissions: [], plugin_install_id: installed.install_id }));
  await assert.rejects(unissued.invoke(reminderActions.add, { at, text: "复习" }), { code: "host.plugin_caller_invalid" });
  await assert.rejects(unissued.invoke(reminderActions.cancel, { reminderId: "any" }), { code: "host.plugin_caller_invalid" });
  for (const state of ["installed", "disabled", "crashed", "quarantined", "uninstalled"] as const) {
    repository.save({ ...installed, state });
    await assert.rejects(f.sdk.invoke(reminderActions.add, { at, text: "复习" }), refused);
    await assert.rejects(f.sdk.invoke(reminderActions.cancel, { reminderId: "any" }), refused);
  }
  repository.save({ ...installed, plugin_id: "io.molis.work.test.other", state: "running" });
  await assert.rejects(f.sdk.invoke(reminderActions.add, { at, text: "复习" }), { code: "actions.forbidden" });
  repository.save(installed);
  const reminder = await f.sdk.invoke(reminderActions.add, { at, text: "复习" });
  assert.deepEqual(await f.sdk.invoke(reminderActions.cancel, reminder), { cancelled: true });
});

test("reminder recovery rechecks consent, rolls back atomically and preserves cadence across restart", async t => {
  const f = await fixture(t), repository = new SqlitePluginRuntimeRepository(f.db), original = await f.record();
  const at = new Date(Date.now() + 3600000).toISOString();
  const daily = await setBeforeReinstall(f.db, f.sdk, f.person, at, "daily"), once = await setBeforeReinstall(f.db, f.sdk, f.person, at);
  const enable = (enabled: boolean) => f.person.invoke(scheduleActions.setJobEnabled, { job_id: daily.job.job_id, enabled });
  const recover = (input: ReturnType<typeof confirmation>) => f.person.invoke(scheduleActions.recoverReminder, input).then(reply => reply.job);
  assert.equal((await f.view(daily.job.job_id)).reminder?.needs_confirmation, true);
  await assert.rejects(enable(true), /确认当前插件/);
  const stale = confirmation(await f.view(daily.job.job_id)); repository.save({ ...original, installation_generation: "reinstalled" });
  await assert.rejects(recover(stale), /安装已变更/);
  const current = confirmation(await f.view(daily.job.job_id));
  // A production SQL guard rejects the statement before it can bypass the owner's transaction.
  f.db.exec("CREATE TRIGGER refuse_recovery BEFORE UPDATE ON schedule_plugin_reminders BEGIN SELECT RAISE(ABORT, 'disk-write-failed'); END");
  await assert.rejects(recover(current), { code: "plugin.project_database.statement_refused" });
  assert.equal(getScheduleReminder(f.db, daily.id)?.installationGeneration, "before-reinstall");
  assert.deepEqual(f.clock.get(daily.job.job_id), daily.job);
  f.db.exec("DROP TRIGGER refuse_recovery");
  const other = await fixture(t); await assert.rejects(other.person.invoke(scheduleActions.recoverReminder, current), /不存在/);
  const recovered = await recover(current); assert.equal(recovered.reminder?.needs_confirmation, false);
  assert.equal(recovered.next_due_at, at); assert.deepEqual(recovered.recurrence, daily.job.recurrence);
  await enable(false); assert.equal((await recover(current)).enabled, false, "duplicate confirmation cannot undo a later pause");
  await enable(true); await recover(confirmation(await f.view(once.job.job_id)));
  // Retain the current public installation generation as an actual restart does.
  await f.reopen(); const reopenedRecord = await f.record();
  const reopened = await f.store();
  assert.equal(reopenedRecord.installation_generation, "reinstalled");
  await f.tick(at); await f.tick(at);
  const items = await f.inbox(); assert.equal(items.length, 2);
  assert.ok(items.every(item => item.summary === "复习 <今天> 的笔记" && item.url === `/projects/${f.project.project_id}/plugins/${f.id}`));
  assert.equal(getScheduleReminder(reopened.db, once.id), null);
  assert.equal(getScheduleReminder(reopened.db, daily.id)?.installationGeneration, "reinstalled");
  assert.equal(scheduleServiceFor(reopened.db).get(daily.job.job_id)?.next_due_at, new Date(Date.parse(at) + 86400000).toISOString());
  assert.equal(scheduleServiceFor(reopened.db).get(daily.job.job_id)?.last_wakeup?.status, "ok");
});

test("reminder recovery through Host and HTTP uses current authorization and cannot cross Home or project", async t => {
  const f = await fixture(t), other = await fixture(t), at = new Date(Date.now() + 86400000).toISOString();
  const mine = await setBeforeReinstall(f.db, f.sdk, f.person, at), foreign = await setBeforeReinstall(other.db, other.sdk, other.person, at);
  const input = confirmation(await f.view(mine.job.job_id));
  await assert.rejects(f.client.invoke({ ...f.caller, project_id: "elsewhere" }, scheduleActions.recoverReminder, input), { code: "actions.scope_mismatch" });
  await assert.rejects(f.sdk.invoke(scheduleActions.recoverReminder, input), { code: "actions.forbidden" });
  await assert.rejects(f.client.invoke({ ...f.caller, permissions: ["schedule:read"] }, scheduleActions.recoverReminder, input), { code: "actions.forbidden" });
  await assert.rejects(f.client.invoke({ ...f.caller, validate_authority() { throw new Error("authority-revoked"); } }, scheduleActions.recoverReminder, input), /authority-revoked/);
  await assert.rejects(other.person.invoke(scheduleActions.recoverReminder, { ...input, job_id: foreign.job.job_id }), /安装已变更/);
  assert.equal(f.clock.get(mine.job.job_id)?.enabled, false);
  let changed = 0;
  const routes = new SchedulePluginRouteTable(createScheduleRouteHandlers({ actions: f.person, changed() { changed++; } }));
  const response = await routes.handle({ method: "POST", pathname: `/api/plugins/io.molis.work.schedule/jobs/${encodeURIComponent(input.job_id)}/recover-reminder`,
    query: new URLSearchParams(), body: { expected_installation_id: input.expected_installation_id, expected_generation: input.expected_generation } });
  assert.equal(response?.status, 200); assert.equal(changed, 1);
  assert.equal((response?.body as { job: ScheduleJobView }).job.reminder?.needs_confirmation, false);
  assert.equal(other.clock.get(foreign.job.job_id)?.enabled, false);
});

test("Schedule reminder recovery can be cancelled and re-reviewed after reinstall in a narrow browser", { timeout: 60_000 }, async t => {
  const ownerPlugin = scheduledOwnerPlugin();
  const b = await openGoalBrowser(t, true, seedDemoBoard, null, undefined, undefined, {}, { project: [ownerPlugin.definition] }); if (!b) return;
  const { store, origin, projectId, command, sessionId, navigate } = b;
  const { click, evaluate, waitFor } = await pluginFrameBrowser(t, b, "schedule");
  const ref = molisWorkHostProjectReference({ databasePath: b.databasePath, projectId: projectId! });
  await b.localHost!.inspectActions({ actor_id: "web-user", project_id: projectId!, audience: "user", permissions: [] }, ref);
  const repository = new SqlitePluginRuntimeRepository(store.db), original = repository.list().find(row => row.plugin_id === ownerPlugin.id)!;
  const person = bindActionClient(b.localHost!.actionClient(ref), () => ({ actor_id: "web-user", project_id: projectId!, audience: "user", permissions: SCHEDULE_ACTION_PERMISSIONS }));
  const schedule = scheduleServiceFor(store.db);
  const { id: reminderId, job } = await setBeforeReinstall(store.db, ownerPlugin.actions(projectId!), person, new Date(Date.now() + 86_400_000).toISOString());
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await b.click("[data-plugin-strip] [data-plugin-id=schedule]");
  await b.surfaceReady("schedule");
  await click(`[data-schedule-row][data-schedule-job-id="${job.job_id}"]`);
  assert.equal(await evaluate("document.querySelector('[data-schedule-reminder-text]').textContent"), "复习 <今天> 的笔记");
  assert.match(await evaluate<string>("document.querySelector('[data-schedule-detail]:not([hidden]) .feed-detail-kicker').textContent"), /原笔记插件/);
  assert.doesNotMatch(await evaluate<string>("document.querySelector('[data-schedule-detail]:not([hidden])').textContent"), /plugin-builder\.reminder|对象钥匙/);
  await click("[data-schedule-reminder-recover]");
  await click("[data-schedule-recovery-form] footer [data-schedule-recovery-close]");
  assert.equal(schedule.get(job.job_id)?.enabled, false);
  await click("[data-schedule-reminder-recover]");
  repository.save({ ...original, installation_generation: "replacement" });
  await click("[data-schedule-recovery-form] [type=submit]");
  await waitFor("document.querySelector('[data-schedule-recovery-error]').textContent.includes('安装已变更')");
  assert.equal(schedule.get(job.job_id)?.enabled, false);
  assert.equal(getScheduleReminder(store.db, reminderId)?.installationGeneration, "before-reinstall");
  assert.equal(await evaluate("document.querySelector('[data-schedule-recovery-dialog]').open"), true);
  await b.evaluate(`{ const original = window.fetch; window.restoreRecoveryFetch = () => window.fetch = original;
    window.fetch = (url, options) => new URL(url, location.href).pathname === location.pathname
      ? Promise.resolve(new Response('temporarily unavailable', { status: 503 })) : original(url, options); }`);
  await click("[data-schedule-recovery-refresh]");
  await waitFor("document.querySelector('[data-schedule-recovery-error]').textContent.includes('无法更新')");
  assert.equal(await evaluate("document.querySelector('[data-schedule-recovery-dialog]').open"), true);
  assert.equal(getScheduleReminder(store.db, reminderId)?.installationGeneration, "before-reinstall", "a refresh failure cannot submit a new identity");
  await b.evaluate("window.restoreRecoveryFetch()");
  await click("[data-schedule-recovery-refresh]");
  await waitFor("document.querySelector('[data-schedule-reminder-recover]').dataset.generation === 'replacement' && !document.querySelector('[data-schedule-recovery-form] [type=submit]').disabled");
  const rect = await evaluate<{ left: number; right: number }>("(() => { const r = document.querySelector('[data-schedule-recovery-dialog]').getBoundingClientRect(); return { left: r.left, right: r.right }; })()");
  assert.ok(rect.left >= 0 && rect.right <= 390, JSON.stringify(rect));
  const directory = join(process.cwd(), ".impeccable/qa/review"); await mkdir(directory, { recursive: true });
  const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
  await writeFile(join(directory, "schedule-reminder-recovery.png"), Buffer.from(shot.data, "base64"));
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] }, sessionId);
  await waitFor("document.documentElement.dataset.resolvedTheme === 'dark'");
  await evaluate("Promise.all(document.getAnimations().filter(animation => animation instanceof CSSTransition).map(animation => animation.finished.catch(() => {})))");
  const darkShot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
  await writeFile(join(directory, "schedule-reminder-recovery-dark.png"), Buffer.from(darkShot.data, "base64"));
  await click("[data-schedule-recovery-form] [type=submit]");
  await waitFor("!document.querySelector('[data-schedule-recovery-dialog]').open && !document.querySelector('[data-schedule-reminder-recover]')");
  assert.equal(schedule.get(job.job_id)?.enabled, true);
  assert.equal(getScheduleReminder(store.db, reminderId)?.installationGeneration, "replacement");
  assert.equal(getScheduleReminder(store.db, reminderId)?.link, `/projects/${projectId}/plugins/${ownerPlugin.id}`);
});

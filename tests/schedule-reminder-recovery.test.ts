import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { createScheduleReminders, createScheduleReminderManagement, getScheduleReminder, createScheduleActionPorts, scheduleActions, SCHEDULE_ACTION_PERMISSIONS,
  SchedulePluginRouteTable, createScheduleRouteHandlers, reminderActions, type ScheduleJobView } from "@molis-ai/molis-work-plugin-schedule";
import { registerHostWakeup } from "../apps/local-host/dist/schedule-runtime.js";
import { serveTestHost } from "./fixtures/test-home.js";
import { LocalActionGatewayClient, MolisWorkLocalHost, molisWorkHostProjectReference, LocalProjectDatabase, seedDemoBoard, scheduleServiceFor, createLocalFeedApplication } from "@molis-ai/molis-work-app-local-host";
import { todoActions, TODO_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-todo";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { currentCallId } from "@molis-ai/molis-work-kernel";

const pluginId = "io.molis.work.test.reminder";
function installation(generation = "original"): PluginInstanceRecord {
  return { install_id: "reminder-install", installation_generation: generation, plugin_id: pluginId, version: "1.0.0", publisher_id: "test",
    publisher_signature: "test", manifest_digest: "test", deployment: "local", selected_entrypoint: "./plugin.mjs", grants: ["storage:private"],
    execution: "sandbox", state: "running", recovery_count: 0, last_error_code: null, installed_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z", uninstalled_at: null, retain_private_data: false };
}
/** A reminder the plugin set under an earlier generation of its installation and the person then paused: after the reinstall it waits for them to confirm. */
function setBeforeReinstall(db: LocalProjectDatabase["db"], projectId: string, schedule: ReturnType<typeof scheduleServiceFor>, at: string, repeat: "daily" | "none" = "none") {
  const reminders = createScheduleReminders({ db, projectId, schedule, now: () => Date.parse(at) - 3_600_000,
    describe: () => ({ title: "原笔记插件", link: "/original-link", generation: "before-reinstall" }) });
  const { reminderId } = reminders.add({ projectId, pluginId, installationId: installation().install_id }, { at, text: "复习 <今天> 的笔记", repeat });
  const { jobId, jobOwner } = getScheduleReminder(db, reminderId)!;
  schedule.setEnabled(jobId, false, jobOwner);
  return { id: reminderId, job: schedule.get(jobId)! };
}
const confirmation = (view: ScheduleJobView) => ({ job_id: view.job_id,
  expected_installation_id: view.reminder!.installation!.installation_id, expected_generation: view.reminder!.installation!.generation });

/** Runs the Host's already registered owner adapters; the test supplies no installation rules. */
async function reminderHost(path: string, projectId = "p", clock?: () => Date) {
  const host = new MolisWorkLocalHost({ clock, completeText: null });
  const reference = molisWorkHostProjectReference({ databasePath: path, projectId });
  const runtime = await host.withProject(reference, value => { if (clock) scheduleServiceFor(value.store.db, clock); return value; });
  const client = host.actionClient(reference);
  const owner = bindActionClient(client, () => ({ actor_id: "owner", project_id: projectId, audience: "user", permissions: SCHEDULE_ACTION_PERMISSIONS }));
  const plugin = bindActionClient(client, () => ({ actor_id: `plugin:${pluginId}`, project_id: projectId, audience: "plugin", permissions: [], plugin_install_id: installation().install_id }));
  const view = async (jobId: string) => { const found = (await owner.invoke(scheduleActions.list, {})).jobs.find(row => row.job_id === jobId); assert.ok(found); return found; };
  return { host, reference, store: runtime.store, schedule: scheduleServiceFor(runtime.store.db, clock), owner, plugin, view };
}

test("recovery respects the current installation's reminder limit and requires a running unique target", async () => {
  const home = await mkdtemp(join(tmpdir(), "reminder-recover-limit-")), path = join(home, "project.db"); seedDemoBoard(path, "p");
  const f = await reminderHost(path), { store, schedule } = f;
  try {
    const repository = new SqlitePluginRuntimeRepository(store.db); repository.save(installation());
    const at = new Date(Date.now() + 86_400_000).toISOString();
    const { id, job } = setBeforeReinstall(store.db, "p", schedule, at);
    const input = confirmation(await f.view(job.job_id));
    repository.save({ ...installation(), state: "disabled" });
    assert.equal((await f.view(job.job_id)).reminder?.installation, null);
    await assert.rejects(f.owner.invoke(scheduleActions.recoverReminder, input), /安装并启用/);
    repository.save(installation());
    repository.save({ ...installation("another"), install_id: "another", publisher_signature: "another" });
    assert.equal((await f.view(job.job_id)).reminder?.installation, null);
    await assert.rejects(f.owner.invoke(scheduleActions.recoverReminder, input), /安装并启用/);
    repository.save({ ...repository.get("another")!, state: "uninstalled" });
    const created = [];
    for (let index = 0; index < 200; index++) created.push(await f.plugin.invoke(reminderActions.add, { at, text: "current reminder" }));
    await assert.rejects(f.owner.invoke(scheduleActions.recoverReminder, input), /提醒已经太多/);
    assert.equal(schedule.get(job.job_id)?.enabled, false);
    assert.equal(getScheduleReminder(store.db, id)?.installationGeneration, "before-reinstall");
    await f.plugin.invoke(reminderActions.cancel, created[0]!);
    assert.equal((await f.owner.invoke(scheduleActions.recoverReminder, input)).job.enabled, true);
    await assert.rejects(f.plugin.invoke(reminderActions.add, { at, text: "overflow" }), /提醒已经太多/);
  } finally { await f.host.close(); await rm(home, { recursive: true, force: true }); }
});

test("W3-02-E: a plugin whose installation is not running cannot set or cancel a reminder; the action answers schedule.job_invalid, not an uncoded failure", async () => {
  const home = await mkdtemp(join(tmpdir(), "reminder-not-running-")), path = join(home, "project.db"); seedDemoBoard(path, "p");
  const f = await reminderHost(path), { store } = f;
  try {
    const repository = new SqlitePluginRuntimeRepository(store.db);
    const at = new Date(Date.now() + 86_400_000).toISOString();
    const refused = { code: "schedule.job_invalid", kind: "invalid" };
    await assert.rejects(f.plugin.invoke(reminderActions.add, { at, text: "复习" }), refused);
    await assert.rejects(f.plugin.invoke(reminderActions.cancel, { reminderId: "any" }), refused);
    for (const state of ["installed", "disabled", "crashed", "quarantined", "uninstalled"] as const) {
      repository.save({ ...installation(), state });
      await assert.rejects(f.plugin.invoke(reminderActions.add, { at, text: "复习" }), refused, `add while ${state}`);
      await assert.rejects(f.plugin.invoke(reminderActions.cancel, { reminderId: "any" }), refused, `cancel while ${state}`);
    }
    repository.save({ ...installation(), plugin_id: "io.molis.work.test.other", state: "running" });
    await assert.rejects(f.plugin.invoke(reminderActions.add, { at, text: "复习" }), refused, "add under another plugin's installation");
    repository.save({ ...installation(), state: "running" });
    const { reminderId } = await f.plugin.invoke(reminderActions.add, { at, text: "复习" });
    assert.equal(typeof reminderId, "string");
    assert.deepEqual(await f.plugin.invoke(reminderActions.cancel, { reminderId }), { cancelled: true });
  } finally { await f.host.close(); await rm(home, { recursive: true, force: true }); }
});

test("reminder recovery after a reinstall rechecks current consent, commits atomically and preserves cadence across restart", async () => {
  const home = await mkdtemp(join(tmpdir(), "reminder-recover-")), path = join(home, "project.db"); seedDemoBoard(path, "p");
  const clock = new Date(), at = new Date(clock.getTime() - 3_600_000).toISOString();
  let f = await reminderHost(path, "p", () => clock); let store = f.store;
  try {
    const repository = new SqlitePluginRuntimeRepository(store.db); repository.save(installation());
    const schedule = f.schedule;
    const { id: dailyId, job: daily } = setBeforeReinstall(store.db, "p", schedule, at, "daily");
    const { id: onceId, job: once } = setBeforeReinstall(store.db, "p", schedule, at);
    const enable = (jobId: string, enabled: boolean) => f.owner.invoke(scheduleActions.setJobEnabled, { job_id: jobId, enabled });
    const recover = (input: ReturnType<typeof confirmation>) => f.owner.invoke(scheduleActions.recoverReminder, input).then(reply => reply.job);
    assert.equal((await f.view(daily.job_id)).reminder?.needs_confirmation, true);
    await assert.rejects(enable(daily.job_id, true), /确认当前插件/);
    const oldConfirmation = confirmation((await f.view(daily.job_id)));
    repository.save(installation("reinstalled"));
    await assert.rejects(recover(oldConfirmation), /安装已变更/);
    assert.equal(getScheduleReminder(store.db, dailyId)?.installationGeneration, "before-reinstall");
    assert.equal(schedule.get(daily.job_id)?.enabled, false);

    const current = confirmation((await f.view(daily.job_id)));
    const currentInstallation = (await f.view(daily.job_id)).reminder!.installation;
    const broken = createScheduleReminderManagement({ db: store.db, projectId: "p",
      currentInstallation: () => currentInstallation,
      schedule: { get: schedule.get, setEnabled(...args) { schedule.setEnabled(...args); throw new Error("disk-write-failed"); } } });
    assert.throws(() => broken.recover(current), /disk-write-failed/);
    assert.equal(getScheduleReminder(store.db, dailyId)?.installationGeneration, "before-reinstall");
    assert.deepEqual(schedule.get(daily.job_id), daily, "failed enabling rolls back both identity and job");
    const other = await reminderHost(path, "other-board");
    try { await assert.rejects(other.owner.invoke(scheduleActions.recoverReminder, current), /不存在/); } finally { await other.host.close(); }

    const recovered = await recover(current);
    assert.equal(recovered.reminder?.needs_confirmation, false);
    assert.deepEqual({ ...recovered, enabled: false, updated_at: daily.updated_at, reminder: undefined }, { ...daily, reminder: undefined });
    assert.equal(getScheduleReminder(store.db, dailyId)?.link, "/original-link");
    await enable(daily.job_id, false);
    assert.equal((await recover(current)).enabled, false, "a duplicate confirmation cannot undo a later pause");
    await enable(daily.job_id, true);
    await recover(confirmation(await f.view(once.job_id)));
    await f.host.close(); f = await reminderHost(path, "p", () => clock); store = f.store;
    const reopened = f.schedule;
    await reopened.tick(clock); await reopened.tick(clock);
    const items = createLocalFeedApplication(store.db).snapshot("p").feed_items.filter(item => item.source_id === "plugin-reminders");
    assert.equal(items.length, 2, "each overdue reminder delivers only once");
    assert.ok(items.every(item => item.summary === "复习 <今天> 的笔记" && item.url === "/original-link"));
    assert.equal(getScheduleReminder(store.db, onceId), null);
    assert.equal(getScheduleReminder(store.db, dailyId)?.installationGeneration, "reinstalled");
    assert.equal(reopened.get(daily.job_id)?.next_due_at, new Date(Date.parse(at) + 86_400_000).toISOString());
    assert.equal(reopened.get(daily.job_id)?.last_wakeup?.status, "ok");
  } finally { await f.host.close(); await rm(home, { recursive: true, force: true }); }
});

test("reminder recovery through Host and HTTP uses current authorization and cannot cross Home or project", async () => {
  const home = await mkdtemp(join(tmpdir(), "reminder-recovery-actions-"));
  const hosts = [new MolisWorkLocalHost(), new MolisWorkLocalHost()];
  const refs = ["one", "two"].map(name => { const path = join(home, name + ".db"); seedDemoBoard(path, "p");
    return molisWorkHostProjectReference({ databasePath: path, projectId: "p" }); });
  const caller = { actor_id: "owner", project_id: "p", audience: "user" as const, permissions: SCHEDULE_ACTION_PERMISSIONS };
  try {
    const jobs = [];
    for (let i = 0; i < hosts.length; i++) jobs.push(await hosts[i]!.withProject(refs[i]!, runtime => {
      new SqlitePluginRuntimeRepository(runtime.store.db).save(installation("home-" + i));
      return setBeforeReinstall(runtime.store.db, "p", scheduleServiceFor(runtime.store.db), new Date(Date.now() + 86_400_000).toISOString()).job;
    }));
    const client = hosts[0]!.actionClient(refs[0]!), bound = bindActionClient(client, () => caller);
    const view = (await bound.invoke(scheduleActions.list, {})).jobs.find(job => job.job_id === jobs[0]!.job_id)!;
    const input = confirmation(view);
    assert.equal(view.reminder?.text, "复习 <今天> 的笔记");
    await assert.rejects(client.invoke({ ...caller, project_id: "elsewhere" }, scheduleActions.recoverReminder, input), { code: "actions.scope_mismatch" });
    await assert.rejects(client.invoke({ ...caller, audience: "plugin" }, scheduleActions.recoverReminder, input), { code: "actions.forbidden" });
    await assert.rejects(client.invoke({ ...caller, permissions: ["schedule:read"] }, scheduleActions.recoverReminder, input), { code: "actions.forbidden" });
    await assert.rejects(client.invoke({ ...caller, validate_authority: async () => { throw new Error("authority-revoked"); } }, scheduleActions.recoverReminder, input), /authority-revoked/);
    await assert.rejects(hosts[1]!.actionClient(refs[1]!).invoke(caller, scheduleActions.recoverReminder, { ...input, job_id: jobs[1]!.job_id }), /安装已变更/);
    assert.equal((await bound.invoke(scheduleActions.list, {})).jobs.find(job => job.job_id === input.job_id)?.enabled, false);
    let changed = 0;
    const routes = new SchedulePluginRouteTable(createScheduleRouteHandlers({ actions: bound, changed() { changed++; } }));
    const response = await routes.handle({ method: "POST", pathname: `/api/schedule/jobs/${encodeURIComponent(input.job_id)}/recover-reminder`,
      query: new URLSearchParams(), body: { expected_installation_id: input.expected_installation_id, expected_generation: input.expected_generation } });
    assert.equal(response?.status, 200); assert.equal(changed, 1);
    assert.equal((response?.body as { job: ScheduleJobView }).job.reminder?.needs_confirmation, false);
    assert.equal((await hosts[1]!.actionClient(refs[1]!).invoke(caller, scheduleActions.list, {})).jobs.find(job => job.job_id === jobs[1]!.job_id)?.enabled, false);
  } finally { await Promise.all(hosts.map(host => host.close())); await rm(home, { recursive: true, force: true }); }
});

test("Schedule reminder recovery can be cancelled and re-reviewed after reinstall in a narrow browser", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const { store, origin, projectId, command, sessionId, navigate, click, evaluate, waitFor } = b;
  const repository = new SqlitePluginRuntimeRepository(store.db); repository.save(installation());
  const schedule = scheduleServiceFor(store.db);
  const { id: reminderId, job } = setBeforeReinstall(store.db, projectId!, schedule, new Date(Date.now() + 86_400_000).toISOString());
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click("[data-plugin-strip] [data-plugin-id=schedule]");
  await click(`[data-schedule-row][data-schedule-job-id="${job.job_id}"]`);
  assert.equal(await evaluate("document.querySelector('[data-schedule-reminder-text]').textContent"), "复习 <今天> 的笔记");
  assert.match(await evaluate<string>("document.querySelector('[data-schedule-detail]:not([hidden]) .feed-detail-kicker').textContent"), /原笔记插件/);
  assert.doesNotMatch(await evaluate<string>("document.querySelector('[data-schedule-detail]:not([hidden])').textContent"), /plugin-builder\.reminder|对象钥匙/);
  await click("[data-schedule-reminder-recover]");
  await click("[data-schedule-recovery-form] footer [data-schedule-recovery-close]");
  assert.equal(schedule.get(job.job_id)?.enabled, false);
  await click("[data-schedule-reminder-recover]");
  repository.save(installation("replacement"));
  await click("[data-schedule-recovery-form] [type=submit]");
  await waitFor("document.querySelector('[data-schedule-recovery-error]').textContent.includes('安装已变更')");
  assert.equal(schedule.get(job.job_id)?.enabled, false);
  assert.equal(getScheduleReminder(store.db, reminderId)?.installationGeneration, "before-reinstall");
  assert.equal(await evaluate("document.querySelector('[data-schedule-recovery-dialog]').open"), true);
  await evaluate(`{ const original = window.fetch; window.restoreRecoveryFetch = () => window.fetch = original;
    window.fetch = (url, options) => String(url).endsWith('/api/schedule/workbench')
      ? Promise.resolve(new Response('temporarily unavailable', { status: 503 })) : original(url, options); }`);
  await click("[data-schedule-recovery-refresh]");
  await waitFor("document.querySelector('[data-schedule-recovery-error]').textContent.includes('无法更新')");
  assert.equal(await evaluate("document.querySelector('[data-schedule-recovery-dialog]').open"), true);
  assert.equal(getScheduleReminder(store.db, reminderId)?.installationGeneration, "before-reinstall", "a refresh failure cannot submit a new identity");
  await evaluate("window.restoreRecoveryFetch()");
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
  assert.equal(getScheduleReminder(store.db, reminderId)?.link, "/original-link");
});


const automaticSchedule: ActionDefinition<{ ref: string; title: string; at: string }, { job_id: string }> = {
  capability_id: "fixture.periodic.register", version: 1, operation: "command", action: {
    title: "Register controlled owner wakeup", description: "Exercise the resident service timer and current Scheduler", kind: "operation", scope: "project",
    audiences: ["mcp"], permissions: ["schedule:manage"], subject_kinds: [],
    input_schema: { type: "object", properties: { ref: { type: "string" }, title: { type: "string" }, at: { type: "string" } }, required: ["ref", "title", "at"], additionalProperties: false },
    output_schema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"], additionalProperties: false },
  },
};
async function waitAutomatic(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!await check()) { assert.ok(Date.now() < deadline, "automatic service effect did not settle"); await new Promise(resolve => setTimeout(resolve, 10)); }
}

// W2-18-SCHEDULE-01: the only manual clock operation fires the production setInterval callback; no schedule.tick or project page.
test("W2-18-SCHEDULE-01: persistent and gateway-created jobs execute without visiting any project page", { timeout: 60_000 }, async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const home = await mkdtemp(join(tmpdir(), "schedule-automatic-")), previous = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  let host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  let served = await serveTestHost(null, { home, host });
  const project = await served.createProject("Automatic jobs");
  const owner = "io.molis.work.test.periodic", capability = "periodic.createTodo";
  const results: string[] = [];
  const stop = registerHostWakeup(owner, capability, async (_db, input, control) => {
    control.beforeEffect();
    const saved = await host.homeActionClient().invoke<{ item: { id: string; title: string } }>({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null,
      audience: "user", permissions: TODO_ACTION_PERMISSIONS, signal: control.signal }, todoActions.create, { title: input.object_ref, request_id: input.job_id, placement: "personal" });
    control.beforeEffect(); results.push(saved.item.title);
  });
  const register = async () => host.withProject(project.reference, runtime => {
    host.actionRegistry(project.reference).registerProvider({ provider: { provider_id: "periodic-owner", title: "Controlled timer owner", kind: "plugin", plugin_id: owner },
      definitions: [automaticSchedule], handlers: [{ ...automaticSchedule, handle: async (context, raw) => {
        await context.beforeEffect(); const input = raw as { ref: string; title: string; at: string };
        const job = scheduleServiceFor(runtime.store.db).register({ plugin_id: owner, capability_id: capability, object_ref: input.ref, title: input.title,
          due_at: input.at, recurrence: { kind: "once" } }); return { job_id: job.job_id };
      } }] });
  });
  const caller = { actor_id: "runtime:periodic", project_id: project.project_id, audience: "mcp" as const, permissions: [] };
  try {
    await register(); await served.grant(caller.actor_id, project.project_id, [automaticSchedule]);
    let client = new LocalActionGatewayClient({ url: served.origin, homeDirectory: home, clientId: caller.actor_id, projectId: project.project_id, controlToken: served.controlToken });
    await client.discover(caller);
    const persisted = await client.invoke<{ job_id: string }>(caller, automaticSchedule, { ref: "Persisted automatic Todo", title: "Persisted", at: new Date(Date.now() - 1000).toISOString() });
    await served.close(); await host.close();
    host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }); served = await serveTestHost(null, { home, host });
    await waitAutomatic(() => host.status().projects.some(row => row.project_id === project.project_id && row.state === "ready"));
    t.mock.timers.tick(30_000); await waitAutomatic(() => results.length === 1);
    assert.deepEqual(results, ["Persisted automatic Todo"]);
    await host.withProject(project.reference, runtime => assert.equal(scheduleServiceFor(runtime.store.db).get(persisted.job_id)?.last_wakeup?.status, "ok"));
    await register(); client = new LocalActionGatewayClient({ url: served.origin, homeDirectory: home, clientId: caller.actor_id, projectId: project.project_id, controlToken: served.controlToken });
    await client.discover(caller);
    const fresh = await client.invoke<{ job_id: string }>(caller, automaticSchedule, { ref: "Gateway automatic Todo", title: "Gateway", at: new Date(Date.now() - 1000).toISOString() });
    t.mock.timers.tick(30_000); await waitAutomatic(() => results.length === 2);
    t.mock.timers.tick(30_000); await new Promise(resolve => setTimeout(resolve, 25));
    assert.deepEqual(results, ["Persisted automatic Todo", "Gateway automatic Todo"]);
    const todos = await host.homeActionClient().invoke<{ items: Array<{ title: string }> }>({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user", permissions: TODO_ACTION_PERMISSIONS }, todoActions.list, { view: "all" });
    assert.equal(todos.items.filter(item => results.includes(item.title)).length, 2, "actual Todo owner contains one result per wakeup");
    await host.withProject(project.reference, runtime => assert.equal(scheduleServiceFor(runtime.store.db).get(fresh.job_id)?.last_wakeup?.status, "ok"));
  } finally { stop(); await served.close(); await host.close(); if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous;
    resetSecretStoreCache(); await rm(home, { recursive: true, force: true }); }
});


for (const disposition of ["service", "project", "delete"] as const) test(`W2-18-SCHEDULE-02: ${disposition} close revokes a real waiting handler before release`, { timeout: 60_000 }, async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const home = await mkdtemp(join(tmpdir(), "schedule-stop-")), previous = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }); let served = await serveTestHost(null, { home, host });
  const project = await served.createProject("Waiting timer");
  const entered = Promise.withResolvers<void>(), released = Promise.withResolvers<void>(), late = Promise.withResolvers<void>();
  let revoked = false, results = 0;
  const owner = "io.molis.work.test.periodic.stop", capability = "periodic.wait";
  const stop = registerHostWakeup(owner, capability, async (_db, _input, control) => {
    entered.resolve(); await released.promise;
    try {
      control.beforeEffect();
      await host.homeActionClient().invoke({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user", permissions: TODO_ACTION_PERMISSIONS,
        signal: control.signal }, todoActions.create, { title: "Forbidden late Todo", placement: "personal" }); results++;
    } catch { revoked = control.signal.aborted; }
    finally { late.resolve(); }
  });
  try {
    await host.withProject(project.reference, runtime => scheduleServiceFor(runtime.store.db).register({ plugin_id: owner, capability_id: capability,
      object_ref: "waiting", title: "Waiting", due_at: new Date(Date.now() - 1000).toISOString(), recurrence: { kind: "once" } }));
    t.mock.timers.tick(30_000); await entered.promise;
    if (disposition === "service") await served.close();
    else if (disposition === "project") await host.closeProject(project.reference);
    else {
      const response = await fetch(served.origin + "/api/settings/projects/" + project.project_id + "/delete", { method: "POST",
        headers: { "content-type": "application/json", origin: served.origin, "x-molis-work-control-token": served.controlToken,
          "x-molis-work-idempotency-key": "schedule-stop-delete" }, body: JSON.stringify({ delete_confirmed: true, idempotency_key: "schedule-stop-delete" }) });
      assert.equal(response.status, 200, await response.clone().text());
    }
    released.resolve(); await late.promise;
    assert.equal(revoked, true); assert.equal(results, 0);
    const todos = await host.homeActionClient().invoke<{ items: Array<{ title: string }> }>({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null,
      audience: "user", permissions: TODO_ACTION_PERMISSIONS }, todoActions.list, { view: "all" });
    assert.equal(todos.items.filter(item => item.title === "Forbidden late Todo").length, 0);
    if (disposition === "service") {
      served = await serveTestHost(null, { home, host });
      await host.withProject(project.reference, runtime => {
        const schedule = scheduleServiceFor(runtime.store.db);
        assert.equal(schedule.active, true, "a live borrowed Host resumes the same service facade");
        assert.equal(schedule.list(owner).length, 1, "stop preserved its task configuration");
        assert.equal(schedule.list(owner)[0]!.enabled, false, "the dispatched one-shot is not automatically replayed");
        assert.equal(schedule.list(owner)[0]!.last_wakeup, null, "no late success or failure receipt was written");
      });
      t.mock.timers.tick(30_000); await new Promise(resolve => setTimeout(resolve, 25)); assert.equal(results, 0);
    } else assert.equal(host.status().projects.some(row => row.project_id === project.project_id), false, "the released instance is gone");
  } finally { stop(); released.resolve(); await served.close(); await host.close(); if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous;
    resetSecretStoreCache(); await rm(home, { recursive: true, force: true }); }
});


test("W2-18-SCHEDULE-02: a source tick waiting inside Home preparation cannot reopen a project after close", { timeout: 60_000 }, async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const home = await mkdtemp(join(tmpdir(), "schedule-prepare-stop-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const served = await serveTestHost(null, { home, host });
  const project = await served.createProject("Prepare wait");
  await host.withProject(project.reference, () => undefined);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.deepEqual(host.status().projects.map(row => row.project_id), [project.project_id], "only the target runtime was opened");
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let operation: string | undefined;
  const plugins = host.homePlugins; assert.ok(plugins);
  await plugins.ready();
  const original = plugins.ready.bind(plugins); let waiting = true;
  t.mock.method(plugins, "ready", async () => { if (waiting) { operation = currentCallId(); entered.resolve(); await release.promise; } return original(); });
  try {
    t.mock.timers.tick(30_000);
    await Promise.race([entered.promise, new Promise((_, reject) => setTimeout(() => reject(new Error("target tick did not reach Home preparation")), 5_000))]);
    assert.equal(typeof operation, "string", "the barrier is the target timer operation");
    assert.equal(await host.closeProject(project.reference), true, "close released the actual target runtime");
    waiting = false; release.resolve();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(host.status().projects.some(row => row.project_id === project.project_id), false, "the cancelled tick never opens a replacement instance");
    assert.equal(host.callLog!.find(operation!).filter(row => row.project_id === project.project_id && row.capability_id === "feed.sources.tick").length, 0, "cancelled preparation wrote no source effect receipt");
  } finally { waiting = false; release.resolve(); await served.close(); await host.close(); await rm(home, { recursive: true, force: true }); }
});

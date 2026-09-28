import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalProjectDatabase } from '../apps/local-host/src/project-database.js';
import { seedDemoBoard, DEMO_BOARD_ID } from '../apps/local-host/src/demo-seed.js';
import { scheduleServiceFor } from '../apps/local-host/src/schedule-runtime.js';
import { createLocalFeedApplication } from '../apps/local-host/src/feed-application.js';
import { createScheduleReminders, deliverScheduleReminder, getScheduleReminder, reminderActions, SCHEDULE_REMINDER_PROVIDER_ID } from '@molis-ai/molis-work-plugin-schedule';
import { SqlitePluginRuntimeRepository } from '@molis-ai/molis-work-plugin-runtime';
import type { PluginInstanceRecord } from '@molis-ai/molis-work-contracts/platform/plugin';
import { studioStorage } from '../apps/local-host/src/plugin-builder/storage.js';
import { deliverHostReminder, LEGACY_REMINDER_OWNER, LEGACY_REMINDER_WAKEUP } from '../apps/local-host/src/schedule-reminders.js';
import { MolisWorkLocalHost, molisWorkHostProjectReference } from '../apps/local-host/src/project-host.js';
import { bindScheduledRuns, createScheduledRuns, registerInstalledCaller, runScheduled } from '../apps/local-host/src/plugin-builder/schedules.js';

function installation(install_id = 'install-1', plugin_id = 'io.molis.work.generated.a', installed_at = '2026-01-01T00:00:00.000Z'): PluginInstanceRecord {
  return { install_id, plugin_id, version: '1.0.0', publisher_id: 'test', publisher_signature: 'test', manifest_digest: 'test',
    deployment: 'local', selected_entrypoint: './plugin.mjs', grants: ['storage:private'], execution: 'sandbox', state: 'running', recovery_count: 0,
    last_error_code: null, installed_at, updated_at: installed_at, uninstalled_at: null, retain_private_data: false };
}

test('a plugin reminder reaches the Inbox at its time, under the plugin\'s name, and only its plugin can cancel it', async () => {
  const home = await mkdtemp(join(tmpdir(), 'molis-reminders-'));
  const path = join(home, 'project.db'); seedDemoBoard(path);
  const store = new LocalProjectDatabase(path);
  try {
    let clock = Date.parse('2026-09-27T00:00:00Z');
    const schedule = scheduleServiceFor(store.db, () => new Date(clock));
    new SqlitePluginRuntimeRepository(store.db).save(installation());
    const reminders = createScheduleReminders({ db: store.db, boardId: DEMO_BOARD_ID, projectId: 'p', schedule, now: () => clock,
      describe: identity => ({ title: '论语日课', link: '/plugins/' + identity.pluginId }) });
    const plugin = { projectId: 'p', installationId: 'install-1', pluginId: 'io.molis.work.generated.a', namespace: 'installed' as const };
    const other = { ...plugin, installationId: 'install-2', pluginId: 'io.molis.work.generated.b' };

    assert.throws(() => reminders.add(plugin, { at: '2026-09-27 08:00', text: '复习' }), /带时区的时间/);
    assert.throws(() => reminders.add(plugin, { at: '2026-09-26T08:00:00Z', text: '复习' }), /已经过去/);
    const { reminderId } = reminders.add(plugin, { at: '2026-09-27T08:00:00+08:00', text: '复习《学而》第一章' });
    const kept = reminders.add(plugin, { at: '2026-09-27T09:00:00+08:00', text: '明天也复习', repeat: 'daily' });
    assert.deepEqual(reminders.cancel(other, { reminderId }), { cancelled: false }, 'another plugin cannot touch it');
    assert.deepEqual(reminders.cancel({ ...plugin, installationId: 'reinstalled' }, { reminderId }), { cancelled: false }, 'the same plugin id does not transfer an old installation\'s reminders');

    clock = Date.parse('2026-09-27T00:30:00Z');
    await schedule.tick(new Date(clock));
    const inbox = () => createLocalFeedApplication(store.db).snapshot(DEMO_BOARD_ID).feed_items.filter(item => item.source_id === 'plugin-reminders');
    assert.deepEqual(inbox().map(item => item.title), ['论语日课：复习《学而》第一章']);
    assert.equal(inbox()[0]!.url, '/plugins/io.molis.work.generated.a', 'the reminder opens the plugin');
    const entries = (createLocalFeedApplication(store.db).snapshot(DEMO_BOARD_ID) as unknown as { inbox_entries: Array<{ subject_id: string; status: string }> }).inbox_entries;
    assert.ok(entries.some(entry => entry.subject_id === inbox()[0]!.item_id && entry.status === 'open'), 'it waits in the Inbox');
    assert.deepEqual(reminders.cancel(plugin, { reminderId }), { cancelled: false }, 'a one-off reminder is gone once delivered');

    assert.equal(reminders.cancelInstallation(plugin.pluginId, plugin.installationId), 1, 'uninstalling leaves no daily reminder behind');
    clock = Date.parse('2026-09-28T02:00:00Z');
    await schedule.tick(new Date(clock));
    assert.equal(inbox().length, 1, 'a cancelled reminder never fires');
    assert.ok(kept.reminderId);
  } finally { store.close(); await rm(home, { recursive: true, force: true }); }
});

test('scheduled callers are scoped by database and closing one rejects its late outcome without failure or completion writes', { timeout: 10_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-schedule-control-'));
  const stores = ['one', 'two'].map(name => { const path = join(home, name + '.db'); seedDemoBoard(path); return new LocalProjectDatabase(path); });
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const stops: Array<() => void> = []; let originalSignal!: AbortSignal, otherCalls = 0;
  try {
    bindScheduledRuns();
    const [one, two] = stores as [LocalProjectDatabase, LocalProjectDatabase], now = Date.parse('2026-09-27T00:00:00Z');
    const runs = createScheduledRuns({ boardId: DEMO_BOARD_ID, schedule: scheduleServiceFor(one.db, () => new Date(now)), storage: studioStorage(one.db, DEMO_BOARD_ID), now: () => now,
      installed: () => ({ title: 'Original', operations: [{ id: 'run' }] }), link: () => '/plugin' });
    const { scheduleId } = runs.add({ projectId: 'p', installationId: 'i', pluginId: 'plugin', namespace: 'installed' }, { operation: 'run', at: new Date(now + 1000).toISOString(), inbox: true });
    const storage = studioStorage(one.db, DEMO_BOARD_ID), original = storage.get('plugin-builder:run:' + scheduleId);
    const stopOriginal = await registerInstalledCaller(one.db, DEMO_BOARD_ID, async (_, _operation, _input, control) => {
      originalSignal = control.signal; entered.resolve(); await release.promise;
      return { status: 200, body: { value: 'late outcome' } };
    }); stops.push(stopOriginal);
    const stopOther = await registerInstalledCaller(two.db, DEMO_BOARD_ID, async () => { otherCalls++; return { status: 200 }; }); stops.push(stopOther);
    const pending = runScheduled(one.db, DEMO_BOARD_ID + '|' + scheduleId, new Date(now + 1000).toISOString());
    const rejected = assert.rejects(pending, /Installed caller stopped/);
    await entered.promise;
    stopOther(); assert.equal(originalSignal.aborted, false, 'another Home cannot revoke the original caller');
    stopOriginal(); assert.equal(originalSignal.aborted, true); release.resolve(); await rejected;
    assert.equal(otherCalls, 0);
    assert.equal(storage.get('plugin-builder:run:' + scheduleId), original, 'cancelled execution cannot consume the one-off record');
    for (const store of stores) assert.equal(createLocalFeedApplication(store.db).snapshot(DEMO_BOARD_ID).feed_items.filter(item => item.source_id === 'plugin-runs').length, 0);
  } finally { release.resolve(); stops.forEach(stop => stop()); stores.forEach(store => store.close()); await rm(home, { recursive: true, force: true }); }
});

test('Host discovers and executes Schedule reminders without opening Studio; reopen delivers once and another Home stays isolated', async () => {
  const home = await mkdtemp(join(tmpdir(), 'schedule-reminder-host-'));
  const paths = [join(home, 'one.db'), join(home, 'two.db')]; paths.forEach(path => seedDemoBoard(path));
  const refs = paths.map(databasePath => molisWorkHostProjectReference({ databasePath, boardId: DEMO_BOARD_ID, projectId: 'same-project' }));
  const hosts = [new MolisWorkLocalHost({ projectRoutePrefix: () => '' }), new MolisWorkLocalHost()];
  const caller = { actor_id: 'plugin:io.molis.work.generated.a', project_id: 'same-project', audience: 'plugin' as const, plugin_install_id: 'install-1', permissions: [] };
  const at = Date.now() + 1000;
  try {
    for (let i = 0; i < hosts.length; i++) await hosts[i]!.withProject(refs[i]!, runtime => new SqlitePluginRuntimeRepository(runtime.store.db).save(installation()));
    const client = hosts[0]!.actionClient(refs[0]!);
    const discovered = (await client.discover(caller)).filter(view => view.capability_id.startsWith('reminders.'));
    assert.deepEqual(discovered.map(view => view.capability_id).sort(), ['reminders.add', 'reminders.cancel']);
    assert.ok(discovered.every(view => view.provider.provider_id === SCHEDULE_REMINDER_PROVIDER_ID && view.availability.available));
    await assert.rejects(client.invoke({ ...caller, plugin_install_id: 'unknown' }, reminderActions.add, { at: new Date(at).toISOString(), text: '拒绝伪造安装' }), /安装当前没有运行/);
    const { reminderId } = await client.invoke(caller, reminderActions.add, { at: new Date(at).toISOString(), text: '只给第一个 Home' });
    await hosts[0]!.closeProject(refs[0]!);
    for (let i = 0; i < hosts.length; i++) await hosts[i]!.withProject(refs[i]!, async runtime => {
      const schedule = scheduleServiceFor(runtime.store.db);
      await schedule.tick(new Date(at + 1000)); await schedule.tick(new Date(at + 1000));
      const items = createLocalFeedApplication(runtime.store.db).snapshot(DEMO_BOARD_ID).feed_items.filter(item => item.source_id === 'plugin-reminders');
      assert.equal(items.length, i === 0 ? 1 : 0);
      if (i === 0) { assert.equal(items[0]!.summary, '只给第一个 Home'); assert.equal(items[0]!.url, '/plugins/io.molis.work.generated.a', 'the standalone project retains its real route'); assert.equal(getScheduleReminder(runtime.store.db, reminderId), null); }
    });
  } finally { await Promise.all(hosts.map(host => host.close())); await rm(home, { recursive: true, force: true }); }
});

test('legacy reminders migrate atomically with their original job and receipt; a reinstall cannot acquire them', async () => {
  const home = await mkdtemp(join(tmpdir(), 'schedule-reminder-legacy-')), path = join(home, 'project.db'); seedDemoBoard(path);
  let store = new LocalProjectDatabase(path);
  const clock = Date.parse('2026-09-27T00:00:00Z');
  try {
    const schedule = scheduleServiceFor(store.db, () => new Date(clock));
    const repository = new SqlitePluginRuntimeRepository(store.db); repository.save(installation());
    repository.save(installation('new-install', 'reinstalled-plugin', '2026-09-28T00:00:00Z'));
    const storage = studioStorage(store.db, DEMO_BOARD_ID), records = [];
    for (const [id, pluginId] of [['legacy', installation().plugin_id], ['ambiguous', 'reinstalled-plugin']]) {
      const job = schedule.register({ plugin_id: LEGACY_REMINDER_OWNER, capability_id: LEGACY_REMINDER_WAKEUP, object_ref: DEMO_BOARD_ID + '|' + id,
        title: '旧提醒', due_at: '2026-09-27T01:00:00.000Z', recurrence: { kind: 'interval', interval_ms: 86_400_000 } });
      const record = { id, boardId: DEMO_BOARD_ID, pluginId, pluginTitle: '旧插件', text: '兼容提醒', link: '/old-link', jobId: job.job_id, repeat: 'daily', at: job.next_due_at };
      storage.set('plugin-builder:reminder:' + id, JSON.stringify(record)); storage.set('plugin-builder:reminders:' + pluginId, JSON.stringify([id]));
      records.push({ job, record });
    }
    store.close(); store = new LocalProjectDatabase(path);
    const migrated = scheduleServiceFor(store.db, () => new Date(clock));
    assert.deepEqual(migrated.get(records[0]!.job.job_id), records[0]!.job, 'migration does not re-register the job or reset its due time');
    assert.equal(getScheduleReminder(store.db, 'legacy')?.installationId, 'install-1');
    assert.equal(getScheduleReminder(store.db, 'ambiguous')?.installationId, null);
    assert.equal(migrated.get(records[1]!.job.job_id)?.enabled, false, 'unproven ownership preserves and pauses the old reminder');
    assert.equal(studioStorage(store.db, DEMO_BOARD_ID).get('plugin-builder:reminder:legacy'), null);
    const again = scheduleServiceFor(store.db, () => new Date(clock));
    await again.tick(new Date('2026-09-27T02:00:00Z'));
    const after = again.get(records[0]!.job.job_id)!;
    assert.equal(after.next_due_at, '2026-09-28T01:00:00.000Z'); assert.equal(after.last_wakeup?.status, 'ok');
    const receipt = after.last_wakeup;
    assert.deepEqual(scheduleServiceFor(store.db).get(after.job_id)?.last_wakeup, receipt, 'repeated migration does not reset a receipt');
    const items = createLocalFeedApplication(store.db).snapshot(DEMO_BOARD_ID).feed_items.filter(item => item.source_id === 'plugin-reminders');
    assert.equal(items.length, 1); assert.equal(items[0]!.url, '/old-link');
  } finally { store.close(); await rm(home, { recursive: true, force: true }); }
});

test('reminder registration, cancellation and Inbox delivery roll back on real persistence or lease failures', async () => {
  const home = await mkdtemp(join(tmpdir(), 'schedule-reminder-atomic-')), path = join(home, 'project.db'); seedDemoBoard(path);
  const store = new LocalProjectDatabase(path), clock = Date.parse('2026-09-27T00:00:00Z');
  try {
    const schedule = scheduleServiceFor(store.db, () => new Date(clock)), identity = { projectId: 'p', installationId: 'install-1', pluginId: installation().plugin_id };
    new SqlitePluginRuntimeRepository(store.db).save(installation());
    const options = { db: store.db, boardId: DEMO_BOARD_ID, projectId: 'p', schedule, now: () => clock, describe: () => ({ title: '插件', link: '/plugin' }) };
    const reminders = createScheduleReminders(options);
    store.db.exec("CREATE TRIGGER refuse_reminder BEFORE INSERT ON schedule_plugin_reminders BEGIN SELECT RAISE(ABORT, 'disk-write-failed'); END");
    assert.throws(() => reminders.add(identity, { at: new Date(clock).toISOString(), text: 'fail' }), /disk-write-failed/);
    assert.equal(schedule.list().length, 0, 'a record failure cannot leave an orphan wakeup');
    store.db.exec('DROP TRIGGER refuse_reminder');
    const { reminderId } = reminders.add(identity, { at: new Date(clock).toISOString(), text: 'real reminder' });
    const record = getScheduleReminder(store.db, reminderId)!, job = schedule.get(record.jobId)!;
    const broken = createScheduleReminders({ ...options, schedule: { ...schedule, cancel(id, plugin) { schedule.cancel(id, plugin); throw new Error('cancel-disk-failed'); } } });
    assert.throws(() => broken.cancel(identity, { reminderId }), /cancel-disk-failed/);
    assert.ok(schedule.get(job.job_id)); assert.ok(getScheduleReminder(store.db, reminderId), 'failed cancellation retains both records');
    const input = { job_id: job.job_id, plugin_id: job.plugin_id, capability_id: job.capability_id, object_ref: job.object_ref, due_at: job.next_due_at };
    let checks = 0;
    assert.throws(() => deliverHostReminder(store.db, input, { signal: new AbortController().signal, beforeEffect() { if (++checks === 2) throw new Error('lease-revoked'); } }), /lease-revoked/);
    assert.ok(getScheduleReminder(store.db, reminderId));
    assert.equal(createLocalFeedApplication(store.db).snapshot(DEMO_BOARD_ID).feed_items.filter(item => item.source_id === 'plugin-reminders').length, 0, 'a late refusal rolls back Inbox and source creation');
    await schedule.tick(new Date(clock));
    assert.equal(getScheduleReminder(store.db, reminderId), null);
    assert.equal(createLocalFeedApplication(store.db).snapshot(DEMO_BOARD_ID).feed_items.filter(item => item.source_id === 'plugin-reminders').length, 1);
    assert.equal(deliverScheduleReminder(store.db, input, { signal: new AbortController().signal, beforeEffect() {} }, { currentInstallation: () => true, deliver() { assert.fail('consumed reminder must not deliver again'); } }).detail, '提醒已取消');
  } finally { store.close(); await rm(home, { recursive: true, force: true }); }
});

test('a scheduled run executes the installed plugin\'s own operation at its time and puts the result in the Inbox; one that comes due before the project opens runs when it does', async () => {
  const { bindScheduledRuns, createScheduledRuns, registerInstalledCaller } = await import('../apps/local-host/src/plugin-builder/schedules.js');
  const home = await mkdtemp(join(tmpdir(), 'molis-scheduled-runs-'));
  const path = join(home, 'project.db'); seedDemoBoard(path);
  const store = new LocalProjectDatabase(path);
  try {
    let clock = Date.parse('2026-09-27T00:00:00Z');
    const schedule = scheduleServiceFor(store.db, () => new Date(clock));
    bindScheduledRuns();
    const runs = createScheduledRuns({ boardId: DEMO_BOARD_ID, schedule, storage: studioStorage(store.db, DEMO_BOARD_ID), now: () => clock,
      installed: pluginId => pluginId.endsWith('.a') ? { title: '每日汇总', operations: [{ id: 'digest.run', description: '汇总今天记下的事' }, { id: 'digest.list' }] } : undefined,
      link: pluginId => '/plugins/' + pluginId });
    const plugin = { projectId: 'p', installationId: 'install-1', pluginId: 'io.molis.work.generated.a', namespace: 'installed' as const };
    assert.throws(() => runs.add(plugin, { operation: 'other.run', at: '2026-09-27T08:00:00+08:00' }), /只能定时运行这个插件自己的功能/);
    assert.throws(() => runs.add({ ...plugin, pluginId: 'io.molis.work.generated.b' }, { operation: 'digest.run', at: '2026-09-27T08:00:00+08:00' }), /安装好的插件/);
    runs.add(plugin, { operation: 'digest.run', at: '2026-09-27T08:00:00+08:00', repeat: 'daily', input: { day: 'today' }, inbox: true });

    // Due before the project's studio started: it waits, then runs when the studio starts.
    clock = Date.parse('2026-09-27T00:30:00Z');
    await schedule.tick(new Date(clock));
    const inbox = () => createLocalFeedApplication(store.db).snapshot(DEMO_BOARD_ID).feed_items.filter(item => item.source_id === 'plugin-runs');
    assert.equal(inbox().length, 0);
    const calls: Array<[string, string, unknown]> = [];
    const stop = await registerInstalledCaller(store.db, DEMO_BOARD_ID, async (pluginId, operation, input) => { calls.push([pluginId, operation, input]); return { status: 200, body: { value: { text: '今天记了 3 件事', count: 3 } } }; });
    assert.deepEqual(calls, [['io.molis.work.generated.a', 'digest.run', { day: 'today' }]], 'the plugin\'s own operation, with the input it scheduled');
    assert.deepEqual(inbox().map(item => [item.title, item.summary]), [['每日汇总：今天记了 3 件事', '今天记了 3 件事']], 'the result itself is the title');
    assert.equal(inbox()[0]!.url, '/plugins/io.molis.work.generated.a');

    // The next day it runs straight away; a failure reaches the person even without inbox.
    stop();
    const failing = await registerInstalledCaller(store.db, DEMO_BOARD_ID, async () => ({ status: 409, body: { error: '这个插件当前没有运行（可能已停用）' } }));
    clock = Date.parse('2026-09-28T01:00:00Z');
    await schedule.tick(new Date(clock));
    const failed = inbox().find(item => /没有完成/.test(item.title));
    assert.ok(failed, JSON.stringify(inbox().map(item => item.title))); assert.match(failed!.summary ?? '', /没有运行/);
    failing();
    assert.equal(runs.cancelAll(plugin.pluginId), 1, 'uninstalling leaves no schedule behind');
  } finally { store.close(); await rm(home, { recursive: true, force: true }); }
});

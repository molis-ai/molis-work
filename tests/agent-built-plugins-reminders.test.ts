import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalProjectDatabase } from '../apps/local-host/src/project-database.js';
import { seedDemoBoard, DEMO_BOARD_ID } from '../apps/local-host/src/demo-seed.js';
import { scheduleServiceFor } from '../apps/local-host/src/schedule-runtime.js';
import { createLocalFeedApplication } from '../apps/local-host/src/feed-application.js';
import { bindReminderDelivery, createReminders, studioStorage } from '../apps/local-host/src/plugin-builder/reminders.js';

test('a plugin reminder reaches the Inbox at its time, under the plugin\'s name, and only its plugin can cancel it', async () => {
  const home = await mkdtemp(join(tmpdir(), 'molis-reminders-'));
  const path = join(home, 'project.db'); seedDemoBoard(path);
  const store = new LocalProjectDatabase(path);
  try {
    let clock = Date.parse('2026-09-27T00:00:00Z');
    const schedule = scheduleServiceFor(store.db, () => new Date(clock));
    bindReminderDelivery();
    const reminders = createReminders({ boardId: DEMO_BOARD_ID, schedule, storage: studioStorage(store.db, DEMO_BOARD_ID), now: () => clock,
      title: () => '论语日课', link: pluginId => '/plugins/' + pluginId });
    const plugin = { projectId: 'p', installationId: 'install-1', pluginId: 'io.molis.work.generated.a', namespace: 'installed' as const };
    const other = { ...plugin, installationId: 'install-2', pluginId: 'io.molis.work.generated.b' };

    assert.throws(() => reminders.add(plugin, { at: '2026-09-27 08:00', text: '复习' }), /带时区的时间/);
    assert.throws(() => reminders.add(plugin, { at: '2026-09-26T08:00:00Z', text: '复习' }), /已经过去/);
    const { reminderId } = reminders.add(plugin, { at: '2026-09-27T08:00:00+08:00', text: '复习《学而》第一章' });
    const kept = reminders.add(plugin, { at: '2026-09-27T09:00:00+08:00', text: '明天也复习', repeat: 'daily' });
    assert.deepEqual(reminders.cancel(other, { reminderId }), { cancelled: false }, 'another plugin cannot touch it');

    clock = Date.parse('2026-09-27T00:30:00Z');
    await schedule.tick(new Date(clock));
    const inbox = () => createLocalFeedApplication(store.db).snapshot(DEMO_BOARD_ID).feed_items.filter(item => item.source_id === 'plugin-reminders');
    assert.deepEqual(inbox().map(item => item.title), ['论语日课：复习《学而》第一章']);
    assert.equal(inbox()[0]!.url, '/plugins/io.molis.work.generated.a', 'the reminder opens the plugin');
    const entries = (createLocalFeedApplication(store.db).snapshot(DEMO_BOARD_ID) as unknown as { inbox_entries: Array<{ subject_id: string; status: string }> }).inbox_entries;
    assert.ok(entries.some(entry => entry.subject_id === inbox()[0]!.item_id && entry.status === 'open'), 'it waits in the Inbox');
    assert.deepEqual(reminders.cancel(plugin, { reminderId }), { cancelled: false }, 'a one-off reminder is gone once delivered');

    assert.equal(reminders.cancelAll(plugin.pluginId), 1, 'uninstalling leaves no daily reminder behind');
    clock = Date.parse('2026-09-28T02:00:00Z');
    await schedule.tick(new Date(clock));
    assert.equal(inbox().length, 1, 'a cancelled reminder never fires');
    assert.ok(kept.reminderId);
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

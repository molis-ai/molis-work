import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import type { PluginInstanceRecord } from '@molis-ai/molis-work-contracts/platform/plugin';
import { createScheduleService, PluginWakeupIndex } from '@molis-ai/molis-work-service-scheduler';
import { createScheduledOperationManagement, createScheduledOperations, getScheduledOperation, listScheduledOperations, listScheduledOperationOccurrences,
  prepareScheduledOperation, reconcileScheduledOperations, runScheduledOperation, setScheduledOperationEnabled,
  SCHEDULE_PLUGIN_ID, SCHEDULE_OPERATION_WAKEUP } from '@molis-ai/molis-work-plugin-schedule';
import { SqlitePluginRuntimeRepository } from '@molis-ai/molis-work-plugin-runtime';
import { LocalProjectDatabase } from '../apps/local-host/src/project-database.js';
import { seedDemoBoard, DEMO_PROJECT_ID } from '../apps/local-host/src/demo-seed.js';
import { scheduleServiceFor } from '../apps/local-host/src/schedule-runtime.js';
import { bindInstalledOperationCaller, hostScheduledOperationManagement } from '../apps/local-host/src/schedule-operations.js';
import { createLocalFeedApplication } from '../apps/local-host/src/feed-application.js';

const at = '2026-09-28T00:00:00.000Z', DAY = 86_400_000;
const identity = { projectId: 'p', pluginId: 'io.molis.work.test.operations', installationId: 'installed' };
const installation = (generation = 'first'): PluginInstanceRecord => ({ install_id: identity.installationId, plugin_id: identity.pluginId,
  installation_generation: generation, version: '1.0.0', publisher_id: 'test', publisher_signature: 'test', manifest_digest: 'test', deployment: 'local',
  selected_entrypoint: './plugin.mjs', grants: ['storage:private'], execution: 'sandbox', state: 'running', recovery_count: 0,
  last_error_code: null, installed_at: at, updated_at: at, uninstalled_at: null, retain_private_data: false });
const descriptor = (generation = 'first') => ({ installationId: identity.installationId, generation, title: '定时笔记', version: '1.0.0', operations: [{ id: 'summarize', description: '汇总' }] });

async function harness(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), 'schedule-operations-')), path = join(home, 'project.db'); seedDemoBoard(path);
  const store = new LocalProjectDatabase(path), clock = { now: new Date(at) };
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  const repository = new SqlitePluginRuntimeRepository(store.db); repository.save(installation());
  const schedule = scheduleServiceFor(store.db, () => clock.now);
  const options = { db: store.db, projectId: DEMO_PROJECT_ID, schedule, describe: () => descriptor(repository.get(identity.installationId)!.installation_generation),
    now: () => clock.now.getTime(), link: () => '/original-plugin' };
  const operations = createScheduledOperations(options);
  const get = (id: string) => getScheduledOperation(store.db, DEMO_PROJECT_ID, id)!;
  const occurrences = (id: string) => listScheduledOperationOccurrences(store.db, DEMO_PROJECT_ID, id);
  const inbox = () => createLocalFeedApplication(store.db).snapshot(DEMO_PROJECT_ID).feed_items.filter(item => item.source_id === 'plugin-runs');
  return { home, path, store, clock, repository, schedule, operations, options, get, occurrences, inbox };
}

test('unavailable execution remains durable; binding cannot dispatch, a fresh tick runs once with Inbox and fixed cadence', async t => {
  const h = await harness(t), { scheduleId } = h.operations.add(identity, { at, operation: 'summarize', input: { limit: 3 }, inbox: true, repeat: 'daily' });
  await h.schedule.tick();
  assert.equal(h.occurrences(scheduleId)[0]?.state, 'pending');
  assert.equal(h.schedule.get(h.get(scheduleId).jobId)?.next_due_at, at);
  assert.equal(h.schedule.get(h.get(scheduleId).jobId)?.last_wakeup?.status, 'plugin_unavailable');
  let calls = 0;
  const stop = bindInstalledOperationCaller(h.store.db, DEMO_PROJECT_ID, { describe: () => descriptor(), async call(run, control) {
    control.beforeEffect(); calls++; assert.deepEqual(run.input, { limit: 3 });
    assert.equal(h.occurrences(scheduleId)[0]?.state, 'running'); return { state: 'succeeded', value: { text: '今天的汇总' } };
  } }); t.after(stop);
  await Promise.resolve(); assert.equal(calls, 0, 'startup registration is never an execution trigger');
  await h.schedule.tick(); await h.schedule.tick();
  assert.equal(calls, 1); assert.equal(h.occurrences(scheduleId)[0]?.state, 'succeeded');
  assert.equal(h.schedule.get(h.get(scheduleId).jobId)?.next_due_at, '2026-09-29T00:00:00.000Z');
  assert.deepEqual(h.inbox().map(item => [item.summary, item.url]), [['今天的汇总', '/original-plugin']]);
  assert.deepEqual(h.operations.cancel({ ...identity, pluginId: 'other' }, { scheduleId }), { cancelled: false });
  assert.deepEqual(h.operations.cancel(identity, { scheduleId }), { cancelled: true });
  h.clock.now = new Date(Date.parse(at) + DAY); await h.schedule.tick(); assert.equal(calls, 1);
});

test('an explicit failure is failed, and an unknown outcome stops future cadence without an automatic replay', async t => {
  const h = await harness(t);
  const failed = h.operations.add(identity, { at, operation: 'summarize' }).scheduleId;
  let calls = 0, unknown = false;
  const stop = bindInstalledOperationCaller(h.store.db, DEMO_PROJECT_ID, { describe: () => descriptor(), async call() {
    calls++; return { state: unknown ? 'unknown' : 'failed', value: 'provider rejected' };
  } }); t.after(stop);
  await h.schedule.tick();
  assert.equal(h.get(failed).state, 'completed'); assert.equal(h.occurrences(failed)[0]?.state, 'failed');
  assert.equal(h.schedule.get(h.get(failed).jobId)?.last_wakeup?.status, 'failed'); assert.equal(h.inbox().length, 1);
  unknown = true;
  const uncertain = h.operations.add(identity, { at, operation: 'summarize', repeat: 'daily' }).scheduleId;
  await h.schedule.tick(); h.clock.now = new Date(Date.parse(at) + 2 * DAY); await h.schedule.tick();
  assert.equal(calls, 2); assert.equal(h.get(uncertain).state, 'needs_review'); assert.equal(h.occurrences(uncertain)[0]?.state, 'unknown');
  assert.equal(h.inbox().length, 1, 'unknown is not fabricated into an ordinary failure');
  assert.throws(() => setScheduledOperationEnabled(h.store.db, h.schedule, h.get(uncertain).jobId, true), /结果未知/);
});

for (const revoke of ['pause', 'cancel', 'reinstall', 'replace-caller', 'lease-expired'] as const) test(`scheduled ${revoke} refuses a late result and any late Inbox effect`, async t => {
  const h = await harness(t), released = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>();
  let calls = 0;
  const id = h.operations.add(identity, { at, operation: 'summarize', repeat: 'daily', inbox: true }).scheduleId, jobId = h.get(id).jobId;
  const stop = bindInstalledOperationCaller(h.store.db, DEMO_PROJECT_ID, { describe: () => descriptor(), async call() {
    calls++; entered.resolve(); await released.promise; return { state: 'succeeded', value: 'late answer' };
  } }); t.after(stop);
  const ticking = h.schedule.tick(); await entered.promise;
  try {
    if (revoke === 'pause') setScheduledOperationEnabled(h.store.db, h.schedule, jobId, false);
    if (revoke === 'cancel') h.operations.cancel(identity, { scheduleId: id });
    if (revoke === 'reinstall') h.repository.save(installation('replacement'));
    if (revoke === 'lease-expired') h.clock.now = new Date(Date.parse(at) + 30_000);
    if (revoke === 'replace-caller') {
      t.after(bindInstalledOperationCaller(h.store.db, DEMO_PROJECT_ID, { describe: () => descriptor(), async call() { assert.fail('replacement must not replay'); } }));
    }
  } finally { released.resolve(); await ticking; }
  assert.equal(h.inbox().length, 0);
  if (revoke === 'cancel') assert.equal(h.get(id), null);
  else { assert.equal(h.get(id).state, 'needs_review'); assert.equal(h.occurrences(id)[0]?.state, 'unknown'); }
  if (revoke === 'lease-expired') assert.equal(h.schedule.get(jobId)?.last_wakeup, null, 'expired execution cannot record a technical success or failure');
  h.clock.now = new Date(Date.parse(at) + DAY); await h.schedule.tick(); assert.equal(h.inbox().length, 0);
  assert.equal(calls, 1, 'unknown external results must not be automatically replayed');
});

test('installation generation, Home isolation, quotas and real write failures guard the whole schedule transaction', async t => {
  const h = await harness(t), other = await harness(t);
  h.store.db.exec("CREATE TRIGGER reject_plan BEFORE INSERT ON schedule_operations BEGIN SELECT RAISE(ABORT, 'plan-write-failed'); END");
  assert.throws(() => h.operations.add(identity, { at, operation: 'summarize' }), /plan-write-failed/);
  assert.equal(h.schedule.list().length, 0); h.store.db.exec('DROP TRIGGER reject_plan');
  const old = h.operations.add(identity, { at, operation: 'summarize' });
  assert.deepEqual(other.operations.cancel(identity, old), { cancelled: false });
  h.repository.save(installation('replacement'));
  assert.deepEqual(h.operations.cancel(identity, old), { cancelled: false });
  await h.schedule.tick(); assert.equal(h.get(old.scheduleId).state, 'needs_confirmation');
  const current = Array.from({ length: 20 }, () => h.operations.add(identity, { at, operation: 'summarize' }));
  assert.throws(() => h.operations.add(identity, { at, operation: 'summarize' }), /太多/);
  const broken = createScheduledOperations({ ...h.options, schedule: { ...h.schedule, cancel(id, owner) { h.schedule.cancel(id, owner); throw new Error('cancel-failed'); } } });
  assert.throws(() => broken.cancel(identity, current[0]!), /cancel-failed/);
  assert.ok(h.schedule.get(h.get(current[0]!.scheduleId).jobId));
  assert.equal(h.operations.cancelInstallation(identity.pluginId, identity.installationId), 21);
  assert.equal(h.schedule.list().length, 0); assert.equal(listScheduledOperations(h.store.db).length, 0);
});

test('lease preparation rolls back together and a failed result commit leaves unknown work, never duplicate side effects', async t => {
  const h = await harness(t), index = new PluginWakeupIndex(); let calls = 0;
  index.register(SCHEDULE_PLUGIN_ID, SCHEDULE_OPERATION_WAKEUP, async (input, control) => runScheduledOperation(h.store.db, input, control, {
    currentInstallation: () => true,
    executor: () => ({ signal: control.signal, beforeEffect() {}, async invoke() { calls++; return { state: 'succeeded', value: 'saved externally' }; } }),
    deliver() { h.store.db.prepare('INSERT INTO scheduled_test_delivery VALUES (1)').run(); throw new Error('delivery-failed'); },
  }), { prepare(input) { prepareScheduledOperation(h.store.db, input); if (failPrepare) throw new Error('prepare-failed'); } });
  const schedule = createScheduleService(h.store.db, { wakeupIndex: index, now: () => h.clock.now });
  let failPrepare = true;
  const id = h.operations.add(identity, { at, operation: 'summarize', inbox: true }).scheduleId, job = schedule.get(h.get(id).jobId)!;
  await assert.rejects(schedule.tick(), /prepare-failed/);
  assert.deepEqual(schedule.get(job.job_id), job); assert.equal(schedule.isExecuting(job.job_id), false);
  assert.equal(h.occurrences(id).length, 0); assert.equal(calls, 0);
  failPrepare = false; h.store.db.exec('CREATE TABLE scheduled_test_delivery(n INTEGER)');
  await schedule.tick(); reconcileScheduledOperations(h.store.db, schedule);
  assert.equal(calls, 1); assert.equal(h.get(id).state, 'needs_review');
  assert.equal(h.occurrences(id)[0]?.state, 'unknown');
  assert.equal((h.store.db.prepare('SELECT COUNT(*) AS n FROM scheduled_test_delivery').get() as { n: number }).n, 0);
  await schedule.tick(); assert.equal(calls, 1);
});

for (const mode of ['before-dispatch', 'after-dispatch', 'after-commit'] as const) test(`real process death ${mode} cannot lose prepared work or replay a dispatched occurrence`, async t => {
  const h = await harness(t), id = h.operations.add(identity, { at, operation: 'summarize' }).scheduleId;
  h.store.db.exec('CREATE TABLE scheduled_test_effects(n INTEGER); INSERT INTO scheduled_test_effects VALUES (0)');
  const child = fork(new URL('./fixtures/scheduled-operation-crash.ts', import.meta.url), [h.path, at, mode], { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let stderr = ''; child.stderr!.on('data', chunk => { stderr += chunk; });
  const exited = once(child, 'exit');
  try {
    const signal = AbortSignal.timeout(15_000);
    const [phase] = await Promise.race([once(child, 'message', { signal }), exited.then(() => { throw new Error('Child exited before checkpoint: ' + stderr); })]);
    assert.equal(phase, mode === 'before-dispatch' ? 'prepared' : mode === 'after-dispatch' ? 'dispatched' : 'committed');
  } finally { child.kill('SIGKILL'); await exited; }
  const clock = new Date(Date.parse(at) + 60_000), reopened = new LocalProjectDatabase(h.path); t.after(() => reopened.close());
  const index = new PluginWakeupIndex(); let replays = 0;
  index.register(SCHEDULE_PLUGIN_ID, SCHEDULE_OPERATION_WAKEUP, (input, control) => runScheduledOperation(reopened.db, input, control, {
    currentInstallation: () => true, now: () => clock,
    executor: () => ({ signal: control.signal, beforeEffect() {}, async invoke() { replays++; reopened.db.prepare('UPDATE scheduled_test_effects SET n = n + 1').run(); return { state: 'succeeded', value: 'restored' }; } }),
    deliver() { assert.fail('Inbox not requested'); },
  }), { prepare: input => prepareScheduledOperation(reopened.db, input) });
  const schedule = createScheduleService(reopened.db, { wakeupIndex: index, now: () => clock });
  reconcileScheduledOperations(reopened.db, schedule); await schedule.tick(); reconcileScheduledOperations(reopened.db, schedule); await schedule.tick();
  assert.equal(replays, mode === 'before-dispatch' ? 1 : 0);
  assert.equal((reopened.db.prepare('SELECT n FROM scheduled_test_effects').get() as { n: number }).n, 1);
  const run = getScheduledOperation(reopened.db, DEMO_PROJECT_ID, id)!;
  assert.equal(run.state, mode === 'after-dispatch' ? 'needs_review' : 'completed');
  assert.equal(listScheduledOperationOccurrences(reopened.db, DEMO_PROJECT_ID, id)[0]?.state, mode === 'after-dispatch' ? 'unknown' : 'succeeded');
});

test('review rechecks installation and operation history, rolls back failed recovery and resumes the original queue with its receipt', async t => {
  const h = await harness(t), id = h.operations.add(identity, { at, operation: 'summarize', input: { text: 'original' }, inbox: true, repeat: 'daily' }).scheduleId;
  const job = h.schedule.get(h.get(id).jobId)!;
  // The plugin is reinstalled before the first run: the operation waits for the person to hand it to the new installation.
  h.repository.save(installation('second'));
  await h.schedule.tick();
  assert.equal(h.get(id).state, 'needs_confirmation'); assert.equal(h.schedule.get(job.job_id)?.enabled, false);
  let target = { ...descriptor('second'), publisher: 'test' }, calls = 0;
  const manage = createScheduledOperationManagement({ db: h.store.db, projectId: DEMO_PROJECT_ID, schedule: h.schedule, currentInstallation: () => target, now: () => h.clock.now });
  const confirmation = () => { const v = manage.list()[0]!; return { operation_id: v.id, decision: 'resume' as const, expected_revision: v.revision,
    expected_installation_id: target.installationId, expected_generation: target.generation, expected_version: target.version }; };
  const before = confirmation(); target = { ...target, version: '2.0.0' };
  assert.throws(() => manage.recover(before), /版本已变更/);
  const input = confirmation();
  const broken = createScheduledOperationManagement({ db: h.store.db, projectId: DEMO_PROJECT_ID, currentInstallation: () => target,
    schedule: { ...h.schedule, register(value) { h.schedule.register(value); throw new Error('recovery-write-failed'); } } });
  assert.throws(() => broken.recover(input), /recovery-write-failed/);
  assert.equal(h.get(id).state, 'needs_confirmation'); assert.equal(h.schedule.get(job.job_id)?.enabled, false);
  manage.recover(input);
  assert.equal(h.get(id).installationGeneration, target.generation); assert.equal(h.get(id).link, '/original-plugin');
  assert.equal(h.schedule.get(job.job_id)?.next_due_at, at);
  assert.throws(() => manage.recover(input), /已变更/, 'duplicate submissions do not rearm a job');
  t.after(bindInstalledOperationCaller(h.store.db, DEMO_PROJECT_ID, { describe: () => target, async call() { calls++; return { state: 'succeeded', value: 'restored' }; } }));
  await h.schedule.tick(); assert.equal(calls, 1);
  const read = manage.list()[0]!, receipt = h.schedule.get(job.job_id)?.last_wakeup;
  setScheduledOperationEnabled(h.store.db, h.schedule, job.job_id, false);
  assert.throws(() => manage.recover({ ...input, expected_revision: read.revision }), /已变更/);
  assert.deepEqual(h.schedule.get(job.job_id)?.last_wakeup, receipt); assert.equal(h.schedule.get(job.job_id)?.enabled, false);
});

for (const decision of ['retry', 'skip'] as const) test(`review ${decision} of an unknown call is explicit, preserves history, and never dispatches during confirmation`, async t => {
  const h = await harness(t), id = h.operations.add(identity, { at, operation: 'summarize', inbox: true }).scheduleId;
  let calls = 0;
  t.after(bindInstalledOperationCaller(h.store.db, DEMO_PROJECT_ID, { describe: () => descriptor(), async call() {
    calls++; return { state: calls === 1 ? 'unknown' : 'succeeded', value: calls === 1 ? 'response lost' : 'after review' };
  } }));
  await h.schedule.tick();
  const manage = hostScheduledOperationManagement({ db: h.store.db, projectId: DEMO_PROJECT_ID, schedule: h.schedule, now: () => h.clock.now });
  const v = manage.list()[0]!, input = { operation_id: id, decision, expected_revision: v.revision,
    expected_installation_id: v.installation!.installationId, expected_generation: v.installation!.generation, expected_version: v.installation!.version };
  assert.throws(() => manage.recover({ ...input, decision: 'resume' }), /明确选择/);
  const other = createScheduledOperationManagement({ db: h.store.db, projectId: 'another-board', schedule: h.schedule, currentInstallation: () => v.installation });
  assert.throws(() => other.recover(input), /不存在/);
  manage.recover(input); assert.equal(calls, 1);
  assert.throws(() => manage.recover(input), /已变更/);
  await h.schedule.tick(); await h.schedule.tick();
  assert.equal(calls, decision === 'retry' ? 2 : 1);
  assert.equal(h.get(id).state, 'completed');
  assert.equal(h.occurrences(id)[0]?.state, decision === 'retry' ? 'succeeded' : 'skipped');
  assert.deepEqual(h.occurrences(id)[0]?.decisions, [{ decision, at, previousDetail: 'response lost' }]);
  assert.equal(h.inbox().length, decision === 'retry' ? 1 : 0);
});

test('skipping an unknown interval keeps its original anchor and advances beyond missed periods', async t => {
  const h = await harness(t), id = h.operations.add(identity, { at, operation: 'summarize', repeat: 'daily' }).scheduleId;
  let calls = 0;
  t.after(bindInstalledOperationCaller(h.store.db, DEMO_PROJECT_ID, { describe: () => descriptor(), async call() { calls++; return { state: 'unknown', value: 'external result lost' }; } }));
  await h.schedule.tick(); h.clock.now = new Date(Date.parse(at) + 3 * DAY + 1000);
  const manage = hostScheduledOperationManagement({ db: h.store.db, projectId: DEMO_PROJECT_ID, schedule: h.schedule, now: () => h.clock.now });
  const v = manage.list()[0]!;
  manage.recover({ operation_id: id, decision: 'skip', expected_revision: v.revision, expected_installation_id: identity.installationId, expected_generation: 'first', expected_version: '1.0.0' });
  assert.equal(h.schedule.get(h.get(id).jobId)?.next_due_at, '2026-10-02T00:00:00.000Z');
  await h.schedule.tick(); assert.equal(calls, 1);
});

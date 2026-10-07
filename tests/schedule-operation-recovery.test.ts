import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bindActionClient } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PluginInstanceRecord } from '@molis-ai/molis-work-contracts/platform/plugin';
import { SqlitePluginRuntimeRepository } from '@molis-ai/molis-work-plugin-runtime';
import { createScheduledOperations, saveScheduledOperation, getScheduledOperation, saveScheduledOperationOccurrence, listScheduledOperationOccurrences,
  scheduleActions, SCHEDULE_ACTION_PERMISSIONS, SchedulePluginRouteTable, createScheduleRouteHandlers, type ScheduledOperationView } from '@molis-ai/molis-work-plugin-schedule';
import { MolisWorkLocalHost, molisWorkHostProjectReference } from '../apps/local-host/src/project-host.js';
import { seedDemoBoard } from '../apps/local-host/src/demo-seed.js';
import { scheduleServiceFor } from '../apps/local-host/src/schedule-runtime.js';
import { bindInstalledOperationCaller } from '../apps/local-host/src/schedule-operations.js';
import { openGoalBrowser } from './fixtures/goal-browser.js';

const pluginId = 'io.molis.work.test.recovery';
const installation = (generation = 'original'): PluginInstanceRecord => ({ install_id: 'review-install', plugin_id: pluginId, installation_generation: generation,
  version: '1.0.0', publisher_id: 'test', publisher_signature: 'test', manifest_digest: 'test', deployment: 'local', selected_entrypoint: './plugin.mjs', grants: ['storage:private'],
  execution: 'sandbox', state: 'running', recovery_count: 0, last_error_code: null, installed_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', uninstalled_at: null, retain_private_data: false });
const descriptor = (generation = 'original') => ({ installationId: 'review-install', generation, version: '1.0.0', title: '笔记汇总', operations: [{ id: 'summarize', description: '汇总本周笔记' }] });
const inputFor = (view: ScheduledOperationView) => ({ operation_id: view.id, decision: 'skip' as const, expected_revision: view.revision,
  expected_installation_id: view.installation!.installationId, expected_generation: view.installation!.generation, expected_version: view.installation!.version });
function seedUnknown(db: Parameters<typeof scheduleServiceFor>[0], projectId: string) {
  const schedule = scheduleServiceFor(db), at = new Date(Date.now() + 86_400_000).toISOString();
  new SqlitePluginRuntimeRepository(db).save(installation());
  const plans = createScheduledOperations({ db, projectId, schedule, describe: () => descriptor(), link: () => '/original-link' });
  const id = plans.add({ projectId, pluginId, installationId: 'review-install' }, { operation: 'summarize', at, input: { topic: '<本周> 笔记' } }).scheduleId;
  const run = getScheduledOperation(db, projectId, id)!;
  saveScheduledOperation(db, { ...run, state: 'needs_review', detail: '上次调用已派出但结果未知' });
  saveScheduledOperationOccurrence(db, { projectId, operationId: id, dueAt: at, state: 'unknown', detail: '调用中断', startedAt: at, finishedAt: null });
  schedule.setEnabled(run.jobId, false);
  return id;
}

test('operation recovery is a public authorized Host/HTTP action; plugin callers, stale snapshots and other projects are refused', async () => {
  const home = await mkdtemp(join(tmpdir(), 'operation-recovery-host-')), databasePath = join(home, 'project.db'); seedDemoBoard(databasePath, 'p');
  const host = new MolisWorkLocalHost(), ref = molisWorkHostProjectReference({ databasePath, projectId: 'p' });
  let stop = () => {};
  try {
    const id = await host.withProject(ref, runtime => {
      const id = seedUnknown(runtime.store.db, 'p');
      stop = bindInstalledOperationCaller(runtime.store.db, 'p', { describe: () => descriptor(), async call() { assert.fail('confirmation never invokes'); } }); return id;
    });
    const caller = { actor_id: 'owner', project_id: 'p', audience: 'user' as const, permissions: SCHEDULE_ACTION_PERMISSIONS };
    const client = host.actionClient(ref), bound = bindActionClient(client, () => caller);
    const view = (await bound.invoke(scheduleActions.list, {})).operations.find(item => item.id === id)!;
    assert.deepEqual(view.input, { topic: '<本周> 笔记' }); assert.equal(view.installation?.publisher, 'test');
    const input = inputFor(view);
    await assert.rejects(client.invoke({ ...caller, audience: 'plugin', actor_id: 'plugin:' + pluginId, plugin_install_id: 'review-install' }, scheduleActions.recoverOperation, input), { code: 'actions.forbidden' });
    await assert.rejects(client.invoke({ ...caller, project_id: 'elsewhere' }, scheduleActions.recoverOperation, input), { code: 'actions.scope_mismatch' });
    await assert.rejects(client.invoke({ ...caller, permissions: ['schedule:read'] }, scheduleActions.recoverOperation, input), { code: 'actions.forbidden' });
    await assert.rejects(client.invoke({ ...caller, validate_authority() { throw new Error('revoked'); } }, scheduleActions.recoverOperation, input), /revoked/);
    let changes = 0;
    const routes = new SchedulePluginRouteTable(createScheduleRouteHandlers({ actions: bound, changed() { changes++; } }));
    const response = await routes.handle({ method: 'POST', pathname: `/api/schedule/operations/${id}/recover`, query: new URLSearchParams(), body: input });
    assert.equal(response?.status, 200); assert.equal(changes, 1);
    assert.equal((response?.body as { operation: ScheduledOperationView }).operation.state, 'completed');
    await assert.rejects(bound.invoke(scheduleActions.recoverOperation, input), /已变更/);
  } finally { stop(); await host.close(); await rm(home, { recursive: true, force: true }); }
});

test('narrow Schedule UI reviews unknown outcomes, cancels safely and rejects a stale installation before an explicit skip', { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, true, seedDemoBoard, null); if (!b) return;
  const projectId = b.projectId!;
  const ref = molisWorkHostProjectReference({ databasePath: b.databasePath, projectId });
  // The browser server imports the built Host, so bind to that owner and its database connection.
  const { bindInstalledOperationCaller: bind } = await import('../apps/local-host/dist/schedule-operations.js');
  let generation = 'original';
  const id = await b.localHost!.withProject(ref, runtime => {
    const id = seedUnknown(runtime.store.db, projectId);
    t.after(bind(runtime.store.db, projectId, { describe: () => descriptor(generation), async call() { assert.fail('skipped work must not run'); } })); return id;
  });
  await b.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, b.sessionId);
  await b.navigate(() => b.command('Page.navigate', { url: `${b.origin}/projects/${projectId}/` }, b.sessionId));
  await b.click('[data-plugin-strip] [data-plugin-id=schedule]');
  await b.click(`[data-schedule-row][data-schedule-job-id="operation:${id}"]`);
  assert.match(await b.evaluate<string>("document.querySelector('[data-schedule-detail]:not([hidden])').textContent"), /结果待核对/);
  await b.click('[data-schedule-operation-decision=retry]');
  assert.match(await b.evaluate<string>("document.querySelector('[data-operation-review-warning]').textContent"), /可能重复/);
  await b.click('[data-schedule-operation-form] footer [data-schedule-operation-close]');
  assert.equal(getScheduledOperation(b.store.db, projectId, id)?.state, 'needs_review');
  await b.click('[data-schedule-operation-decision=skip]');
  generation = 'replacement'; new SqlitePluginRuntimeRepository(b.store.db).save(installation(generation));
  await b.click('[data-schedule-operation-form] [type=submit]');
  await b.waitFor("document.querySelector('[data-operation-review-error]').textContent.includes('安装或版本已变更')");
  assert.equal(getScheduledOperation(b.store.db, projectId, id)?.state, 'needs_review');
  await b.evaluate(`{ const original = window.fetch; window.restoreOperationFetch = () => window.fetch = original;
    window.fetch = (url, options) => String(url).endsWith('/api/schedule/workbench') ? Promise.resolve(new Response('unavailable', { status: 503 })) : original(url, options); }`);
  await b.click('[data-operation-review-refresh]');
  await b.waitFor("document.querySelector('[data-operation-review-error]').textContent.includes('无法更新')");
  assert.equal(await b.evaluate("document.querySelector('[data-schedule-operation-dialog]').open"), true);
  await b.evaluate('window.restoreOperationFetch()');
  await b.click('[data-operation-review-refresh]');
  await b.waitFor("!document.querySelector('[data-schedule-operation-form] [type=submit]').disabled && document.querySelector('[data-schedule-operation-decision=skip]').dataset.confirmation.includes('replacement')");
  const rect = await b.evaluate<{ left: number; right: number }>("(() => { const r = document.querySelector('[data-schedule-operation-dialog]').getBoundingClientRect(); return { left: r.left, right: r.right }; })()");
  assert.ok(rect.left >= 0 && rect.right <= 390, JSON.stringify(rect));
  const directory = join(process.cwd(), '.impeccable/qa/review'); await mkdir(directory, { recursive: true });
  for (const theme of ['light', 'dark']) {
    await b.command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] }, b.sessionId);
    await b.waitFor(`document.documentElement.dataset.resolvedTheme === '${theme}'`);
    await b.evaluate('Promise.all(document.getAnimations().filter(animation => animation instanceof CSSTransition).map(animation => animation.finished.catch(() => {})))');
    const shot = await b.command<{ data: string }>('Page.captureScreenshot', { format: 'png' }, b.sessionId);
    await writeFile(join(directory, `schedule-operation-recovery-${theme}.png`), Buffer.from(shot.data, 'base64'));
  }
  await b.click('[data-schedule-operation-form] [type=submit]');
  await b.waitFor("!document.querySelector('[data-schedule-operation-dialog]').open && !document.querySelector('[data-schedule-operation-decision]')");
  assert.equal(getScheduledOperation(b.store.db, projectId, id)?.state, 'completed');
  assert.equal(listScheduledOperationOccurrences(b.store.db, projectId, id)[0]?.state, 'skipped');
});

import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { SchedulePluginRouteTable } from "./schedule-direct-actions.js";
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ActionError, bindActionClient, type BoundActionClient } from '@molis-ai/molis-work-contracts/platform/actions';
import { SqlitePluginRuntimeRepository } from '@molis-ai/molis-work-plugin-runtime';
import { getScheduledOperation, listScheduledOperationOccurrences, scheduledOperationActions,
  scheduleActions, SCHEDULE_ACTION_PERMISSIONS, createScheduleRouteHandlers, type ScheduledOperationView } from '@molis-ai/molis-work-plugin-schedule';
import { molisWorkHostProjectReference } from '@molis-ai/molis-work-app-local-host';
import { seedDemoBoard } from '@molis-ai/molis-work-app-local-host';
import { scheduleServiceFor } from '@molis-ai/molis-work-app-local-host';
import { scheduledOwnerPlugin, scheduleRuntimeFixture } from './fixtures/schedule-runtime.js';
import { openGoalBrowser } from './fixtures/goal-browser.js';

const inputFor = (view: ScheduledOperationView) => ({ operation_id: view.id, decision: 'skip' as const, expected_revision: view.revision,
  expected_installation_id: view.installation!.installationId, expected_generation: view.installation!.generation, expected_version: view.installation!.version });

async function makeUnknown(sdk: BoundActionClient,
  tick: (at: string) => Promise<unknown>) {
  const at = new Date(Date.now() + 1000).toISOString();
  const created = await sdk.invoke(scheduledOperationActions.add, { at, operation: "summarize", input: { text: "<本周> 笔记" } });
  await tick(at); return created.scheduleId;
}

test('operation recovery is a public authorized Host/HTTP action; plugin callers, stale snapshots and other projects are refused', async t => {
  const f = await scheduleRuntimeFixture(t);
  f.execute(async () => { throw new ActionError("actions.outcome_unknown", "调用中断"); });
  const id = await makeUnknown(f.sdk, f.tick);
  const caller = { actor_id: 'owner', project_id: f.project.project_id, audience: 'user' as const, permissions: SCHEDULE_ACTION_PERMISSIONS };
  const bound = bindActionClient(f.client, () => caller);
  const view = (await bound.invoke(scheduleActions.list, {})).operations.find(item => item.id === id)!;
  assert.deepEqual(view.input, { text: '<本周> 笔记' }); assert.equal(view.installation?.publisher, 'example');
  const input = inputFor(view);
  await assert.rejects(f.sdk.invoke(scheduleActions.recoverOperation, input), { code: 'actions.forbidden' });
  await assert.rejects(f.client.invoke({ ...caller, project_id: 'elsewhere' }, scheduleActions.recoverOperation, input), { code: 'actions.scope_mismatch' });
  await assert.rejects(f.client.invoke({ ...caller, permissions: ['schedule:read'] }, scheduleActions.recoverOperation, input), { code: 'actions.forbidden' });
  await assert.rejects(f.client.invoke({ ...caller, validate_authority() { throw new Error('revoked'); } }, scheduleActions.recoverOperation, input), /revoked/);
  let changes = 0;
  const routes = new SchedulePluginRouteTable(createScheduleRouteHandlers({ actions: bound, changed() { changes++; } }));
  const response = await routes.handle({ method: 'POST', pathname: `/api/plugins/io.molis.work.schedule/operations/${id}/recover`, query: new URLSearchParams(), body: input });
  assert.equal(response?.status, 200); assert.equal(changes, 1);
  assert.equal((response?.body as { operation: ScheduledOperationView }).operation.state, 'completed');
  await assert.rejects(bound.invoke(scheduleActions.recoverOperation, input), /已变更/);
  assert.equal(f.calls(), 1, 'confirmation never dispatches again');
});

test('narrow Schedule UI reviews unknown outcomes, cancels safely and rejects a stale installation before an explicit skip', { timeout: 60_000 }, async t => {
  const owner = scheduledOwnerPlugin(); owner.execute(async () => { throw new ActionError("actions.outcome_unknown", "调用中断"); });
  const b = await openGoalBrowser(t, true, seedDemoBoard, null, undefined, undefined, {}, { project: [owner.definition] }); if (!b) return;
  const child = await pluginFrameBrowser(t, b, "schedule");
  const projectId = b.projectId!;
  const ref = molisWorkHostProjectReference({ databasePath: b.databasePath, projectId });
  const store = await b.localHost!.withProject(ref, runtime => runtime.store);
  await b.localHost!.inspectActions({ actor_id: "web-user", project_id: projectId, audience: "user", permissions: [] }, ref);
  const original = new SqlitePluginRuntimeRepository(store.db).list().find(row => row.plugin_id === owner.id)!;
  const id = await makeUnknown(owner.actions(projectId), at => scheduleServiceFor(store.db).tick(new Date(Date.parse(at) + 1000)));
  await b.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, b.sessionId);
  await b.navigate(() => b.command('Page.navigate', { url: `${b.origin}/projects/${projectId}/` }, b.sessionId));
  await b.click('[data-plugin-strip] [data-plugin-id=schedule]');
  await b.surfaceReady('schedule');
  await child.click(`[data-schedule-row][data-schedule-job-id="operation:${id}"]`);
  assert.match(await child.evaluate<string>("document.querySelector('[data-schedule-detail]:not([hidden])').textContent"), /结果待核对/);
  await child.click('[data-schedule-operation-decision=retry]');
  assert.match(await child.evaluate<string>("document.querySelector('[data-operation-review-warning]').textContent"), /可能重复/);
  await child.click('[data-schedule-operation-form] footer [data-schedule-operation-close]');
  assert.equal(getScheduledOperation(b.store.db, projectId, id)?.state, 'needs_review');
  await child.click('[data-schedule-operation-decision=skip]');
  new SqlitePluginRuntimeRepository(store.db).save({ ...original, installation_generation: 'replacement' });
  await child.click('[data-schedule-operation-form] [type=submit]');
  await child.waitFor("document.querySelector('[data-operation-review-error]').textContent.includes('安装或版本已变更')");
  assert.equal(getScheduledOperation(b.store.db, projectId, id)?.state, 'needs_review');
  await b.evaluate(`{ const original = window.fetch; window.restoreOperationFetch = () => window.fetch = original;
    window.fetch = (url, options) => new URL(url, location.href).pathname === location.pathname ? Promise.resolve(new Response('unavailable', { status: 503 })) : original(url, options); }`);
  await child.click('[data-operation-review-refresh]');
  await child.waitFor("document.querySelector('[data-operation-review-error]').textContent.includes('无法更新')");
  assert.equal(await child.evaluate("document.querySelector('[data-schedule-operation-dialog]').open"), true);
  await b.evaluate('window.restoreOperationFetch()');
  await child.click('[data-operation-review-refresh]');
  await child.waitFor("!document.querySelector('[data-schedule-operation-form] [type=submit]').disabled && document.querySelector('[data-schedule-operation-decision=skip]').dataset.confirmation.includes('replacement')");
  const rect = await child.evaluate<{ left: number; right: number }>("(() => { const r = document.querySelector('[data-schedule-operation-dialog]').getBoundingClientRect(); return { left: r.left, right: r.right }; })()");
  assert.ok(rect.left >= 0 && rect.right <= 390, JSON.stringify(rect));
  const directory = join(process.cwd(), '.impeccable/qa/review'); await mkdir(directory, { recursive: true });
  for (const theme of ['light', 'dark']) {
    await b.command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] }, b.sessionId);
    await child.waitFor(`document.documentElement.dataset.resolvedTheme === '${theme}'`);
    await child.evaluate('Promise.all(document.getAnimations().filter(animation => animation instanceof CSSTransition).map(animation => animation.finished.catch(() => {})))');
    const shot = await b.command<{ data: string }>('Page.captureScreenshot', { format: 'png' }, b.sessionId);
    await writeFile(join(directory, `schedule-operation-recovery-${theme}.png`), Buffer.from(shot.data, 'base64'));
  }
  await child.click('[data-schedule-operation-form] [type=submit]');
  await child.waitFor("!document.querySelector('[data-schedule-operation-dialog]').open && !document.querySelector('[data-schedule-operation-decision]')");
  assert.equal(getScheduledOperation(b.store.db, projectId, id)?.state, 'completed');
  assert.equal(listScheduledOperationOccurrences(b.store.db, projectId, id)[0]?.state, 'skipped');
});

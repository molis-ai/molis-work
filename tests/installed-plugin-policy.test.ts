import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ActionDefinition, ActionExecutionContext, ActionExecutionPolicy } from '@molis-ai/molis-work-contracts/platform/actions';
import type { SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { ArtifactsModule, ProcessItemsModule } from '@molis-ai/molis-work-module-artifacts';
import { SqlitePluginPrivateStorage } from '@molis-ai/molis-work-plugin-runtime';
import { UiHost } from '@molis-ai/molis-work-ui-host';
import { LocalProjectDatabase } from '@molis-ai/molis-work-app-local-host';
import { createPluginPlatform } from '@molis-ai/molis-work-app-local-host';
import { sandboxedPluginDefinition } from '../apps/local-host/dist/installed-plugin-sandbox-definition.js';
import { generatedPluginManifest } from '../apps/local-host/dist/plugin-builder/studio-preview.js';
import { capabilityCatalog, catalogCapabilities } from '../apps/local-host/dist/installed-plugin-catalog.js';
import { exposedActionId, exposeInstalledPlugin } from '../apps/local-host/dist/installed-plugin-exposed-actions.js';

// Exercise the actual exposed action with its installed identity; raw HTTP control is deliberately refused.
const mac = { skip: process.platform !== 'darwin', timeout: 15_000 };
async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'installed-policy-')), store = new LocalProjectDatabase(join(directory, 'project.db'));
  const service = new ActionService(), actions = { registry: service, client: service, project_id: 'p' };
  const storage = new SqlitePluginPrivateStorage(store.db);
  const platform = createPluginPlatform({ project_id: 'p', actor_id: 'owner', db: store.db, actions, ui: new UiHost(), home: null,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }), processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }), privateStorageFor: (context, manifest) => storage.forPlugin(context, manifest),
    deleteInstallationData: id => storage.deleteInstallationData(id) });
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), finished = Promise.withResolvers<void>();
  let waiting = false, calls = 0, effects = 0, dispose = () => {};
  const register = (policy: ActionExecutionPolicy, options: { provider?: string; version?: number; effect?: 'read' | 'write'; available?: boolean } = {}) => {
    dispose();
    const definition: ActionDefinition = { capability_id: 'fixture.lookup', version: options.version ?? 1, operation: options.effect === 'write' ? 'command' : 'query',
      action: { title: 'Lookup', description: 'Policy fixture', kind: options.effect === 'write' ? 'operation' : 'query', effect: options.effect ?? 'read',
        scope: 'project', audiences: ['plugin'], permissions: [], subject_kinds: [], execution: policy, input_schema: { type: 'string' }, output_schema: { type: 'string' } } };
    dispose = service.registerProvider({ provider: { provider_id: options.provider ?? 'fixture', title: 'Fixture', kind: 'system', project_id: 'p' }, definitions: [definition],
      availability: () => options.available === false ? { available: false, code: 'actions.plugin_disabled', reason: 'disabled' } : { available: true },
      handlers: [{ ...definition, async handle(context, input) {
        calls++;
        try { if (waiting) { entered.resolve(); await release.promise; } await context.beforeEffect(); effects++; return input; }
        finally { finished.resolve(); }
      } }] });
  };
  register({ timeout_ms: 1000, cost: 'none' });
  const effectsDeclaration = { capabilities: ['fixture.lookup'], storage: ['read', 'write'] as Array<'read' | 'write'> };
  const operation = (id: string, kind: 'query' | 'command', effects: typeof effectsDeclaration | { capabilities: string[] } | { storage: Array<'read'> }) => ({
    id, kind, effects, input: { type: 'string' as const }, output: { type: 'string' as const }, errors: [], examples: [{ input: 'x', output: 'x' }] });
  const contract: SandboxPluginContract = { version: 1, pluginId: 'io.molis.work.test.policy', revision: 'one', entities: [], pages: [], acceptance: [], operations: [
    operation('run', 'command', effectsDeclaration), operation('read', 'query', { capabilities: ['fixture.lookup'] }), operation('local', 'query', { storage: ['read'] }),
  ] };
  const bundlePath = join(directory, 'plugin.mjs');
  await writeFile(bundlePath, `export const operations={run:async(input,sdk)=>{const value=await sdk.capability.call('fixture.lookup',input);await sdk.storage.set('last',value);return input==='invalid'?{unexpected:true}:value},read:async(input,sdk)=>sdk.capability.call('fixture.lookup',input),local:async(_,sdk)=>(await sdk.storage.get('last'))??'empty'};`);
  const releaseFixture = { buildId: 'policy-fixture', pluginId: contract.pluginId, version: 1, bundlePath, design: { title: 'Policy', contract, parts: [], acceptance: [] }, nodes: [] } as never;
  const catalog = () => capabilityCatalog(actions, 'owner');
  const definition = sandboxedPluginDefinition(releaseFixture, effectsDeclaration, generatedPluginManifest(releaseFixture), { capabilities: catalog,
    capability: catalogCapabilities({ actions, catalog, live: () => true, declaration: () => ({ manifest: definition.manifest }), granted: () => effectsDeclaration.capabilities }) });
  t.after(async () => { release.resolve(); dispose(); for (const record of platform.runtime.list()) await platform.runtime.stop(record.install_id); store.close(); await rm(directory, { recursive: true, force: true }); });
  // Its operations call a platform capability, so the installation holds that switch (BL-701).
  const report = await platform.start([{ definition, grants: ['storage:private', 'capabilities:call'] }]); assert.ok(report.running.includes(contract.pluginId), JSON.stringify(report));
  const call = async (operation: string, input: string, execution: ActionExecutionContext) => (await platform.router().dispatch({ method: 'POST', pathname: '/api/plugins/' + contract.pluginId + '/call', actor_id: 'owner',
    execution, body: { operation, input } }))!;
  const installed = platform.runtime.list().find(item => item.plugin_id === contract.pluginId)!;
  const unexpose = exposeInstalledPlugin(actions, releaseFixture, (_, operation, input, context) => call(operation, input as string, context),
    undefined, { install_id: installed.install_id, installation_generation: installed.installation_generation });
  t.after(unexpose.dispose);
  const invoke = (operation: string, input = 'value') => service.invoke({ actor_id: 'owner', project_id: 'p', audience: 'user', permissions: [] },
    { capability_id: exposedActionId(releaseFixture, operation), version: 1, provider_id: 'plugin:' + contract.pluginId }, input);
  return { register, invoke, service, entered, release, finished, wait: () => { waiting = true; }, counts: () => ({ calls, effects }) };
}

test('a running installation rejects newly metered, write-only and disabled query dependencies without dispatch', mac, async t => {
  const f = await fixture(t);
  assert.equal(await f.invoke('read'), 'value'); assert.deepEqual(f.counts(), { calls: 1, effects: 1 });
  f.register({ timeout_ms: 2000, cost: 'metered' }, { version: 2 });
  await assert.rejects(f.invoke('read'), /查询不能自动/);
  assert.deepEqual(f.counts(), { calls: 1, effects: 1 });
  assert.equal(await f.invoke('run', 'explicit'), 'explicit');
  f.register({ timeout_ms: 2000, cost: 'none' }, { version: 3, effect: 'write' });
  await assert.rejects(f.invoke('read'), /查询不能/); assert.deepEqual(f.counts(), { calls: 2, effects: 2 });
  f.register({ timeout_ms: 2000, cost: 'none' }, { version: 4, available: false });
  await assert.rejects(f.invoke('run'), /不可用|未安装|停用|disabled/); assert.deepEqual(f.counts(), { calls: 2, effects: 2 });
  assert.equal(await f.invoke('local'), 'explicit', 'an unrelated local read remains usable');
});

test('new calls recompute slow lanes after installation; a long dependency never blocks unrelated local reads', mac, async t => {
  const f = await fixture(t);
  f.register({ timeout_ms: 75_000, cost: 'none' }, { version: 2 }); f.wait();
  const pending = f.invoke('run', 'slow'); await f.entered.promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const local = await Promise.race([f.invoke('local'), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('local read queued behind the slow dependency')), 2000); })]);
    assert.equal(local, 'empty');
  } finally { clearTimeout(timer); f.release.resolve(); }
  assert.equal(await pending, 'slow'); assert.equal(await f.invoke('local'), 'slow');
});

for (const change of ['version', 'provider', 'timeout', 'cost', 'disabled', 'registration'] as const) test(`an in-flight ${change} change rejects late effects and result with unknown outcome; a new call recovers`, mac, async t => {
  const f = await fixture(t); f.wait();
  const pending = assert.rejects(f.invoke('run', 'late'), { code: 'actions.outcome_unknown' }); await f.entered.promise;
  f.register({ timeout_ms: change === 'timeout' ? 2000 : 1000, cost: change === 'cost' ? 'metered' : 'none' },
    { version: change === 'version' ? 2 : 1, provider: change === 'provider' ? 'replacement' : 'fixture', available: change !== 'disabled' });
  f.release.resolve();
  await pending;
  assert.deepEqual(f.counts(), { calls: 1, effects: 0 }); assert.equal(await f.invoke('local'), 'empty');
  if (change === 'disabled') f.register({ timeout_ms: 1000, cost: 'none' });
  assert.equal(await f.invoke('run', 'fresh'), 'fresh'); assert.deepEqual(f.counts(), { calls: 2, effects: 1 });
  assert.equal(await f.invoke('local'), 'fresh');
});

test('an unrelated provider registration leaves the running dependency binding valid', mac, async t => {
  const f = await fixture(t); f.wait();
  const pending = f.invoke('run', 'kept'); await f.entered.promise;
  const dispose = f.service.registerProvider({ provider: { provider_id: 'other', title: 'Other', kind: 'system', project_id: 'p' }, definitions: [], handlers: [] });
  t.after(dispose); f.release.resolve();
  assert.equal(await pending, 'kept'); assert.deepEqual(f.counts(), { calls: 1, effects: 1 });
  assert.equal(await f.invoke('local'), 'kept');
});

test('nested capability timeout stays unknown through the public generated Action and rejects all late writes', mac, async t => {
  const f = await fixture(t); f.register({ timeout_ms: 120, cost: 'metered' }); f.wait();
  const pending = assert.rejects(f.invoke('run', 'late'), { code: 'actions.outcome_unknown' });
  await f.entered.promise; await pending;
  assert.equal(await f.invoke('local'), 'empty');
  f.release.resolve(); await f.finished.promise;
  assert.deepEqual(f.counts(), { calls: 1, effects: 0 });
  assert.equal(await f.invoke('run', 'fresh'), 'fresh');
  assert.equal(await f.invoke('local'), 'fresh');
  assert.deepEqual(f.counts(), { calls: 2, effects: 1 });
});

test('invalid output after a real commit stays unknown, retires the dead process and never replays its effects', mac, async t => {
  const f = await fixture(t);
  await assert.rejects(f.invoke('run', 'invalid'), { code: 'actions.outcome_unknown' });
  assert.equal(await f.invoke('local'), 'invalid', 'the original commit is preserved and not reported as rolled back');
  assert.deepEqual(f.counts(), { calls: 1, effects: 1 });
  assert.equal(await f.invoke('run', 'fresh'), 'fresh', 'a new explicit call starts a usable process');
  assert.deepEqual(f.counts(), { calls: 2, effects: 2 });
});

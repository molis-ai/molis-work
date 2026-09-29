import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentBuilderStore, type AgentRelease } from '@molis-ai/molis-work-plugin-builder';
import { ActionService } from '@molis-ai/molis-work-kernel';
import type { ActionDefinition, ActionExecutionPolicy } from '@molis-ai/molis-work-contracts/platform/actions';
import { PluginRuntime, SqlitePluginRuntimeRepository } from '@molis-ai/molis-work-plugin-runtime';
import type { SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { LocalProjectDatabase } from '../apps/local-host/src/project-database.js';
import { seedDemoBoard, DEMO_BOARD_ID } from '../apps/local-host/src/demo-seed.js';
import { MolisWorkLocalHost, molisWorkHostProjectReference } from '../apps/local-host/src/project-host.js';
import { ensureInstalledPlugins, releaseInstalledPlugins } from '../apps/local-host/src/installed-plugin-host.js';
import { sandboxedPluginDefinition } from '../apps/local-host/src/plugin-builder/installed.js';
import { exposedActionId } from '../apps/local-host/src/plugin-builder/exposed-actions.js';
import { studioStorage } from '../apps/local-host/src/plugin-builder/storage.js';
import { buildManifest } from '../apps/local-host/src/plugin-builder/build-project.js';
import { scheduleServiceFor } from '../apps/local-host/src/schedule-runtime.js';
import { agentDefinitionsFor } from '../apps/local-host/src/agent-definitions/agent-definitions.js';
import { builtinRegistrations } from '../apps/local-host/src/agent-definitions/builtin-registrations.js';

const mac = { skip: process.platform !== 'darwin', timeout: 30_000 };
const caller = { actor_id: 'owner', audience: 'user' as const, permissions: [], project_id: 'project' };

async function publishedFixture(home: string, name: string, lookup = false) {
  const databasePath = join(home, name + '.sqlite'); seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath), storage = studioStorage(store.db, DEMO_BOARD_ID), builder = new AgentBuilderStore(storage);
  const draft = builder.create('An unfinished draft must not resume when an installed plugin runs');
  const waiting = builder.update(draft.id, draft.revision, value => { value.active = { token: 'interrupted-draft', stage: 'design' }; value.phase = 'designing'; });
  const buildId = randomUUID(), pluginId = 'io.molis.work.generated.' + buildId;
  const contract: SandboxPluginContract = { version: 1, pluginId, revision: 'one', entities: [], pages: [], acceptance: [], operations: [
    { id: 'save', kind: 'command', input: { type: 'object', additionalProperties: false, required: ['value'], properties: { value: { type: 'string' } } }, output: { type: 'string' }, effects: { storage: ['write'] }, errors: [], examples: [{ input: { value: 'value' }, output: 'value' }] },
    { id: 'read', kind: 'query', input: { type: 'null' }, output: { type: 'string' }, effects: { storage: ['read'] }, errors: [], examples: [{ input: null, output: 'empty' }] },
    { id: 'schedule', kind: 'command', input: { type: 'string' }, output: { type: 'string' }, effects: { capabilities: ['schedules.add'] }, errors: [], examples: [{ input: '2026-09-28T01:00:00Z', output: 'id' }] },
  ] };
  if (lookup) contract.operations.push({ id: 'lookup', kind: 'command', input: { type: 'null' }, output: { type: 'string' },
    effects: { capabilities: ['fixture.lookup'], storage: ['write'] }, errors: [], examples: [{ input: null, output: 'looked up' }] });
  const bundlePath = join(home, name + '.mjs');
  await writeFile(bundlePath, `export const operations={save:async(input,sdk)=>{await sdk.storage.set('value',input.value);return input.value},read:async(_,sdk)=>await sdk.storage.get('value')??'empty',schedule:async(at,sdk)=>(await sdk.capability.call('schedules.add',{operation:'save',at,input:{value:'scheduled'},inbox:false})).scheduleId${lookup ? ",lookup:async(_,sdk)=>{const value=await sdk.capability.call('fixture.lookup',null);await sdk.storage.set('value',value);return value}" : ''}};`);
  const release: AgentRelease = { buildId, pluginId, version: 1, directory: home, bundlePath, packagePath: home,
    prompts: [{ id: 'summary', title: 'Summary', purpose: 'Summarize notes', body: 'Shipped instruction' }],
    design: { id: 'one', catalog: 'actions/1', title: 'Installed fixture', description: 'Fixture', rationale: 'Fixture', journey: [], contract, parts: [], acceptance: [] },
    nodes: [], manifest: buildManifest(contract), permissions: { storage: ['read', 'write'], capabilities: ['schedules.add', ...(lookup ? ['fixture.lookup'] : [])] }, publishedAt: new Date().toISOString() };
  builder.release(release); storage.set('plugin-builder:agent-studio:approved:' + pluginId, JSON.stringify(release.permissions));
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(store.db));
  const { install } = runtime.install({ definition: sandboxedPluginDefinition(release, release.permissions, []), deployment: 'local', grants: ['storage:private'] });
  store.close();
  return { databasePath, release, install, draft: waiting, ref: molisWorkHostProjectReference({ databasePath, projectId: 'project', boardId: DEMO_BOARD_ID }) };
}

test('Host discovery and invocation refresh generated cost without rewriting installed identity or running its capabilities', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-public-policy-')), fixture = await publishedFixture(home, 'project', true);
  const host = new MolisWorkLocalHost({ homeDirectory: home }), client = host.actionClient(fixture.ref);
  let dispose = () => {}, calls = 0;
  const register = (cost: ActionExecutionPolicy['cost'], version = 1) => {
    dispose();
    const definition: ActionDefinition = { capability_id: 'fixture.lookup', version, operation: 'query', action: { title: 'Lookup', description: 'Fixture', kind: 'query', scope: 'project',
      audiences: ['plugin'], permissions: [], subject_kinds: [], execution: { cost }, input_schema: { type: 'null' }, output_schema: { type: 'string' } } };
    dispose = host.actionRegistry(fixture.ref).registerProvider({ provider: { provider_id: 'fixture', title: 'Fixture', kind: 'system', project_id: 'project' }, definitions: [definition],
      handlers: [{ ...definition, handle: () => { calls++; return 'looked up'; } }] });
  };
  const action = (id: string, version = 1) => ({ capability_id: exposedActionId(fixture.release, id), version, provider_id: 'plugin:' + fixture.release.pluginId });
  try {
    register('none');
    assert.equal((await client.discover(caller)).find(view => view.capability_id === action('lookup').capability_id)!.action.execution?.cost, 'none');
    register('metered', 2);
    for (const audience of ['user', 'agent', 'mcp', 'workflow', 'plugin'] as const) {
      const views = await client.discover({ ...caller, audience });
      assert.equal(views.find(view => view.capability_id === action('lookup').capability_id)!.action.execution?.cost, 'metered');
      assert.equal(views.find(view => view.capability_id === action('read').capability_id)!.action.execution?.cost, 'none');
    }
    assert.equal(calls, 0, 'discovery never calls the dependency');
    assert.equal(await client.invoke(caller, action('lookup'), null), 'looked up');
    assert.equal(await client.invoke(caller, action('read'), null), 'looked up');
    assert.equal(calls, 1);
    register('none', 3);
    // Invoke without a preceding discovery also refreshes the public declaration.
    assert.equal(await client.invoke(caller, action('lookup'), null), 'looked up');
    const installed = await host.withProject(fixture.ref, runtime => ensureInstalledPlugins({ store: runtime.store, boardId: DEMO_BOARD_ID, homeDirectory: home,
      actions: { registry: host.actionRegistry(fixture.ref), client, project_id: 'project' } }));
    assert.equal((await installed.catalog()).find(entry => entry.id === action('lookup').capability_id)!.execution.cost, 'none');
    assert.equal(installed.records()[0]!.manifest_digest, fixture.install.manifest_digest);
    assert.equal(installed.records()[0]!.install_id, fixture.install.install_id);
    const next = { ...fixture.release, version: 2 }; installed.releases.release(next);
    await installed.lifecycle('upgrade', next);
    await assert.rejects(client.invoke(caller, action('lookup'), null), 'the old version is withdrawn');
    assert.equal(await client.invoke(caller, action('lookup', 2), null), 'looked up');
    await installed.lifecycle('rollback', fixture.release);
    assert.equal(await client.invoke(caller, action('lookup'), null), 'looked up');
    assert.equal(installed.records()[0]!.manifest_digest, fixture.install.manifest_digest);
    await installed.lifecycle('disable', fixture.release);
    assert.equal((await installed.catalog()).some(entry => entry.id.startsWith('generated.')), false);
    await installed.lifecycle('enable', fixture.release);
    dispose();
    assert.equal((await client.discover(caller)).find(view => view.capability_id === action('lookup').capability_id)!.action.execution?.cost, 'unknown');
    await assert.rejects(client.invoke(caller, action('lookup'), null));
    assert.equal(await client.invoke(caller, action('read'), null), 'looked up', 'missing dependency cannot change committed local data');
  } finally { dispose(); await host.close(); await rm(home, { recursive: true, force: true }); }
});

test('an in-flight catalog inspection cannot restore generated registrations after the installation owner closes', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-catalog-close-')), fixture = await publishedFixture(home, 'project');
  const store = new LocalProjectDatabase(fixture.databasePath), service = new ActionService();
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); let hold = false;
  try {
    const installed = await ensureInstalledPlugins({ store, boardId: DEMO_BOARD_ID, homeDirectory: home, actions: { registry: service, client: service, project_id: 'project',
      inspect: async caller => { const snapshot = service.inspect(caller); if (hold) { entered.resolve(); await release.promise; } return snapshot; } } });
    hold = true;
    const pending = installed.catalog(); await entered.promise;
    await installed.close(); release.resolve();
    assert.deepEqual(await pending, []);
    assert.deepEqual(service.discover(caller), []);
  } finally { release.resolve(); await releaseInstalledPlugins(store, DEMO_BOARD_ID); store.close(); await rm(home, { recursive: true, force: true }); }
});

test('Host alone restores installed actions and scheduled operations, retains data across restart and leaves authoring untouched', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-headless-'));
  const fixture = await publishedFixture(home, 'project'), { release, ref } = fixture;
  let host = new MolisWorkLocalHost({ homeDirectory: home });
  const action = (operation: string) => ({ capability_id: exposedActionId(release, operation), version: 1, provider_id: 'plugin:' + release.pluginId });
  try {
    await host.restoreExistingProject(ref);
    const client = host.actionClient(ref), discovered = await client.discover(caller);
    assert.equal(discovered.filter(view => view.capability_id.startsWith('generated.')).length, 3);
    assert.equal(await client.invoke(caller, action('read'), null), 'empty', 'null reaches the declared contract unchanged');
    assert.equal(await client.invoke(caller, action('save'), { value: 'original data' }), 'original data');
    const at = Date.now() + 1500;
    await client.invoke(caller, action('schedule'), new Date(at).toISOString());
    await host.close();
    const closed = new LocalProjectDatabase(fixture.databasePath);
    try { assert.equal(new SqlitePluginRuntimeRepository(closed.db).get(fixture.install.install_id)?.state, 'installed', 'normal Host close preserves enabled intent'); }
    finally { closed.close(); }
    host = new MolisWorkLocalHost({ homeDirectory: home });
    await host.restoreExistingProject(ref);
    assert.equal(await host.actionClient(ref).invoke(caller, action('read'), null), 'original data');
    await host.withProject(ref, async runtime => {
      await scheduleServiceFor(runtime.store.db).tick(new Date(at + 1000));
      const builder = new AgentBuilderStore(studioStorage(runtime.store.db, DEMO_BOARD_ID));
      assert.deepEqual(builder.get(fixture.draft.id), fixture.draft, 'restoring or executing an install does not resume the authoring Workflow');
      assert.equal(new SqlitePluginRuntimeRepository(runtime.store.db).get(fixture.install.install_id)?.manifest_digest, fixture.install.manifest_digest, 'no same-version manifest rewrite');
    });
    assert.equal(await host.actionClient(ref).invoke(caller, action('read'), null), 'scheduled');
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test('explicitly disabled installations stay disabled after Host restart and only an explicit enable restores discovery', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-disabled-')), fixture = await publishedFixture(home, 'project');
  let host = new MolisWorkLocalHost({ homeDirectory: home });
  const control = () => host.withProject(fixture.ref, runtime => ensureInstalledPlugins({ store: runtime.store, boardId: DEMO_BOARD_ID, homeDirectory: home,
    actions: { registry: host.actionRegistry(fixture.ref), client: { ...host.actionClient(fixture.ref), ...host.syncActionClient(fixture.ref) }, project_id: 'project' } }));
  try {
    const installed = await control();
    const registry = agentDefinitionsFor(home, builtinRegistrations), key = fixture.release.pluginId + '/summary';
    const promptState = () => { const source = registry.prompt(key).source; return source.kind === 'plugin' ? source.state : undefined; };
    assert.equal(promptState(), 'enabled');
    registry.save(key, 'Edited instruction', null, 'person');
    await installed.lifecycle('disable', fixture.release);
    assert.equal(promptState(), 'disabled');
    await host.close(); host = new MolisWorkLocalHost({ homeDirectory: home });
    assert.equal((await host.actionClient(fixture.ref).discover(caller)).some(view => view.capability_id.startsWith('generated.')), false);
    const restored = await control(); assert.equal(restored.installations()[0]?.state, 'disabled');
    assert.equal(registry.prompt(key).effective, 'user');
    assert.equal(promptState(), 'disabled');
    await restored.lifecycle('enable', fixture.release);
    assert.equal(promptState(), 'enabled');
    assert.equal((await host.actionClient(fixture.ref).discover(caller)).filter(view => view.capability_id.startsWith('generated.')).length, 3);
    const action = (operation: string) => ({ capability_id: exposedActionId(fixture.release, operation), version: 1, provider_id: 'plugin:' + fixture.release.pluginId });
    await host.actionClient(fixture.ref).invoke(caller, action('save'), { value: 'kept across reinstall' });
    await restored.lifecycle('uninstall', fixture.release, { keepData: true });
    assert.equal(registry.hasPrompt(fixture.release.pluginId, 'summary'), false);
    assert.equal((await host.actionClient(fixture.ref).discover(caller)).some(view => view.capability_id.startsWith('generated.')), false);
    await restored.lifecycle('install', fixture.release, { consent: true });
    assert.equal(registry.prompt(key).effective, 'user');
    assert.equal(await host.actionClient(fixture.ref).invoke(caller, action('read'), null), 'kept across reinstall');
    await restored.lifecycle('uninstall', fixture.release, { keepData: false });
    await restored.lifecycle('install', fixture.release, { consent: true });
    assert.equal(await host.actionClient(fixture.ref).invoke(caller, action('read'), null), 'empty', 'deleting data removes the actual private values before reinstallation');
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test('missing publication or approval is reported without borrowing another Home or granting release permissions', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-recovery-'));
  const first = await publishedFixture(home, 'first'), second = await publishedFixture(home, 'second');
  const stores = [first, second].map(fixture => new LocalProjectDatabase(fixture.databasePath));
  try {
    const raw = studioStorage(stores[0]!.db, DEMO_BOARD_ID);
    raw.delete('plugin-builder:agent-studio:approved:' + first.release.pluginId);
    const [one, two] = await Promise.all(stores.map(store => ensureInstalledPlugins({ store, boardId: DEMO_BOARD_ID, homeDirectory: home })));
    assert.match(one.recoveryErrors.get(first.release.pluginId) ?? '', /批准记录/);
    assert.equal(one.installations()[0]?.state, 'failed');
    const context = { ...caller, project_id: DEMO_BOARD_ID };
    assert.equal((await one.actions.client.discover(context)).some(view => view.capability_id.startsWith('generated.')), false);
    assert.equal((await two.actions.client.discover(context)).filter(view => view.capability_id.startsWith('generated.')).length, 3);
    await assert.rejects(one.lifecycle('enable', first.release), /批准记录/);
    await one.lifecycle('uninstall', first.release, { keepData: true });
    assert.equal(one.records().length, 0, 'a cold installation with no approval can still be explicitly removed');
    await one.lifecycle('install', first.release, { consent: true });
    assert.equal((await one.actions.client.discover(context)).filter(view => view.capability_id.startsWith('generated.')).length, 3, 'new consent repairs a missing approval without borrowing another installation');
    await releaseInstalledPlugins(stores[1]!, DEMO_BOARD_ID);
    const secondStorage = studioStorage(stores[1]!.db, DEMO_BOARD_ID);
    secondStorage.set('plugin-builder:agent-built:v1', JSON.stringify({ builds: [], releases: [] }));
    const missing = await ensureInstalledPlugins({ store: stores[1]!, boardId: DEMO_BOARD_ID, homeDirectory: home });
    assert.match(missing.recoveryErrors.get(second.release.pluginId) ?? '', /发布记录/);
    assert.equal((await missing.actions.client.discover(context)).some(view => view.capability_id.startsWith('generated.')), false);
  } finally { for (const store of stores) { await releaseInstalledPlugins(store, DEMO_BOARD_ID); store.close(); } await rm(home, { recursive: true, force: true }); }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentBuilderStore, type AgentRelease } from '@molis-ai/molis-work-plugin-builder';
import { ActionService } from '@molis-ai/molis-work-kernel';
import type { ActionDefinition, ActionExecutionPolicy } from '@molis-ai/molis-work-contracts/platform/actions';
import { PluginRuntime, SqlitePluginPrivateStorage, SqlitePluginRuntimeRepository } from '@molis-ai/molis-work-plugin-runtime';
import type { SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { LocalProjectDatabase } from '../apps/local-host/src/project-database.js';
import { seedDemoBoard, DEMO_PROJECT_ID } from '../apps/local-host/src/demo-seed.js';
import { MolisWorkLocalHost, molisWorkHostProjectReference } from '../apps/local-host/src/project-host.js';
import { ensureInstalledPlugins, releaseInstalledPlugins } from '../apps/local-host/src/installed-plugin-host.js';
import { installedSignature, sandboxedPluginDefinition } from '../apps/local-host/src/plugin-builder/installed.js';
import { exposedActionId } from '../apps/local-host/src/plugin-builder/exposed-actions.js';
import { studioStorage } from '../apps/local-host/src/plugin-builder/storage.js';
import { buildManifest } from '../apps/local-host/src/plugin-builder/build-project.js';
import { scheduleServiceFor } from '../apps/local-host/src/schedule-runtime.js';
import { agentDefinitionsFor } from '../apps/local-host/src/agent-definitions/agent-definitions.js';
import { builtinRegistrations } from '../apps/local-host/src/agent-definitions/builtin-registrations.js';

const mac = { skip: process.platform !== 'darwin', timeout: 30_000 };
const caller = { actor_id: 'owner', audience: 'user' as const, permissions: [], project_id: DEMO_PROJECT_ID };

/** `neverInstalled`: the Runtime has no row for the plugin yet, as for a plugin that is published but has never been installed. */
async function publishedFixture(home: string, name: string, lookup = false, secretRefs: string[] = [], neverInstalled = false) {
  const databasePath = join(home, name + '.sqlite'); seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath), storage = studioStorage(store.db, DEMO_PROJECT_ID), builder = new AgentBuilderStore(storage);
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
    nodes: [], manifest: buildManifest(contract), permissions: { storage: ['read', 'write'], capabilities: ['schedules.add', ...(lookup ? ['fixture.lookup'] : [])],
      ...(secretRefs.length ? { networkDomains: ['api.example.test'], secretRefs } : {}) }, publishedAt: new Date().toISOString() };
  builder.release(release); storage.set('plugin-builder:agent-studio:approved:' + pluginId, JSON.stringify(release.permissions));
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(store.db));
  const { install } = runtime.install({ definition: sandboxedPluginDefinition(release, release.permissions, []), deployment: 'local', grants: ['storage:private'] });
  if (neverInstalled) store.db.prepare('DELETE FROM plugin_runtime_installs WHERE install_id = ?').run(install.install_id);
  store.close();
  return { databasePath, release, install, draft: waiting, ref: molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID }) };
}

test('Host discovery and invocation refresh generated cost without rewriting installed identity or running its capabilities', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-public-policy-')), fixture = await publishedFixture(home, 'project', true);
  const host = new MolisWorkLocalHost({ homeDirectory: home }), client = host.actionClient(fixture.ref);
  let dispose = () => {}, calls = 0;
  const register = (cost: ActionExecutionPolicy['cost'], version = 1) => {
    dispose();
    const definition: ActionDefinition = { capability_id: 'fixture.lookup', version, operation: 'query', action: { title: 'Lookup', description: 'Fixture', kind: 'query', scope: 'project',
      audiences: ['plugin'], permissions: [], subject_kinds: [], execution: { cost }, input_schema: { type: 'null' }, output_schema: { type: 'string' } } };
    dispose = host.actionRegistry(fixture.ref).registerProvider({ provider: { provider_id: 'fixture', title: 'Fixture', kind: 'system', project_id: DEMO_PROJECT_ID }, definitions: [definition],
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
    const installed = await host.withProject(fixture.ref, runtime => ensureInstalledPlugins({ store: runtime.store, projectId: DEMO_PROJECT_ID, homeDirectory: home,
      actions: { registry: host.actionRegistry(fixture.ref), client, project_id: DEMO_PROJECT_ID } }));
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
    const installed = await ensureInstalledPlugins({ store, projectId: DEMO_PROJECT_ID, homeDirectory: home, actions: { registry: service, client: service, project_id: DEMO_PROJECT_ID,
      inspect: async caller => { const snapshot = service.inspect(caller); if (hold) { entered.resolve(); await release.promise; } return snapshot; } } });
    hold = true;
    const pending = installed.catalog(); await entered.promise;
    await installed.close(); release.resolve();
    assert.deepEqual(await pending, []);
    assert.deepEqual(service.discover(caller), []);
  } finally { release.resolve(); await releaseInstalledPlugins(store, DEMO_PROJECT_ID); store.close(); await rm(home, { recursive: true, force: true }); }
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
      const builder = new AgentBuilderStore(studioStorage(runtime.store.db, DEMO_PROJECT_ID));
      assert.deepEqual(builder.get(fixture.draft.id), fixture.draft, 'restoring or executing an install does not resume the authoring Workflow');
      assert.equal(new SqlitePluginRuntimeRepository(runtime.store.db).get(fixture.install.install_id)?.manifest_digest, fixture.install.manifest_digest, 'no same-version manifest rewrite');
    });
    assert.equal(await host.actionClient(ref).invoke(caller, action('read'), null), 'scheduled');
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test('explicitly disabled installations stay disabled after Host restart and only an explicit enable restores discovery', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-disabled-')), fixture = await publishedFixture(home, 'project');
  let host = new MolisWorkLocalHost({ homeDirectory: home });
  const control = () => host.withProject(fixture.ref, runtime => ensureInstalledPlugins({ store: runtime.store, projectId: DEMO_PROJECT_ID, homeDirectory: home,
    actions: { registry: host.actionRegistry(fixture.ref), client: { ...host.actionClient(fixture.ref), ...host.syncActionClient(fixture.ref) }, project_id: DEMO_PROJECT_ID } }));
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
    const raw = studioStorage(stores[0]!.db, DEMO_PROJECT_ID);
    raw.delete('plugin-builder:agent-studio:approved:' + first.release.pluginId);
    const [one, two] = await Promise.all(stores.map(store => ensureInstalledPlugins({ store, projectId: DEMO_PROJECT_ID, homeDirectory: home })));
    assert.match(one.recoveryErrors.get(first.release.pluginId) ?? '', /批准记录/);
    assert.equal(one.installations()[0]?.state, 'failed');
    const context = { ...caller, project_id: DEMO_PROJECT_ID };
    assert.equal((await one.actions.client.discover(context)).some(view => view.capability_id.startsWith('generated.')), false);
    assert.equal((await two.actions.client.discover(context)).filter(view => view.capability_id.startsWith('generated.')).length, 3);
    await assert.rejects(one.lifecycle('enable', first.release), /批准记录/);
    await one.lifecycle('uninstall', first.release, { keepData: true });
    assert.equal(one.records().length, 0, 'a cold installation with no approval can still be explicitly removed');
    await one.lifecycle('install', first.release, { consent: true });
    assert.equal((await one.actions.client.discover(context)).filter(view => view.capability_id.startsWith('generated.')).length, 3, 'new consent repairs a missing approval without borrowing another installation');
    await releaseInstalledPlugins(stores[1]!, DEMO_PROJECT_ID);
    const secondStorage = studioStorage(stores[1]!.db, DEMO_PROJECT_ID);
    secondStorage.set('plugin-builder:agent-built:v1', JSON.stringify({ builds: [], releases: [] }));
    const missing = await ensureInstalledPlugins({ store: stores[1]!, projectId: DEMO_PROJECT_ID, homeDirectory: home });
    assert.match(missing.recoveryErrors.get(second.release.pluginId) ?? '', /发布记录/);
    assert.equal((await missing.actions.client.discover(context)).some(view => view.capability_id.startsWith('generated.')), false);
  } finally { for (const store of stores) { await releaseInstalledPlugins(store, DEMO_PROJECT_ID); store.close(); } await rm(home, { recursive: true, force: true }); }
});

async function hostWithProject(home: string, fixture: Awaited<ReturnType<typeof publishedFixture>>) {
  let host = new MolisWorkLocalHost({ homeDirectory: home });
  const control = () => host.withProject(fixture.ref, runtime => ensureInstalledPlugins({ store: runtime.store, projectId: DEMO_PROJECT_ID, homeDirectory: home,
    actions: { registry: host.actionRegistry(fixture.ref), client: { ...host.actionClient(fixture.ref), ...host.syncActionClient(fixture.ref) }, project_id: DEMO_PROJECT_ID } }));
  const generated = async () => (await host.actionClient(fixture.ref).discover(caller)).filter(view => view.capability_id.startsWith('generated.')).length;
  return { control, generated, get host() { return host; }, reopen() { host = new MolisWorkLocalHost({ homeDirectory: home }); return host; } };
}

test('a disabled installation switches versions and stays disabled, before and after a restart, and enable starts the version it is on', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-disabled-upgrade-')), fixture = await publishedFixture(home, 'project'), rig = await hostWithProject(home, fixture);
  const stateOnDisk = () => { const closed = new LocalProjectDatabase(fixture.databasePath); try { const record = new SqlitePluginRuntimeRepository(closed.db).get(fixture.install.install_id); return record && { state: record.state, version: record.version }; } finally { closed.close(); } };
  const rows = (installed: Awaited<ReturnType<typeof rig.control>>) => installed.installations().map(({ state, version }) => ({ state, version }));
  const action = (release: AgentRelease, operation: string) => ({ capability_id: exposedActionId(release, operation), version: release.version, provider_id: 'plugin:' + release.pluginId });
  try {
    const installed = await rig.control();
    await installed.lifecycle('disable', fixture.release);
    const v2 = { ...fixture.release, version: 2 }; installed.releases.release(v2);
    await installed.lifecycle('upgrade', v2);
    assert.deepEqual(rows(installed), [{ state: 'disabled', version: 2 }], 'the version moved and the plugin is still off');
    await installed.lifecycle('rollback', fixture.release);
    assert.deepEqual(rows(installed), [{ state: 'disabled', version: 1 }]);
    await installed.lifecycle('upgrade', v2);
    assert.equal(await rig.generated(), 0, 'nothing of it is offered while it is off');
    const router = await installed.platform.router().dispatch({ method: 'POST', pathname: '/api/plugins/' + fixture.release.pluginId + '/call', actor_id: 'owner', body: { operation: 'read', input: null } });
    assert.equal(router?.status, 404, 'and it runs nothing');
    await rig.host.close();
    assert.deepEqual(stateOnDisk(), { state: 'disabled', version: '2.0.0' }, 'the record on disk moved and is still off');

    rig.reopen();
    const restored = await rig.control();
    assert.deepEqual(rows(restored), [{ state: 'disabled', version: 2 }]);
    assert.equal(await rig.generated(), 0, 'a restart does not bring it back');
    const v3 = { ...fixture.release, version: 3 }; restored.releases.release(v3);
    await restored.lifecycle('upgrade', v3);
    assert.deepEqual(rows(restored), [{ state: 'disabled', version: 3 }], 'after a restart the Supervisor knows nothing of it, and the switch still works');
    await restored.lifecycle('rollback', v2);
    assert.deepEqual(rows(restored), [{ state: 'disabled', version: 2 }]);
    await restored.lifecycle('upgrade', v3);
    assert.equal(await rig.generated(), 0);
    await rig.host.close();
    assert.deepEqual(stateOnDisk(), { state: 'disabled', version: '3.0.0' });

    rig.reopen();
    const again = await rig.control();
    assert.deepEqual(rows(again), [{ state: 'disabled', version: 3 }]);
    await again.lifecycle('enable', fixture.release);
    assert.deepEqual(rows(again), [{ state: 'running', version: 3 }], 'enable starts the version the installation is on, whatever release the caller names');
    assert.equal(await rig.generated(), 3);
    assert.equal(await rig.host.actionClient(fixture.ref).invoke(caller, action(v3, 'read'), null), 'empty');
    await again.lifecycle('rollback', v2);
    assert.deepEqual(rows(again), [{ state: 'running', version: 2 }], 'an enabled installation switches as before');
  } finally { await rig.host.close(); await rm(home, { recursive: true, force: true }); }
});

test('a version of a disabled installation that needs more permission asks for them, and its approval moves with it', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-disabled-consent-')), fixture = await publishedFixture(home, 'project'), rig = await hostWithProject(home, fixture);
  try {
    const installed = await rig.control();
    await installed.lifecycle('disable', fixture.release);
    const wider = { ...fixture.release, version: 2, permissions: { ...fixture.release.permissions, networkDomains: ['api.example.test'] } }; installed.releases.release(wider);
    await assert.rejects(installed.lifecycle('upgrade', wider), /新的权限/);
    assert.deepEqual(installed.installations().map(({ state, version }) => ({ state, version })), [{ state: 'disabled', version: 1 }]);
    await installed.lifecycle('upgrade', wider, { consent: true });
    assert.deepEqual(installed.installations().map(({ state, version, effects }) => ({ state, version, domains: effects.networkDomains })), [{ state: 'disabled', version: 2, domains: ['api.example.test'] }]);
  } finally { await rig.host.close(); await rm(home, { recursive: true, force: true }); }
});

test('a quarantined installation is refused a version switch with a reason, before anything is asked of the Supervisor', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-quarantined-')), fixture = await publishedFixture(home, 'project');
  const database = new LocalProjectDatabase(fixture.databasePath);
  new SqlitePluginRuntimeRepository(database.db).save({ ...fixture.install, state: 'quarantined' }); database.close();
  const rig = await hostWithProject(home, fixture);
  try {
    const installed = await rig.control(), next = { ...fixture.release, version: 2 }; installed.releases.release(next);
    await assert.rejects(installed.lifecycle('upgrade', next), /隔离/);
    await assert.rejects(installed.lifecycle('rollback', fixture.release), /隔离/);
    assert.equal(installed.platform.supervisor.state(fixture.release.pluginId), null, 'no question about it was remembered');
    await installed.lifecycle('uninstall', fixture.release, { keepData: true });
    await installed.lifecycle('install', next, { consent: true });
    assert.deepEqual(installed.installations().map(({ state, version }) => ({ state, version })), [{ state: 'running', version: 2 }], 'uninstalling and installing again is the way out');
  } finally { await rig.host.close(); await rm(home, { recursive: true, force: true }); }
});

test('an install that cannot start leaves nothing behind: no secrets, no approval, no crashed record, and it can be tried again', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-failed-install-')), fixture = await publishedFixture(home, 'project', false, ['weather']), rig = await hostWithProject(home, fixture);
  const secret = { name: 'weather', header: 'X-Api-Key', value: 'k-123' }, approvalKey = 'plugin-builder:agent-studio:approved:' + fixture.release.pluginId;
  const working = await readFile(fixture.release.bundlePath, 'utf8');
  try {
    const installed = await rig.control(), pluginId = fixture.release.pluginId;
    await installed.lifecycle('uninstall', fixture.release, { keepData: false });
    await writeFile(fixture.release.bundlePath, "throw new Error('broken bundle');");
    await assert.rejects(installed.lifecycle('install', fixture.release, { consent: true, secrets: [secret] }), /安装没有完成/);
    assert.deepEqual(installed.secrets.list(pluginId), [], 'the secret from the consent dialog was not kept');
    assert.equal(await installed.secrets.resolve(pluginId, 'weather'), null);
    assert.equal(installed.storage.get(approvalKey), null, 'no approval for an installation that does not exist');
    assert.deepEqual(installed.records(), [], 'no crashed record blocks the next install');
    assert.equal(installed.platform.runtime.get(fixture.install.install_id).state, 'uninstalled');
    await assert.rejects(installed.lifecycle('enable', fixture.release), /还没有安装/);

    await assert.rejects(installed.lifecycle('install', fixture.release, { consent: true, secrets: [{ ...secret, name: 'other' }] }), /没有声明/);
    assert.deepEqual(installed.records(), [], 'a secret the release never named is refused before anything is installed');

    await writeFile(fixture.release.bundlePath, working);
    await installed.lifecycle('install', fixture.release, { consent: true, secrets: [secret] });
    assert.deepEqual(installed.installations().map(({ state, version }) => ({ state, version })), [{ state: 'running', version: 1 }]);
    assert.deepEqual(installed.secrets.list(pluginId), [{ name: 'weather', header: 'X-Api-Key' }], 'a finished install keeps what the person typed');
    assert.deepEqual(await installed.secrets.resolve(pluginId, 'weather'), { header: 'X-Api-Key', value: 'k-123' });
  } finally { await rig.host.close(); await rm(home, { recursive: true, force: true }); }
});

test('a reinstall that cannot read the data an uninstall kept is refused until the person agrees to drop it, and a failed one gives the data back', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-discard-kept-')), fixture = await publishedFixture(home, 'project'), rig = await hostWithProject(home, fixture);
  const action = (release: AgentRelease, operation: string) => ({ capability_id: exposedActionId(release, operation), version: release.version, provider_id: 'plugin:' + release.pluginId });
  const working = await readFile(fixture.release.bundlePath, 'utf8');
  const only = (installed: Awaited<ReturnType<typeof rig.control>>, release: AgentRelease) => installed.storage.set('plugin-builder:agent-built:v1', JSON.stringify({ builds: [], releases: [release] }));
  const kept = () => rig.host.withProject(fixture.ref, runtime => new SqlitePluginPrivateStorage(runtime.store.db).snapshotInstallationData(fixture.install.install_id).length);
  try {
    const installed = await rig.control(), client = rig.host.actionClient(fixture.ref);
    await client.invoke(caller, action(fixture.release, 'save'), { value: 'old data' });
    await installed.lifecycle('uninstall', fixture.release, { keepData: true });
    const v3 = { ...fixture.release, version: 3 }; only(installed, v3);   // the earlier releases are gone, so v3 does not say it reads their data
    assert.ok(await kept() > 0);
    await assert.rejects(installed.lifecycle('install', v3, { consent: true }), (error: { code?: string; message: string }) => error.code === 'plugin_kept_data_incompatible' && /放弃/.test(error.message));
    await assert.rejects(installed.lifecycle('install', v3, { consent: true, discardKeptData: false }), (error: { code?: string }) => error.code === 'plugin_kept_data_incompatible');
    assert.deepEqual(installed.records(), [], 'a refused install changes nothing');
    assert.ok(await kept() > 0, 'and the data is still there');

    await writeFile(fixture.release.bundlePath, "throw new Error('broken bundle');");
    await assert.rejects(installed.lifecycle('install', v3, { consent: true, discardKeptData: true }), /安装没有完成/);
    assert.deepEqual(installed.records(), []);
    assert.ok(await kept() > 0, 'an install that fails after the person agreed does not cost them the data');

    await writeFile(fixture.release.bundlePath, working);
    await installed.lifecycle('install', v3, { consent: true, discardKeptData: true });
    assert.deepEqual(installed.installations().map(({ state, version }) => ({ state, version })), [{ state: 'running', version: 3 }]);
    assert.equal(await client.invoke(caller, action(v3, 'read'), null), 'empty', 'the new version starts fresh');
  } finally { await rig.host.close(); await rm(home, { recursive: true, force: true }); }
});

test('an install that fails over kept data puts the uninstalled record back exactly as it was, so the next install is still asked', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-failed-over-kept-')), fixture = await publishedFixture(home, 'project'), rig = await hostWithProject(home, fixture);
  const action = (release: AgentRelease, operation: string) => ({ capability_id: exposedActionId(release, operation), version: release.version, provider_id: 'plugin:' + release.pluginId });
  const working = await readFile(fixture.release.bundlePath, 'utf8'), broken = "throw new Error('broken bundle');";
  const only = (installed: Awaited<ReturnType<typeof rig.control>>, ...releases: AgentRelease[]) => installed.storage.set('plugin-builder:agent-built:v1', JSON.stringify({ builds: [], releases }));
  const rows = () => rig.host.withProject(fixture.ref, runtime => new SqlitePluginPrivateStorage(runtime.store.db).snapshotInstallationData(fixture.install.install_id));
  const row = (installed: Awaited<ReturnType<typeof rig.control>>) => installed.platform.runtime.get(fixture.install.install_id);
  try {
    const installed = await rig.control(), client = rig.host.actionClient(fixture.ref);
    await client.invoke(caller, action(fixture.release, 'save'), { value: 'old data' });
    await installed.lifecycle('uninstall', fixture.release, { keepData: true });
    const before = row(installed), data = await rows();
    assert.ok(before.state === 'uninstalled' && before.retain_private_data && data.length > 0);

    // The person agreed to drop the old data and the install then failed: the record is the one the question was asked about.
    const v3 = { ...fixture.release, version: 3 }; only(installed, v3);
    await writeFile(fixture.release.bundlePath, broken);
    await assert.rejects(installed.lifecycle('install', v3, { consent: true, discardKeptData: true }), /安装没有完成/);
    assert.deepEqual(row(installed), before, 'same version, digest, installation generation and kept-data flag');
    assert.deepEqual(await rows(), data, 'and the same data');
    assert.deepEqual(installed.records(), []);
    await assert.rejects(installed.lifecycle('install', v3, { consent: true }), (error: { code?: string }) => error.code === 'plugin_kept_data_incompatible', 'a plain retry is asked again, not let through');

    // The same for an install that is allowed over the data: it fails, and the record and the data stay what the uninstall left.
    const v2 = { ...fixture.release, version: 2 }; only(installed, fixture.release, v2);   // v2 names v1 as an earlier release, so it declares it can read v1's data
    const start = installed.platform.start;
    installed.platform.start = async () => {
      await rig.host.withProject(fixture.ref, runtime => runtime.store.db.prepare('INSERT INTO plugin_private_values (install_id, item_key, item_value) VALUES (?, ?, ?)').run(fixture.install.install_id, 'stray', 'written by the attempt'));
      throw new Error('start failed');
    };
    await assert.rejects(installed.lifecycle('install', v2, { consent: true }), /start failed/);
    installed.platform.start = start;
    assert.deepEqual(row(installed), before);
    assert.deepEqual(await rows(), data, 'what the failed attempt wrote is not added to the kept data');
    await writeFile(fixture.release.bundlePath, broken);
    await assert.rejects(installed.lifecycle('install', v2, { consent: true }), /安装没有完成/);
    assert.deepEqual(row(installed), before);

    await writeFile(fixture.release.bundlePath, working);
    await installed.lifecycle('install', v2, { consent: true });
    assert.deepEqual(installed.installations().map(({ state, version }) => ({ state, version })), [{ state: 'running', version: 2 }]);
    assert.equal(await client.invoke(caller, action(v2, 'read'), null), 'old data', 'the data the person kept is still there for the version that can read it');
  } finally { await rig.host.close(); await rm(home, { recursive: true, force: true }); }
});

test('when taking back a failed install fails too, the person is told about both', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-failed-cleanup-')), fixture = await publishedFixture(home, 'project'), rig = await hostWithProject(home, fixture);
  try {
    const installed = await rig.control(), runtime = installed.platform.runtime, abandon = runtime.abandonInstall.bind(runtime), start = installed.platform.start;
    await installed.lifecycle('uninstall', fixture.release, { keepData: true });
    installed.platform.start = async () => { throw new Error('start failed'); };
    runtime.abandonInstall = async () => { throw new Error('stop failed'); };
    await assert.rejects(installed.lifecycle('install', fixture.release, { consent: true }), (error: Error & { errors?: Error[] }) =>
      /start failed/.test(error.message) && /stop failed/.test(error.message) && error.errors?.length === 2 && (error.cause as Error).message === 'start failed');
    runtime.abandonInstall = abandon; installed.platform.start = start;
    await installed.lifecycle('uninstall', fixture.release, { keepData: true });
    await installed.lifecycle('install', fixture.release, { consent: true });
    assert.deepEqual(installed.installations().map(({ state, version }) => ({ state, version })), [{ state: 'running', version: 1 }]);
  } finally { await rig.host.close(); await rm(home, { recursive: true, force: true }); }
});

test('an install that fails after another install replaced it leaves that install alone: its data, secrets, approval, actions and running code', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-failed-replaced-')), fixture = await publishedFixture(home, 'project', false, ['weather']), rig = await hostWithProject(home, fixture);
  const action = (operation: string) => ({ capability_id: exposedActionId(fixture.release, operation), version: 1, provider_id: 'plugin:' + fixture.release.pluginId });
  const secret = { name: 'weather', header: 'X-Api-Key', value: 'k-123' }, approvalKey = 'plugin-builder:agent-studio:approved:' + fixture.release.pluginId;
  try {
    const installed = await rig.control(), client = rig.host.actionClient(fixture.ref), pluginId = fixture.release.pluginId, installId = fixture.install.install_id;
    await client.invoke(caller, action('save'), { value: 'old data' });
    await installed.lifecycle('uninstall', fixture.release, { keepData: true });
    const earlier = installed.platform.runtime.get(installId);

    // The first install waits in start; while it waits the person uninstalls it and installs again, and that install finishes.
    const start = installed.platform.start, entered = Promise.withResolvers<void>(), gate = Promise.withResolvers<void>();
    let attempts = 0;
    installed.platform.start = async (...args: Parameters<typeof start>) => {
      if (attempts++) return start.apply(installed.platform, args);
      entered.resolve(); await gate.promise; throw new Error('start failed');
    };
    const failing = installed.lifecycle('install', fixture.release, { consent: true }); failing.catch(() => {});
    await entered.promise;
    await installed.lifecycle('uninstall', fixture.release, { keepData: true });
    await installed.lifecycle('install', fixture.release, { consent: true, secrets: [secret] });
    await client.invoke(caller, action('save'), { value: 'newer data' });
    const replacing = installed.platform.runtime.get(installId);
    assert.equal(replacing.state, 'running');
    assert.notEqual(replacing.installation_generation, earlier.installation_generation, 'the second install is a new installation');

    gate.resolve();
    await assert.rejects(failing, (error: Error) => error.message === 'start failed' && !(error instanceof AggregateError), 'the first install fails with its own reason: it had nothing of its own left to undo');
    assert.deepEqual(installed.platform.runtime.get(installId), replacing, 'the row is still the second install\'s');
    assert.deepEqual(installed.installations().map(({ state, version }) => ({ state, version })), [{ state: 'running', version: 1 }]);
    assert.equal(await client.invoke(caller, action('read'), null), 'newer data', 'the first install did not put the old data back over it');
    assert.deepEqual(installed.secrets.list(pluginId), [{ name: 'weather', header: 'X-Api-Key' }], 'nor remove its secrets');
    assert.deepEqual(await installed.secrets.resolve(pluginId, 'weather'), { header: 'X-Api-Key', value: 'k-123' });
    assert.notEqual(installed.storage.get(approvalKey), null, 'nor its approval');
    assert.equal(installed.platform.supervisor.state(pluginId)?.status, 'running', 'nor revoke it');
    assert.equal(await client.invoke(caller, action('save'), { value: 'still writable' }), 'still writable');
  } finally { await rig.host.close(); await rm(home, { recursive: true, force: true }); }
});

test('a first-ever install that fails after the person uninstalled it and installed again leaves that install alone: its data, secrets, approval, actions and running code', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-first-failed-replaced-')), fixture = await publishedFixture(home, 'project', false, ['weather'], true), rig = await hostWithProject(home, fixture);
  const action = (operation: string) => ({ capability_id: exposedActionId(fixture.release, operation), version: 1, provider_id: 'plugin:' + fixture.release.pluginId });
  const secret = { name: 'weather', header: 'X-Api-Key', value: 'k-123' }, approvalKey = 'plugin-builder:agent-studio:approved:' + fixture.release.pluginId;
  try {
    const installed = await rig.control(), client = rig.host.actionClient(fixture.ref), pluginId = fixture.release.pluginId, installId = fixture.install.install_id;
    assert.equal(installed.platform.runtime.list().find(item => item.install_id === installId), undefined, 'nothing was ever installed: the first install has no uninstalled record to go back to');

    // The first install waits in start; while it waits the person uninstalls it and installs again, and that install finishes.
    const start = installed.platform.start, entered = Promise.withResolvers<void>(), gate = Promise.withResolvers<void>();
    let attempts = 0;
    installed.platform.start = async (...args: Parameters<typeof start>) => {
      if (attempts++) return start.apply(installed.platform, args);
      entered.resolve(); await gate.promise; throw new Error('start failed');
    };
    const failing = installed.lifecycle('install', fixture.release, { consent: true }); failing.catch(() => {});
    await entered.promise;
    const first = installed.platform.runtime.get(installId);
    await installed.lifecycle('uninstall', fixture.release, { keepData: true });
    await installed.lifecycle('install', fixture.release, { consent: true, secrets: [secret] });
    await client.invoke(caller, action('save'), { value: 'newer data' });
    const replacing = installed.platform.runtime.get(installId);
    assert.equal(replacing.state, 'running');
    assert.notEqual(replacing.installation_generation, first.installation_generation, 'the second install is a new installation');

    gate.resolve();
    await assert.rejects(failing, (error: Error) => error.message === 'start failed' && !(error instanceof AggregateError), 'the first install fails with its own reason: it had nothing of its own left to undo');
    assert.deepEqual(installed.platform.runtime.get(installId), replacing, 'the row is still the second install\'s');
    assert.deepEqual(installed.installations().map(({ state, version }) => ({ state, version })), [{ state: 'running', version: 1 }]);
    assert.equal(await client.invoke(caller, action('read'), null), 'newer data', 'the first install did not delete the data');
    assert.deepEqual(installed.secrets.list(pluginId), [{ name: 'weather', header: 'X-Api-Key' }], 'nor remove its secrets');
    assert.deepEqual(await installed.secrets.resolve(pluginId, 'weather'), { header: 'X-Api-Key', value: 'k-123' });
    assert.notEqual(installed.storage.get(approvalKey), null, 'nor its approval');
    assert.equal(installed.platform.supervisor.state(pluginId)?.status, 'running', 'nor revoke it');
    assert.equal(await client.invoke(caller, action('save'), { value: 'still writable' }), 'still writable');
  } finally { await rig.host.close(); await rm(home, { recursive: true, force: true }); }
});

test('an install that fails over kept data does not undo the person\'s choice to discard that data while it was starting', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-failed-discarded-')), fixture = await publishedFixture(home, 'project', false, ['weather']), rig = await hostWithProject(home, fixture);
  const action = (operation: string) => ({ capability_id: exposedActionId(fixture.release, operation), version: 1, provider_id: 'plugin:' + fixture.release.pluginId });
  const rows = () => rig.host.withProject(fixture.ref, runtime => new SqlitePluginPrivateStorage(runtime.store.db).snapshotInstallationData(fixture.install.install_id));
  try {
    const installed = await rig.control(), client = rig.host.actionClient(fixture.ref), installId = fixture.install.install_id;
    await client.invoke(caller, action('save'), { value: 'old data' });
    await installed.lifecycle('uninstall', fixture.release, { keepData: true });
    assert.ok((await rows()).length > 0);

    // The install waits in start; while it waits the person uninstalls it and does not keep the data; then the install fails.
    const start = installed.platform.start, entered = Promise.withResolvers<void>(), gate = Promise.withResolvers<void>();
    installed.platform.start = async () => { entered.resolve(); await gate.promise; throw new Error('start failed'); };
    const failing = installed.lifecycle('install', fixture.release, { consent: true }); failing.catch(() => {});
    await entered.promise;
    await installed.lifecycle('uninstall', fixture.release, { keepData: false });
    const discarded = installed.platform.runtime.get(installId);
    assert.ok(discarded.state === 'uninstalled' && !discarded.retain_private_data);
    assert.deepEqual(await rows(), [], 'the person discarded the data');

    gate.resolve();
    await assert.rejects(failing, (error: Error) => error.message === 'start failed' && !(error instanceof AggregateError));
    installed.platform.start = start;
    assert.deepEqual(installed.platform.runtime.get(installId), discarded, 'the record is the one the person left, not the one before the attempt');
    assert.deepEqual(await rows(), [], 'and the data they discarded did not come back');
    await installed.lifecycle('install', fixture.release, { consent: true });
    assert.equal(await client.invoke(caller, action('read'), null), 'empty', 'a later install starts fresh');
  } finally { await rig.host.close(); await rm(home, { recursive: true, force: true }); }
});

test('after an uninstall the newer published version can be installed again, with the kept data or without it', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-reinstall-newer-')), fixture = await publishedFixture(home, 'project'), rig = await hostWithProject(home, fixture);
  const action = (release: AgentRelease, operation: string) => ({ capability_id: exposedActionId(release, operation), version: release.version, provider_id: 'plugin:' + release.pluginId });
  try {
    const installed = await rig.control(), client = rig.host.actionClient(fixture.ref);
    await client.invoke(caller, action(fixture.release, 'save'), { value: 'kept across versions' });
    await installed.lifecycle('uninstall', fixture.release, { keepData: true });
    assert.deepEqual(installed.installations(), []);

    const v2 = { ...fixture.release, version: 2 }; installed.releases.release(v2);
    await installed.lifecycle('install', v2, { consent: true });
    assert.deepEqual(installed.installations().map(({ state, version }) => ({ state, version })), [{ state: 'running', version: 2 }]);
    assert.equal(await client.invoke(caller, action(v2, 'read'), null), 'kept across versions', 'the data the uninstall kept is there for the new version');
    assert.equal(installed.platform.runtime.get(fixture.install.install_id).installation_generation !== fixture.install.installation_generation, true, 'it is a new installation');

    await installed.lifecycle('uninstall', v2, { keepData: false });
    const v3 = { ...fixture.release, version: 3 }; installed.releases.release(v3);
    await installed.lifecycle('install', v3, { consent: true });
    assert.deepEqual(installed.installations().map(({ state, version }) => ({ state, version })), [{ state: 'running', version: 3 }]);
    assert.equal(await client.invoke(caller, action(v3, 'read'), null), 'empty', 'deleted data stays deleted');
  } finally { await rig.host.close(); await rm(home, { recursive: true, force: true }); }
});

test('a failing installed plugin is recorded with its own reason at startup, not another plugin\'s', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-restore-error-')), databasePath = join(home, 'project.sqlite'); seedDemoBoard(databasePath);
  let store = new LocalProjectDatabase(databasePath);
  try {
    const storage = studioStorage(store.db, DEMO_PROJECT_ID), builder = new AgentBuilderStore(storage), runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(store.db));
    const installIdOf = (buildId: string) => 'plugin-install-' + createHash('sha256').update('io.molis.work.generated.' + buildId + '\u0000' + installedSignature(buildId)).digest('hex').slice(0, 32);
    // The plugin restored first also sorts first by plugin id, so the Supervisor's sorted failure list starts with it.
    let first = '', second = '';
    for (let n = 1; !first; n++) {
      const a = '00000000-0000-4000-8000-' + String(n).padStart(12, '0'), b = '00000000-0000-4000-8000-' + String(n + 500).padStart(12, '0');
      if (installIdOf(a) < installIdOf(b)) { first = a; second = b; }
    }
    const make = async (buildId: string, bundle: string, grants: string[]) => {
      const pluginId = 'io.molis.work.generated.' + buildId;
      const contract: SandboxPluginContract = { version: 1, pluginId, revision: 'one', entities: [], pages: [], acceptance: [], operations: [
        { id: 'read', kind: 'query', input: { type: 'null' }, output: { type: 'string' }, effects: { storage: ['read'] }, errors: [], examples: [{ input: null, output: 'empty' }] }] };
      const bundlePath = join(home, buildId + '.mjs'); await writeFile(bundlePath, bundle);
      const release: AgentRelease = { buildId, pluginId, version: 1, directory: home, bundlePath, packagePath: home, prompts: [],
        design: { id: 'one', catalog: 'actions/1', title: 'Fixture ' + buildId.slice(-3), description: 'F', rationale: 'F', journey: [], contract, parts: [], acceptance: [] },
        nodes: [], manifest: buildManifest(contract), permissions: { storage: ['read'] }, publishedAt: new Date().toISOString() };
      builder.release(release); storage.set('plugin-builder:agent-studio:approved:' + pluginId, JSON.stringify(release.permissions));
      runtime.install({ definition: sandboxedPluginDefinition(release, release.permissions, []), deployment: 'local', grants });
      return pluginId;
    };
    const lacksGrant = await make(first, "export const operations={read:async()=>'empty'};", []);
    const brokenBundle = await make(second, "throw new Error('broken bundle');", ['storage:private']);
    store.close(); store = new LocalProjectDatabase(databasePath);
    const installed = await ensureInstalledPlugins({ store, projectId: DEMO_PROJECT_ID, homeDirectory: home });
    const reasonOf = (pluginId: string) => installed.platform.supervisor.state(pluginId)?.message;
    assert.match(reasonOf(lacksGrant) ?? '', /grant/);
    assert.match(reasonOf(brokenBundle) ?? '', /entrypoint/);
    assert.equal(installed.recoveryErrors.get(lacksGrant), reasonOf(lacksGrant));
    assert.equal(installed.recoveryErrors.get(brokenBundle), reasonOf(brokenBundle), 'each plugin shows what went wrong with it');
  } finally { await releaseInstalledPlugins(store, DEMO_PROJECT_ID); store.close(); await rm(home, { recursive: true, force: true }); }
});

test('closing a project releases every owner and closes its database even when one release fails, and still reports the failure', { ...mac, timeout: 90_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-close-failure-')), fixture = await publishedFixture(home, 'project');
  let closedReferences = 0;
  const host = new MolisWorkLocalHost({ homeDirectory: home, onRuntimeClose: () => { closedReferences++; } });
  try {
    const { store, installed } = await host.withProject(fixture.ref, async runtime => ({ store: runtime.store, installed: await ensureInstalledPlugins({ store: runtime.store, projectId: DEMO_PROJECT_ID, homeDirectory: home,
      actions: { registry: host.actionRegistry(fixture.ref), client: { ...host.actionClient(fixture.ref), ...host.syncActionClient(fixture.ref) }, project_id: DEMO_PROJECT_ID } }) }));
    assert.equal(installed.installations()[0]?.state, 'running');
    // The process really stops, then the stop reports a failure: the installed plugins are the first release to fail.
    const stop = installed.platform.runtime.stop.bind(installed.platform.runtime);
    installed.platform.runtime.stop = async (...args: Parameters<typeof stop>) => { await stop(...args); throw new Error('stop failed'); };

    await assert.rejects(host.closeProject(fixture.ref), /安装插件停止失败/);
    assert.throws(() => store.db.prepare('SELECT 1').get(), 'the release steps after the failing one ran, so the project database is closed');
    assert.equal(closedReferences, 1, 'the close was announced');
    assert.deepEqual(host.status().projects, [], 'the Host no longer lists the project');
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

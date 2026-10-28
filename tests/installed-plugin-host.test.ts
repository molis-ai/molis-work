import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentBuilderStore, type AgentRelease } from '@molis-ai/molis-work-plugin-builder';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionDefinition, type ActionExecutionPolicy } from '@molis-ai/molis-work-contracts/platform/actions';
import { PluginRuntime, SqlitePluginPrivateStorage, SqlitePluginRuntimeRepository } from '@molis-ai/molis-work-plugin-runtime';
import type { PluginPackageBundle } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { LocalProjectDatabase } from '@molis-ai/molis-work-app-local-host';
import { seedDemoBoard, DEMO_PROJECT_ID, runningPluginDirectory } from '@molis-ai/molis-work-app-local-host';
import { HomeConsentLedger, MolisWorkLocalHost, PLUGIN_INSTALL_PERMISSIONS, PluginInstallService, SandboxPackageStore, molisWorkHostProjectReference, pluginInstallActions } from '@molis-ai/molis-work-app-local-host';
import { ensureInstalledPlugins, releaseInstalledPlugins } from '../apps/local-host/dist/installed-plugin-host.js';
import { installedSignature, sandboxedPluginDefinition } from '../apps/local-host/dist/plugin-builder/installed.js';
import { exposedActionId } from '../apps/local-host/dist/plugin-builder/exposed-actions.js';
import { studioStorage } from '../apps/local-host/dist/plugin-builder/storage.js';
import { buildManifest } from '../apps/local-host/dist/plugin-builder/build-project.js';
import { scheduleServiceFor, withConnectorConnections } from '@molis-ai/molis-work-app-local-host';
import { FEED_PLUGIN_ID } from '@molis-ai/molis-work-plugin-feed';
import { SCHEDULE_OPERATION_WAKEUP, SCHEDULE_PLUGIN_ID } from '@molis-ai/molis-work-plugin-schedule';
import { pluginBindingScope } from '@molis-ai/molis-work-service-connector-host';
import { callAs, callerPlugin, issuedCaller, registerProbe, startProjectPlugins } from './fixtures/plugin-callers.js';
import { agentDefinitionsFor } from '../apps/local-host/dist/agent-definitions/agent-definitions.js';
import { builtinRegistrations } from '../apps/local-host/dist/agent-definitions/builtin-registrations.js';
import { PACKAGE_PLUGIN_ID, newPublisher, signedPackage } from './fixtures/sandbox-package.js';

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
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(store.db), undefined, { hostIds: ISOLATED_HOST_IDS });
  const { install } = runtime.install({ trust: { level: "unsigned" }, definition: sandboxedPluginDefinition(release, release.permissions, []), deployment: 'local', grants: ['storage:private'] });
  if (neverInstalled) store.db.prepare('DELETE FROM plugin_runtime_installs WHERE install_id = ?').run(install.install_id);
  store.close();
  return { databasePath, release, install, draft: waiting, ref: molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID }) };
}

test('Host discovery and invocation refresh generated cost without rewriting installed identity or running its capabilities', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-public-policy-'));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const fixture = await publishedFixture(home, 'project', true);
  const reader = callerPlugin('costreader', 'project');
  const host = new MolisWorkLocalHost({ homeDirectory: home, pluginFixtures: { project: [reader.definition] } }), client = host.actionClient(fixture.ref);
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
    // A plugin discovers as the caller the Host issued its session; the other audiences are the person's own call context.
    const probe = registerProbe(host.actionRegistry(fixture.ref), 'project');
    await startProjectPlugins(host, fixture.ref);
    const asPlugin = callAs(await issuedCaller(probe, reader, DEMO_PROJECT_ID), []);
    for (const audience of ['user', 'agent', 'mcp', 'workflow', 'plugin'] as const) {
      const views = await client.discover(audience === 'plugin' ? asPlugin : { ...caller, audience });
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

test('SYS-15-S1 Host alone restores installed actions and scheduled operations, retains data across restart and leaves authoring untouched', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-headless-'));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const fixture = await publishedFixture(home, 'project'), { release, ref } = fixture;
  let host = new MolisWorkLocalHost({ homeDirectory: home });
  const action = (operation: string) => ({ capability_id: exposedActionId(release, operation), version: 1, provider_id: 'plugin:' + release.pluginId });
  try {
    await host.inspectActions(caller, ref);
    const client = host.actionClient(ref), discovered = await client.discover(caller);
    assert.equal(discovered.filter(view => view.capability_id.startsWith('generated.')).length, 3);
    const privateValues = () => host.withProject(ref, runtime => new SqlitePluginPrivateStorage(runtime.store.db).snapshotInstallationData(fixture.install.install_id));
    const beforeRead = await privateValues();
    assert.equal(await client.invoke(caller, action('read'), null), 'empty', 'null reaches the declared contract unchanged');
    assert.deepEqual(await privateValues(), beforeRead, 'SYS-15-S1 a sandbox query never persists an unchanged private snapshot');
    assert.equal(await client.invoke(caller, action('save'), { value: 'original data' }), 'original data');
    const at = Date.now() + 1500;
    await client.invoke(caller, action('schedule'), new Date(at).toISOString());
    await host.close();
    const closed = new LocalProjectDatabase(fixture.databasePath);
    try { assert.equal(new SqlitePluginRuntimeRepository(closed.db).get(fixture.install.install_id)?.state, 'installed', 'normal Host close preserves enabled intent'); }
    finally { closed.close(); }
    host = new MolisWorkLocalHost({ homeDirectory: home });
    await host.inspectActions(caller, ref);
    assert.equal(await host.actionClient(ref).invoke(caller, action('read'), null), 'original data');
    await host.withProject(ref, async runtime => {
      const clock = scheduleServiceFor(runtime.store.db);
      // Feed asks the clock for its own wakeup in the background (runtime-wake.ts:52-64); wait for it, for up to its own retry budget.
      const feedJobs = () => clock.list(FEED_PLUGIN_ID).filter(job => job.capability_id === 'feed.sources.wake');
      for (let waited = 0; !feedJobs().length && waited < 5_000; waited += 25) await new Promise(resolve => setTimeout(resolve, 25));
      const own = clock.list(SCHEDULE_PLUGIN_ID).filter(job => job.capability_id === SCHEDULE_OPERATION_WAKEUP), feed = feedJobs();
      assert.equal(own.length, 1, JSON.stringify(clock.list()));
      assert.equal(feed.length, 1, JSON.stringify(clock.list()));
      // RAC-1170: the tick reaches this test's own one-shot task and its operation's side effect (`read` answers 'scheduled' below).
      assert.equal(clock.get(own[0]!.job_id)?.enabled, true, JSON.stringify(clock.list()));
      assert.ok(Date.parse(own[0]!.next_due_at) <= Date.parse(feed[0]!.next_due_at) + 1, JSON.stringify(clock.list()));
      // RAC-1171: the receipt still counts every due task of the whole project clock — this one and Feed's wakeup.
      const tickAt = new Date(Math.max(at + 1000, Date.parse(feed[0]!.next_due_at) + 1));
      const due = clock.list().filter(job => job.enabled && Date.parse(job.next_due_at) <= tickAt.getTime());
      assert.deepEqual(due.map(job => job.job_id).sort(), [own[0]!.job_id, feed[0]!.job_id].sort(), JSON.stringify(clock.list()));
      assert.deepEqual(await clock.tick(tickAt), { invoked: 2, failed: 0, skipped: 0 }, JSON.stringify(clock.list()));
      assert.equal(clock.get(own[0]!.job_id)?.last_wakeup?.status, 'ok');
      assert.equal(clock.get(feed[0]!.job_id)?.last_wakeup?.status, 'ok');
      assert.deepEqual(clock.list().filter(job => job.enabled).map(job => [job.plugin_id, job.capability_id]), [[FEED_PLUGIN_ID, 'feed.sources.wake']]);
      const builder = new AgentBuilderStore(studioStorage(runtime.store.db, DEMO_PROJECT_ID));
      assert.deepEqual(builder.get(fixture.draft.id), fixture.draft, 'restoring or executing an install does not resume the authoring Workflow');
      assert.equal(new SqlitePluginRuntimeRepository(runtime.store.db).get(fixture.install.install_id)?.manifest_digest, fixture.install.manifest_digest, 'no same-version manifest rewrite');
    });
    assert.equal(await host.actionClient(ref).invoke(caller, action('read'), null), 'scheduled');
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test('explicitly disabled installations stay disabled after Host restart and only an explicit enable restores discovery', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-disabled-'));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const fixture = await publishedFixture(home, 'project');
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
  const home = await mkdtemp(join(tmpdir(), 'installed-disabled-upgrade-'));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const fixture = await publishedFixture(home, 'project'), rig = await hostWithProject(home, fixture);
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
    // W3-02-C: the router answers a plugin that is not enabled with the platform's code (it was 404 plugin_not_enabled).
    assert.equal(router?.status, 403, 'and it runs nothing');
    assert.equal((router?.body as { code?: string }).code, 'actions.plugin_disabled');
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
  const home = await mkdtemp(join(tmpdir(), 'installed-disabled-consent-'));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const fixture = await publishedFixture(home, 'project'), rig = await hostWithProject(home, fixture);
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
  const home = await mkdtemp(join(tmpdir(), 'installed-quarantined-'));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const fixture = await publishedFixture(home, 'project');
  const database = new LocalProjectDatabase(fixture.databasePath);
  new SqlitePluginRuntimeRepository(database.db).save({ ...fixture.install, state: 'quarantined' }); database.close();
  const rig = await hostWithProject(home, fixture);
  try {
    const installed = await rig.control(), next = { ...fixture.release, version: 2 }; installed.releases.release(next);
    const snapshot = () => ({ supervisor: installed.platform.supervisor.state(fixture.release.pluginId), installation: installed.platform.runtime.get(fixture.install.install_id) });
    const before = structuredClone(snapshot()), calls = { upgrade: 0, rollback: 0 };
    const upgrade = installed.platform.upgrade.bind(installed.platform), rollback = installed.platform.rollback.bind(installed.platform);
    installed.platform.upgrade = (...args) => { calls.upgrade++; return upgrade(...args); };
    installed.platform.rollback = (...args) => { calls.rollback++; return rollback(...args); };
    await assert.rejects(installed.lifecycle('upgrade', next), /隔离/);
    assert.deepEqual(snapshot(), before, 'a refused upgrade leaves the restored declaration and the installation unchanged');
    await assert.rejects(installed.lifecycle('rollback', fixture.release), /隔离/);
    assert.deepEqual(snapshot(), before, 'a refused rollback leaves the restored declaration and the installation unchanged');
    assert.deepEqual(calls, { upgrade: 0, rollback: 0 }, 'neither refused version switch reaches the Supervisor');
    await installed.lifecycle('uninstall', fixture.release, { keepData: true });
    await installed.lifecycle('install', next, { consent: true });
    assert.deepEqual(installed.installations().map(({ state, version }) => ({ state, version })), [{ state: 'running', version: 2 }], 'uninstalling and installing again is the way out');
  } finally { await rig.host.close(); await rm(home, { recursive: true, force: true }); }
});

test('an install that cannot start leaves nothing behind: no secrets, no approval, no crashed record, and it can be tried again', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-failed-install-'));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const fixture = await publishedFixture(home, 'project', false, ['weather']), rig = await hostWithProject(home, fixture);
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
  const home = await mkdtemp(join(tmpdir(), 'installed-discard-kept-'));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const fixture = await publishedFixture(home, 'project'), rig = await hostWithProject(home, fixture);
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
    await assert.rejects(installed.lifecycle('install', v3, { consent: true }), (error: { code?: string; message: string }) => error.code === 'plugin.kept_data_incompatible' && /放弃/.test(error.message));
    await assert.rejects(installed.lifecycle('install', v3, { consent: true, discardKeptData: false }), (error: { code?: string }) => error.code === 'plugin.kept_data_incompatible');
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
  const home = await mkdtemp(join(tmpdir(), 'installed-failed-over-kept-'));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const fixture = await publishedFixture(home, 'project'), rig = await hostWithProject(home, fixture);
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
    await assert.rejects(installed.lifecycle('install', v3, { consent: true }), (error: { code?: string }) => error.code === 'plugin.kept_data_incompatible', 'a plain retry is asked again, not let through');

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
  const home = await mkdtemp(join(tmpdir(), 'installed-failed-cleanup-'));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const fixture = await publishedFixture(home, 'project'), rig = await hostWithProject(home, fixture);
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
  const home = await mkdtemp(join(tmpdir(), 'installed-failed-replaced-'));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const fixture = await publishedFixture(home, 'project', false, ['weather']), rig = await hostWithProject(home, fixture);
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
  const home = await mkdtemp(join(tmpdir(), 'installed-first-failed-replaced-'));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const fixture = await publishedFixture(home, 'project', false, ['weather'], true), rig = await hostWithProject(home, fixture);
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
  const home = await mkdtemp(join(tmpdir(), 'installed-failed-discarded-'));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const fixture = await publishedFixture(home, 'project', false, ['weather']), rig = await hostWithProject(home, fixture);
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

test('RAC-609-UNINSTALL-01 after an uninstall the directory loses the real installation and a newer published version can be installed again, with the kept data or without it', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-reinstall-newer-'));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const fixture = await publishedFixture(home, 'project'), rig = await hostWithProject(home, fixture);
  const action = (release: AgentRelease, operation: string) => ({ capability_id: exposedActionId(release, operation), version: release.version, provider_id: 'plugin:' + release.pluginId });
  try {
    const installed = await rig.control(), client = rig.host.actionClient(fixture.ref);
    const listed = () => runningPluginDirectory(installed.platform.supervisor).some(entry => entry.plugin_id === fixture.release.pluginId);
    await client.invoke(caller, action(fixture.release, 'save'), { value: 'kept across versions' });
    assert.equal(listed(), true, 'the installed plugin is in the real Host directory before the uninstall');
    await installed.lifecycle('uninstall', fixture.release, { keepData: true });
    assert.equal(installed.platform.runtime.get(fixture.install.install_id).state, 'uninstalled');
    assert.equal(listed(), false, 'the next directory read after a retaining Host uninstall has no entry');
    assert.deepEqual(installed.installations(), []);

    const v2 = { ...fixture.release, version: 2 }; installed.releases.release(v2);
    await installed.lifecycle('install', v2, { consent: true });
    assert.deepEqual(installed.installations().map(({ state, version }) => ({ state, version })), [{ state: 'running', version: 2 }]);
    assert.equal(listed(), true, 'the new installation returns to the directory');
    assert.equal(await client.invoke(caller, action(v2, 'read'), null), 'kept across versions', 'the data the uninstall kept is there for the new version');
    assert.equal(installed.platform.runtime.get(fixture.install.install_id).installation_generation !== fixture.install.installation_generation, true, 'it is a new installation');

    await installed.lifecycle('uninstall', v2, { keepData: false });
    assert.equal(installed.platform.runtime.get(fixture.install.install_id).state, 'uninstalled');
    assert.equal(listed(), false, 'dropping private data also leaves no entry on the next directory read');
    const v3 = { ...fixture.release, version: 3 }; installed.releases.release(v3);
    await installed.lifecycle('install', v3, { consent: true });
    assert.deepEqual(installed.installations().map(({ state, version }) => ({ state, version })), [{ state: 'running', version: 3 }]);
    assert.equal(listed(), true, 'installing after data deletion returns the fresh installation to the directory');
    assert.equal(await client.invoke(caller, action(v3, 'read'), null), 'empty', 'deleted data stays deleted');
  } finally { await rig.host.close(); await rm(home, { recursive: true, force: true }); }
});

test('a failing installed plugin is recorded with its own reason at startup, not another plugin\'s', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-restore-error-')), databasePath = join(home, 'project.sqlite'); seedDemoBoard(databasePath);
  let store = new LocalProjectDatabase(databasePath);
  try {
    const storage = studioStorage(store.db, DEMO_PROJECT_ID), builder = new AgentBuilderStore(storage), runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(store.db), undefined, { hostIds: ISOLATED_HOST_IDS });
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
      runtime.install({ trust: { level: "unsigned" }, definition: sandboxedPluginDefinition(release, release.permissions, []), deployment: 'local', grants });
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
  const home = await mkdtemp(join(tmpdir(), 'installed-close-failure-'));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const fixture = await publishedFixture(home, 'project');
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

// W2-18-UPGRADE-SECRETS-01: real Runtime/Supervisor, catalog inspection, sealed storage and exposed actions.
for (const choice of ['catalog-failure', 'disable', 'disable-enable'] as const)
  test(`an upgrade with new consent secrets preserves ${choice === 'catalog-failure' ? 'the old release on catalog failure' : 'the newer ' + choice + ' choice'}`, mac, async t => {
    const home = await mkdtemp(join(tmpdir(), 'installed-upgrade-secrets-')), fixture = await publishedFixture(home, 'project', false, ['weather']);
    const store = new LocalProjectDatabase(fixture.databasePath), service = new ActionService();
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), reexposed = Promise.withResolvers<void>();
    let armed = false, inspections = 0, exposures = 0;
    const register = service.registerProvider.bind(service);
    t.mock.method(service, 'registerProvider', registration => {
      const dispose = register(registration);
      if (registration.definitions.some(definition => definition.capability_id === exposedActionId(fixture.release, 'read') && definition.version === 2)
        && ++exposures === 2) reexposed.resolve();
      return dispose;
    });
    const installed = await ensureInstalledPlugins({ store, projectId: DEMO_PROJECT_ID, homeDirectory: home, actions: { registry: service, client: service, project_id: DEMO_PROJECT_ID,
      inspect: async actor => {
        const snapshot = service.inspect(actor);
        if (armed && inspections++ === 0) { entered.resolve(); await release.promise; if (choice === 'catalog-failure') { armed = false; throw new Error('controlled catalog failure'); } }
        return snapshot;
      } } });
    const pluginId = fixture.release.pluginId, old = { name: 'weather', header: 'X-Api-Key', value: randomUUID() }, replacement = { ...old, value: randomUUID() };
    const fresh = { name: 'new-provider', header: 'Authorization', value: randomUUID() };
    installed.secrets.save(pluginId, old);
    const v2 = { ...fixture.release, version: 2, permissions: { ...fixture.release.permissions, secretRefs: ['weather', 'new-provider'] } }; installed.releases.release(v2);
    const approvalKey = 'plugin-builder:agent-studio:approved:' + pluginId, beforeApproval = installed.storage.get(approvalKey);
    try {
      armed = true; const pending = installed.lifecycle('upgrade', v2, { consent: true, secrets: [replacement, fresh] });
      const rejected = assert.rejects(pending);
      await entered.promise;
      let enabling: Promise<void> | undefined;
      if (choice !== 'catalog-failure') await installed.lifecycle('disable', v2);
      if (choice === 'disable-enable') { enabling = installed.lifecycle('enable', v2); await reexposed.promise; }
      release.resolve(); await rejected; await enabling;
      const record = installed.records().find(record => record.plugin_id === pluginId)!;
      if (choice === 'catalog-failure') {
        assert.equal(record.version, '1.0.0'); assert.equal(record.state, 'running');
        assert.deepEqual(await installed.secrets.resolve(pluginId, old.name), { header: old.header, value: old.value });
        assert.equal(await installed.secrets.resolve(pluginId, fresh.name), null); assert.equal(installed.storage.get(approvalKey), beforeApproval);
      } else {
        assert.equal(record.version, '2.0.0'); assert.equal(record.state, choice === 'disable' ? 'disabled' : 'running');
        assert.deepEqual(await installed.secrets.resolve(pluginId, fresh.name), { header: fresh.header, value: fresh.value });
        assert.deepEqual(await installed.secrets.resolve(pluginId, old.name), { header: replacement.header, value: replacement.value });
      }
      assert.ok(!JSON.stringify(installed.secrets.list(pluginId)).includes(fresh.value));
      assert.ok(!installed.storage.get(approvalKey)!.includes(replacement.value));
      if (choice === 'catalog-failure') {
        await installed.lifecycle('upgrade', v2, { consent: true, secrets: [replacement, fresh] });
        assert.equal(installed.records()[0]!.version, '2.0.0');
        assert.deepEqual(await installed.secrets.resolve(pluginId, fresh.name), { header: fresh.header, value: fresh.value });
      }
    } finally { release.resolve(); await releaseInstalledPlugins(store, DEMO_PROJECT_ID); store.close(); await rm(home, { recursive: true, force: true }); }
  });

test("S-71 RAC-865 the creator host's uninstall of the only installation the Home can see takes its slot and its record bindings, never those of an identity that begins like it", mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-connection-bindings-'));
  const fixture = await publishedFixture(home, 'first'), copy = join(home, 'second.sqlite');
  await copyFile(fixture.databasePath, copy);
  // Two projects whose ids are a prefix pair, outside any catalog: the Home sees no other place that has the installation, so it goes
  // with this uninstall. Whether the slot stays while another project installs it is S-71 RAC-861 (security-invariants-installation-bindings.test.ts).
  const projects = [DEMO_PROJECT_ID, DEMO_PROJECT_ID + '0'], stores = [fixture.databasePath, copy].map(path => new LocalProjectDatabase(path));
  const install_id = fixture.install.install_id, pluginId = fixture.release.pluginId;
  const bearer = 'fixture-bearer-value-for-s72';
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: 'github', displayName: 'GitHub', token: bearer }));
  const mine = [pluginBindingScope({ install_id }), ...projects.map(project_id => pluginBindingScope({ install_id, project_id, record_key: 'src-1' }))];
  const neighbour = [pluginBindingScope({ install_id: install_id + '0' }), pluginBindingScope({ install_id: install_id + '0', project_id: projects[0]!, record_key: 'src-1' })];
  for (const scope of [...mine, ...neighbour]) {
    withConnectorConnections(home, store => store.bind({ scopeId: scope, pluginId, slotId: 'feed', serviceId: 'github', connectionId: connection.connection_id }));
  }
  const left = () => [...mine, ...neighbour].filter(scope => withConnectorConnections(home, store => store.binding(scope, pluginId, 'feed')) !== null);
  try {
    const [one, two] = await Promise.all(stores.map((store, index) => ensureInstalledPlugins({ store, projectId: projects[index]!, homeDirectory: home })));
    await one.lifecycle('uninstall', fixture.release, { keepData: true });
    assert.deepEqual(left(), neighbour, 'the installation went with its slot and both records; the identity that only begins like it stays');
    await two.lifecycle('uninstall', fixture.release, { keepData: false });
    assert.deepEqual(left(), neighbour);
  } finally { for (const [index, store] of stores.entries()) { await releaseInstalledPlugins(store, projects[index]!); store.close(); } await rm(home, { recursive: true, force: true }); }
});

async function signedInstallFixture() {
  const home = await mkdtemp(join(tmpdir(), 't2-first-install-'));
  let host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const databasePath = join(home, 'project.sqlite'); seedDemoBoard(databasePath);
  const reference = molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID });
  const ledger = new HomeConsentLedger(home), packages = new SandboxPackageStore(home);
  const person = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: 'user' as const, project_id: DEMO_PROJECT_ID, permissions: PLUGIN_INSTALL_PERMISSIONS,
    user_action: { source: 'management' as const, conversation_ref: 't2-first:install', message_ref: 't2-first:confirm' } };
  const confirm = async (bundle: PluginPackageBundle) => {
    const client = host.actionClient(reference);
    const preview = await client.invoke(person, { capability_id: pluginInstallActions.preview.capability_id, version: pluginInstallActions.preview.version }, { bundle }) as { preview_id: string };
    return client.invoke(person, { capability_id: pluginInstallActions.confirm.capability_id, version: 1 }, { preview_id: preview.preview_id, consent: true, pin_label: 'Test publisher' });
  };
  const control = () => host.withProject(reference, runtime => ensureInstalledPlugins({ store: runtime.store, projectId: DEMO_PROJECT_ID, homeDirectory: home,
    actions: { registry: host.actionRegistry(reference), client: { ...host.actionClient(reference), ...host.syncActionClient(reference) }, project_id: DEMO_PROJECT_ID } }));
  await control();
  return { home, reference, ledger, packages, confirm, control,
    get host() { return host; }, async reopen() { await host.close(); host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }); return control(); },
    async close() { try { await host.close(); } finally { await rm(home, { recursive: true, force: true }); } } };
}

test('T2-FIX-02 a failed signed-package install keeps its pin and immutable package, but no installation can run, also after restart', mac, async () => {
  const h = await signedInstallFixture(), publisher = newPublisher();
  const bundle = signedPackage(publisher, files => { files['plugin.mjs'] = "throw new Error('T2 package startup failed');"; });
  const confirm = () => h.confirm(bundle);
  try {
    await assert.rejects(confirm(), /安装没有完成/);
    const pins = h.ledger.publishers();
    assert.equal(pins.length, 1); assert.equal(pins[0]!.key_id, publisher.identity);
    const directories = await readdir(join(h.home, 'plugin-packages'));
    assert.equal(directories.length, 1);
    const saved = join(h.home, 'plugin-packages', directories[0]!, 'bundle.json'), bytes = await readFile(saved);
    const release = h.packages.load(PACKAGE_PLUGIN_ID, publisher.identity, '1.0.0');
    const absent = async () => {
      const installed = await h.control();
      assert.deepEqual(installed.records().filter(row => row.plugin_id === PACKAGE_PLUGIN_ID), []);
      assert.equal(installed.releaseFor(PACKAGE_PLUGIN_ID), undefined, 'a kept package alone is not an installed release');
      await assert.rejects(installed.lifecycle('enable', release), /还没有安装/);
      const actions = await h.host.actionClient(h.reference).discover(caller);
      assert.ok(!actions.some(view => view.capability_id === exposedActionId(release, 'notes.list')), 'no action from the failed package is executable');
    };
    await absent();
    await h.reopen(); await absent();
    await assert.rejects(confirm(), /安装没有完成/);
    assert.deepEqual(h.ledger.publishers(), pins, 'retry does not replace the person\'s pin');
    assert.deepEqual(await readdir(join(h.home, 'plugin-packages')), directories, 'retry reuses the immutable package directory');
    assert.deepEqual(await readFile(saved), bytes); await absent();
  } finally { await h.close(); }
});

test('T2-FIX-05 BL623-02 a pinned rollback returns plugin.state_invalid, and an upgrade to the version already installed plugin.upgrade_required, without changing the installation, approval, pin or package', mac, async () => {
  const h = await signedInstallFixture(), publisher = newPublisher(), bundle = signedPackage(publisher);
  try {
    await h.confirm(bundle);
    const installed = await h.control(), release = h.packages.load(PACKAGE_PLUGIN_ID, publisher.identity, '1.0.0');
    const records = () => installed.platform.runtime.list().filter(row => row.plugin_id === PACKAGE_PLUGIN_ID);
    const before = records(), approvalKey = 'plugin-builder:agent-studio:approved:' + PACKAGE_PLUGIN_ID;
    assert.equal(before[0]!.state, 'running', 'the package is genuinely installed and started before the refusals');
    const approval = installed.storage.get(approvalKey), pins = h.ledger.publishers(), bytes = await readFile(release.bundlePath);
    for (const action of ['upgrade', 'rollback'] as const) {
      await assert.rejects(installed.lifecycle(action, release, { consent: true }), error => error instanceof ActionError && (action === 'upgrade'
        ? error.code === 'plugin.upgrade_required' : error.code === 'plugin.state_invalid' && error.message === '从签名的包装进来的插件还不能回滚：先卸载，再装新的包'));
      assert.deepEqual(records(), before); assert.equal(installed.storage.get(approvalKey), approval);
      assert.deepEqual(h.ledger.publishers(), pins); assert.deepEqual(await readFile(release.bundlePath), bytes);
      assert.equal(installed.releaseFor(PACKAGE_PLUGIN_ID)?.packaged?.manifest.version, '1.0.0');
    }
  } finally { await h.close(); }
});

test('RAC-392 S-87 an installation of a publisher taken back is stopped when the project opens, cannot be enabled, is not read back from its package, and says why', mac, async () => {
  const h = await signedInstallFixture(), publisher = newPublisher(), bundle = signedPackage(publisher);
  try {
    await h.confirm(bundle);
    const release = h.packages.load(PACKAGE_PLUGIN_ID, publisher.identity, '1.0.0');
    new PluginInstallService({ ledger: h.ledger, packages: h.packages, installInProject: async () => undefined, installInHome: async () => undefined, installed: async () => [], control: async () => 'disabled' }).revokePublisher(publisher.identity);
    const stopped = async () => {
      const installed = await h.control();
      assert.equal(installed.platform.runtime.list().find(row => row.plugin_id === PACKAGE_PLUGIN_ID)?.state, 'disabled', 'stopped, not left running');
      await assert.rejects(installed.lifecycle('enable', release, {}), (error: unknown) => error instanceof ActionError && error.code === 'plugin.publisher_revoked');
      assert.equal(installed.releaseFor(PACKAGE_PLUGIN_ID), undefined, 'a package of a publisher taken back is not read back for a run');
      assert.match(installed.recoveryErrors.get(PACKAGE_PLUGIN_ID) ?? '', /撤销/, 'the person is told why');
      assert.equal(h.packages.load(PACKAGE_PLUGIN_ID, publisher.identity, '1.0.0').pluginId, PACKAGE_PLUGIN_ID, 'the kept package and its data are not removed');
    };
    await stopped();
    await h.reopen(); await stopped();
  } finally { await h.close(); }
});

test('RAC-392 S-87 a Host restarted right after a publisher was taken back, before any project looked, does not start what it signed, although the package verifies as pinned', mac, async () => {
  const h = await signedInstallFixture(), publisher = newPublisher(), bundle = signedPackage(publisher);
  try {
    await h.confirm(bundle);
    const running = await h.control();
    assert.equal(running.platform.runtime.list().find(row => row.plugin_id === PACKAGE_PLUGIN_ID)?.state, 'running', 'it was running when the publisher was taken back');
    const release = h.packages.load(PACKAGE_PLUGIN_ID, publisher.identity, '1.0.0');
    new PluginInstallService({ ledger: h.ledger, packages: h.packages, installInProject: async () => undefined, installInHome: async () => undefined, installed: async () => [], control: async () => 'disabled' }).revokePublisher(publisher.identity);
    // The restart is the first thing that looks: the installation's record still says it runs, and the package on disk still verifies against its pin.
    const restarted = await h.reopen();
    assert.notEqual(restarted.platform.runtime.list().find(row => row.plugin_id === PACKAGE_PLUGIN_ID)?.state, 'running', 'not started again');
    assert.notEqual(restarted.platform.supervisor.state(PACKAGE_PLUGIN_ID)?.status, 'running', 'the Supervisor does not run it either');
    await assert.rejects(restarted.lifecycle('enable', release, {}), (error: unknown) => error instanceof ActionError && error.code === 'plugin.publisher_revoked');
    assert.match(restarted.recoveryErrors.get(PACKAGE_PLUGIN_ID) ?? '', /撤销/, 'the person is told why');
  } finally { await h.close(); }
});

// RAC-1150 T-032: a crashed installation is still something the person can switch off: the disable withdraws its prompts and actions,
// keeps the crash on the record, and succeeds instead of refusing with plugin.state_invalid.
test('RAC-1150 disabling a crashed installation withdraws it and keeps the crash on the record', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-crashed-'));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const fixture = await publishedFixture(home, 'project'), rig = await hostWithProject(home, fixture);
  try {
    const installed = await rig.control(), runtime = installed.platform.runtime;
    await runtime.reportCrash(fixture.install.install_id);
    assert.equal(runtime.get(fixture.install.install_id)?.state, 'crashed');
    await installed.lifecycle('disable', fixture.release);
    const registry = agentDefinitionsFor(home, builtinRegistrations), key = fixture.release.pluginId + '/summary';
    const prompt = registry.prompt(key).source;
    assert.equal(prompt.kind === 'plugin' ? prompt.state : undefined, 'disabled');
    assert.equal((await installed.catalog()).some(entry => entry.id.startsWith('generated.')), false);
    assert.equal(await rig.generated(), 0);
    assert.equal(installed.platform.runtime.get(fixture.install.install_id)?.state, 'crashed', 'disabling it does not pretend the process stopped cleanly');
    // Leave a stop the Host's own close can do: recover it, then switch it off again.
    await runtime.recover(fixture.install.install_id); await installed.lifecycle('disable', fixture.release);
  } finally {
    // A crashed installation cannot be stopped on the way out; the record is what this case is about.
    await rig.host.close().catch(error => { if (!(error instanceof AggregateError)) throw error; });
    await rm(home, { recursive: true, force: true });
  }
});

// RAC-1150 T-032: the same for an installation the Runtime already quarantined after repeated crashes.
test('RAC-1150 disabling a quarantined installation withdraws it and keeps the quarantine on the record', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-quarantined-'));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const fixture = await publishedFixture(home, 'project'), rig = await hostWithProject(home, fixture);
  try {
    const installed = await rig.control(), runtime = installed.platform.runtime;
    for (let attempt = 0; attempt < 3; attempt++) { await runtime.reportCrash(fixture.install.install_id); await runtime.recover(fixture.install.install_id); }
    await runtime.reportCrash(fixture.install.install_id);
    await assert.rejects(runtime.recover(fixture.install.install_id), { code: 'plugin.quarantined' });
    assert.equal(runtime.get(fixture.install.install_id)?.state, 'quarantined');
    await installed.lifecycle('disable', fixture.release);
    const registry = agentDefinitionsFor(home, builtinRegistrations), key = fixture.release.pluginId + '/summary';
    const prompt = registry.prompt(key).source;
    assert.equal(prompt.kind === 'plugin' ? prompt.state : undefined, 'disabled');
    assert.equal((await installed.catalog()).some(entry => entry.id.startsWith('generated.')), false);
    assert.equal(installed.platform.runtime.get(fixture.install.install_id)?.state, 'quarantined');
    await runtime.recover(fixture.install.install_id, { release_quarantine: true }); await installed.lifecycle('disable', fixture.release);
  } finally { await rig.host.close(); await rm(home, { recursive: true, force: true }); }
});

// RAC-1152 T-032: only plugin.state_invalid is let through by the disable; a stop that really failed (plugin.executor_failed here) is still
// reported to the person and the prompts stay enabled.
test('RAC-1152 disabling an installation whose stop fails reports the failure instead of swallowing it', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-stop-failed-'));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const fixture = await publishedFixture(home, 'project'), rig = await hostWithProject(home, fixture);
  try {
    const installed = await rig.control(), runtime = installed.platform.runtime, stop = runtime.stop.bind(runtime);
    runtime.stop = async () => { throw new ActionError('plugin.executor_failed', '停止钩子失败'); };
    await assert.rejects(installed.lifecycle('disable', fixture.release), (error: unknown) => error instanceof ActionError && error.code === 'plugin.executor_failed');
    runtime.stop = stop;
    const registry = agentDefinitionsFor(home, builtinRegistrations), key = fixture.release.pluginId + '/summary';
    const prompt = registry.prompt(key).source;
    assert.equal(prompt.kind === 'plugin' ? prompt.state : undefined, 'enabled', 'a disable that did not stop it leaves the prompts on');
    // The Host still owns a running instance, so switch it off for real before closing the Home.
    await installed.lifecycle('disable', fixture.release);
  } finally { await rig.host.close(); await rm(home, { recursive: true, force: true }); }
});

// RAC-1151 T-032: an exposure that fails reports its own error even when the cleanup's stop is refused because the installation crashed
// while the exposure was reading the catalog; the crash is not a second failure to report over the first.
test('RAC-1151 an exposure failure keeps its own error when the cleanup stop is refused', mac, async () => {
  const home = await mkdtemp(join(tmpdir(), 'installed-exposure-refused-'));
  const fixture = await publishedFixture(home, 'project'), store = new LocalProjectDatabase(fixture.databasePath), service = new ActionService();
  let armed = false;
  let runtime: { reportCrash(installId: string): Promise<unknown> } | undefined;
  try {
    const installed = await ensureInstalledPlugins({ store, projectId: DEMO_PROJECT_ID, homeDirectory: home, actions: { registry: service, client: service, project_id: DEMO_PROJECT_ID,
      inspect: async actor => {
        const snapshot = service.inspect(actor);
        if (armed) { armed = false; void runtime?.reportCrash(fixture.install.install_id); throw new Error('controlled exposure failure'); }
        return snapshot;
      } } });
    runtime = installed.platform.runtime;
    await installed.lifecycle('disable', fixture.release);
    armed = true;
    await assert.rejects(installed.lifecycle('enable', fixture.release, {}), (error: unknown) => error instanceof Error && error.message === 'controlled exposure failure');
    assert.match(installed.recoveryErrors.get(fixture.release.pluginId) ?? '', /controlled exposure failure/);
    // The failed exposure left nothing of its own registered: the cleanup withdrew the plugin before the stop was refused.
    assert.deepEqual(
      service.inspect(caller).filter(view => view.provider.plugin_id === fixture.release.pluginId),
      [],
      'the failed exposure withdraws the actions it had exposed',
    );
    // Leave a stop the Host's own close can do: recover the crashed record, then switch it off again.
    await runtime.recover(fixture.install.install_id); await installed.lifecycle('disable', fixture.release);
  } finally {
    try { await releaseInstalledPlugins(store, DEMO_PROJECT_ID); } catch { /* the case already reported its failure */ }
    try { store.close(); } catch { /* the case already reported its failure */ }
    await rm(home, { recursive: true, force: true });
  }
});

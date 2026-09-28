import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentBuilderStore, type AgentRelease } from '@molis-ai/molis-work-plugin-builder';
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

const mac = { skip: process.platform !== 'darwin', timeout: 30_000 };
const caller = { actor_id: 'owner', audience: 'user' as const, permissions: [], project_id: 'project' };

async function publishedFixture(home: string, name: string) {
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
  const bundlePath = join(home, name + '.mjs');
  await writeFile(bundlePath, `export const operations={save:async(input,sdk)=>{await sdk.storage.set('value',input.value);return input.value},read:async(_,sdk)=>await sdk.storage.get('value')??'empty',schedule:async(at,sdk)=>(await sdk.capability.call('schedules.add',{operation:'save',at,input:{value:'scheduled'},inbox:false})).scheduleId};`);
  const release: AgentRelease = { buildId, pluginId, version: 1, directory: home, bundlePath, packagePath: home,
    design: { id: 'one', catalog: 'actions/1', title: 'Installed fixture', description: 'Fixture', rationale: 'Fixture', journey: [], contract, parts: [], acceptance: [] },
    nodes: [], manifest: buildManifest(contract), permissions: { storage: ['read', 'write'], capabilities: ['schedules.add'] }, publishedAt: new Date().toISOString() };
  builder.release(release); storage.set('plugin-builder:agent-studio:approved:' + pluginId, JSON.stringify(release.permissions));
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(store.db));
  const { install } = runtime.install({ definition: sandboxedPluginDefinition(release, release.permissions, []), deployment: 'local', grants: ['storage:private'] });
  store.close();
  return { databasePath, release, install, draft: waiting, ref: molisWorkHostProjectReference({ databasePath, projectId: 'project', boardId: DEMO_BOARD_ID }) };
}

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
    const installed = await control(); await installed.lifecycle('disable', fixture.release);
    await host.close(); host = new MolisWorkLocalHost({ homeDirectory: home });
    assert.equal((await host.actionClient(fixture.ref).discover(caller)).some(view => view.capability_id.startsWith('generated.')), false);
    const restored = await control(); assert.equal(restored.installations()[0]?.state, 'disabled');
    await restored.lifecycle('enable', fixture.release);
    assert.equal((await host.actionClient(fixture.ref).discover(caller)).filter(view => view.capability_id.startsWith('generated.')).length, 3);
    const action = (operation: string) => ({ capability_id: exposedActionId(fixture.release, operation), version: 1, provider_id: 'plugin:' + fixture.release.pluginId });
    await host.actionClient(fixture.ref).invoke(caller, action('save'), { value: 'kept across reinstall' });
    await restored.lifecycle('uninstall', fixture.release, { keepData: true });
    assert.equal((await host.actionClient(fixture.ref).discover(caller)).some(view => view.capability_id.startsWith('generated.')), false);
    await restored.lifecycle('install', fixture.release, { consent: true });
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

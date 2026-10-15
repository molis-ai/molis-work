import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ActionDefinition, ActionCallContext } from '@molis-ai/molis-work-contracts/platform/actions';
import type { SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { ArtifactsModule, ProcessItemsModule } from '@molis-ai/molis-work-module-artifacts';
import { SqlitePluginPrivateStorage } from '@molis-ai/molis-work-plugin-runtime';
import { UiHost } from '@molis-ai/molis-work-ui-host';
import { createPluginPlatform, MolisWorkLocalHost, molisWorkHostProjectReference, seedDemoBoard, DEMO_PROJECT_ID } from '@molis-ai/molis-work-app-local-host';
import { createSandboxRunner } from '@molis-ai/molis-work-plugin-sandbox';
import { goalPluginActions } from '@molis-ai/molis-work-contracts/modules/goal-actions';
import { LocalProjectDatabase } from '@molis-ai/molis-work-app-local-host';
import { sandboxedPluginDefinition } from '../apps/local-host/dist/plugin-builder/installed.js';
import { exposeInstalledPlugin, exposedActionId } from '../apps/local-host/dist/plugin-builder/exposed-actions.js';
import { capabilityCatalog, catalogCapabilities } from '../apps/local-host/dist/plugin-builder/catalog.js';

const mac = { skip: process.platform !== 'darwin', timeout: 15_000 };
const gate = () => Promise.withResolvers<void>();

for (const mode of ['cancelled', 'revoked', 'withdrawn'] as const) test(`installed plugin ${mode} during nested Action wait cannot write SQLite or external effects; a fresh authorized call recovers`, mac, async t => {
  const home = await mkdtemp(join(tmpdir(), 'installed-execution-'));
  const store = new LocalProjectDatabase(join(home, 'project.sqlite'));
  const service = new ActionService(), actions = { registry: service, client: service, project_id: 'p' };
  const privateStorage = new SqlitePluginPrivateStorage(store.db);
  const platform = createPluginPlatform({ project_id: 'p', actor_id: 'owner', db: store.db, actions, ui: new UiHost(), home: null,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }), processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest) });
  const entered = gate(), releaseGate = gate(), finished = gate(), controller = new AbortController();
  t.signal.addEventListener('abort', () => { controller.abort(); releaseGate.resolve(); }, { once: true });
  let allowed = true, externalEffects = 0, serviceCalls = 0;
  const effect: ActionDefinition = { capability_id: 'fixture.wait', version: 1, operation: 'command', action: {
    title: 'Wait', description: 'An external effect after an asynchronous response', kind: 'operation', scope: 'project', audiences: ['plugin'], permissions: [], subject_kinds: [],
    input_schema: { type: 'string' }, output_schema: { type: 'string' },
  } };
  const withdrawDependency = service.registerProvider({ provider: { provider_id: 'fixture', title: 'Fixture', kind: 'system', project_id: 'p' }, definitions: [effect],
    handlers: [{ ...effect, handle: async (context, input) => {
      serviceCalls++;
      try { entered.resolve(); await releaseGate.promise; await context.beforeEffect(); externalEffects++; return input; }
      finally { finished.resolve(); }
    } }] });
  const effects = { capabilities: ['fixture.wait'], storage: ['read', 'write'] as Array<'read' | 'write'> };
  const contract: SandboxPluginContract = { version: 1, pluginId: 'io.molis.work.generated.control', revision: 'one', entities: [], pages: [], acceptance: [], operations: [
    { id: 'save', kind: 'command', input: { type: 'string' }, output: { type: 'string' }, effects, errors: [], examples: [{ input: 'text', output: 'text' }] },
  ] };
  const bundlePath = join(home, 'plugin.mjs');
  await writeFile(bundlePath, `export const operations={save:async(input,sdk)=>{await sdk.capability.call('fixture.wait',input);await sdk.storage.set('saved',input);return input}};`);
  const release = { buildId: 'control-fixture', pluginId: contract.pluginId, version: 1, bundlePath,
    design: { title: 'Control', contract, parts: [], acceptance: [] }, nodes: [] } as never;
  const catalog = () => capabilityCatalog(actions, 'owner');
  const definition = sandboxedPluginDefinition(release, effects, [], { capability: catalogCapabilities({ actions, catalog, live: () => true }), capabilities: catalog });
  let withdraw = () => {};
  const firstRouteFinished = gate();
  let firstRouteBody: unknown;
  try {
    const report = await platform.start([{ definition, grants: ['storage:private'] }]);
    assert.ok(report.running.includes(contract.pluginId), JSON.stringify(report));
    const installId = platform.runtime.list().find(item => item.plugin_id === contract.pluginId)!.install_id;
    const register = () => exposeInstalledPlugin(actions, release, async (pluginId, operation, input, context) => {
      assert.equal(context.actor_id, 'owner', 'the outer actor survives the route adapter');
      try {
        const response = await platform.router().dispatch({ method: 'POST', pathname: '/api/plugins/' + pluginId + '/call', actor_id: context.actor_id,
          execution: context, body: { operation, input } }) ?? { status: 409 };
        firstRouteBody ??= response.body;
        return response;
      } finally { firstRouteFinished.resolve(); }
    }).dispose;
    withdraw = register();
    const caller: ActionCallContext = { actor_id: 'owner', project_id: 'p', audience: 'user', permissions: [], signal: controller.signal,
      validate_authority: () => { if (!allowed) throw new Error('Authority revoked'); } };
    const action = { capability_id: exposedActionId(release, 'save'), version: 1 };
    assert.ok(service.discover({ ...caller, audience: 'workflow' }).some(view => view.capability_id === action.capability_id));
    const before = privateStorage.snapshotInstallationData(installId);
    const pending = service.invoke(caller, action, 'late');
    const rejected = assert.rejects(pending);
    await Promise.race([entered.promise, pending.then(() => assert.fail('call ended before the service'), error => { throw error; })]);
    if (mode === 'cancelled') controller.abort();
    if (mode === 'revoked') allowed = false;
    if (mode === 'withdrawn') withdraw();
    releaseGate.resolve(); await rejected; await finished.promise;
    await firstRouteFinished.promise;
    if (mode === 'cancelled') assert.equal((firstRouteBody as { outcome?: string }).outcome, 'unknown', 'the HTTP adapter must preserve the sandbox interruption outcome for Schedule');
    assert.equal(externalEffects, 0, 'the nested Action rechecks the original invocation before its external effect');
    assert.deepEqual(privateStorage.snapshotInstallationData(installId), before, 'no late private data commit');
    allowed = true; if (mode === 'withdrawn') withdraw = register();
    assert.equal(await service.invoke({ ...caller, signal: undefined }, action, 'fresh'), 'fresh');
    assert.equal(serviceCalls, 2, 'the failed invocation was not automatically replayed');
    assert.equal(externalEffects, 1);
    const saved = privateStorage.snapshotInstallationData(installId).find(row => row.item_key === 'sandbox:entries');
    assert.deepEqual(saved && JSON.parse(saved.item_value), [['saved', 'fresh']]);
  } finally {
    releaseGate.resolve(); withdraw(); withdrawDependency();
    for (const record of platform.runtime.list()) await platform.runtime.stop(record.install_id);
    store.close(); await rm(home, { recursive: true, force: true });
  }
});

test('W3-07-8-02 a real sandbox and production broker cannot acquire builtin Goal authority for the four protected actions', { skip: process.platform !== 'darwin', timeout: 30_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goal-sandbox-authority-')), databasePath = join(directory, 'project.db');
  seedDemoBoard(databasePath);
  const host = new MolisWorkLocalHost({ homeDirectory: directory, completeText: null }), ref = molisWorkHostProjectReference({ projectId: DEMO_PROJECT_ID, databasePath });
  const goal_id = 'SANDBOX-GOAL', ids = [goalPluginActions.contract, goalPluginActions.state, goalPluginActions.progress, goalPluginActions.receipt].map(item => item.capability_id);
  let runner: Awaited<ReturnType<typeof createSandboxRunner>> | undefined;
  try {
    const initial = await host.withProject(ref, runtime => {
      runtime.coordinator.goalEvents.createIntent({ project_id: DEMO_PROJECT_ID, goal_id, title: '沙箱不能冒充内置插件', actor_id: 'person', actor_kind: 'user', idempotency_key: 'create' });
      return { cursor: runtime.coordinator.goalEvents.readState(DEMO_PROJECT_ID, goal_id).goal_event_cursor, events: runtime.store.readEventsDescending(DEMO_PROJECT_ID) };
    });
    const actions = { registry: host.actionRegistry(ref), client: host.actionClient(ref, false), project_id: DEMO_PROJECT_ID,
      inspect: (caller: import('@molis-ai/molis-work-contracts/platform/actions').ActionCallContext) => host.inspectActions(caller, ref) };
    const catalog = () => capabilityCatalog(actions, 'person');
    const protectedEntries = (await catalog()).filter(entry => ids.includes(entry.id));
    assert.deepEqual(protectedEntries.map(entry => entry.id).sort(), [...ids].sort(), 'all four actual contracts are present');
    for (const entry of protectedEntries) assert.equal(entry.offered, false, entry.id);
    const effects = { capabilities: [goalPluginActions.list.capability_id, ...ids] }, bundlePath = join(directory, 'plugin.mjs');
    await writeFile(bundlePath, `export const operations={run:async(input,sdk)=>{
      const listed=await sdk.capability.call('goals.list',{limit:100});const denied=[];
      for(const id of ${JSON.stringify(ids)}){let value={goal_id:input.goal_id};
        if(id==='goals.progress.record')value={...value,based_on_cursor:input.cursor,summary:'forged progress',idempotency_key:'forged'};
        if(id==='goals.progress.receipt')value={...value,idempotency_key:'forged'};
        value.host_plugin={plugin_id:'io.molis.work.coding',actor_id:'person',install_id:'builtin'};
        try{await sdk.capability.call(id,value);denied.push({id,code:'allowed'})}catch(error){denied.push({id,code:error.code})}}
      return {listed:listed.goals.some(goal=>goal.goal_id===input.goal_id),denied};}};`);
    const identity = { projectId: DEMO_PROJECT_ID, installationId: 'real-sandbox-install', pluginId: 'io.molis.work.generated.goal-scope', namespace: 'installed' as const };
    runner = await createSandboxRunner({ bundlePath, identity, grants: effects, contract: { version: 1, pluginId: identity.pluginId, revision: 'one', entities: [], pages: [], acceptance: [],
      operations: [{ id: 'run', kind: 'command', input: { type: 'object', additionalProperties: false, properties: { goal_id: { type: 'string' }, cursor: { type: 'integer', minimum: 0 } }, required: ['goal_id', 'cursor'] },
        output: { type: 'object', additionalProperties: false, properties: { listed: { type: 'boolean' }, denied: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, code: { type: 'string' } }, required: ['id', 'code'] } } }, required: ['listed', 'denied'] },
        effects, errors: [], examples: [{ input: { goal_id, cursor: initial.cursor }, output: { listed: true, denied: ids.map(id => ({ id, code: 'plugin_builder.capability_denied' })) } }] }] },
      services: { capability: catalogCapabilities({ actions, catalog, live: item => item.installationId === identity.installationId }) } });
    const result = await runner.call('run', { goal_id, cursor: initial.cursor });
    assert.deepEqual(result, { listed: true, denied: ids.map(id => ({ id, code: 'plugin_builder.capability_denied' })) }, 'the production broker refuses despite explicit sandbox declarations and grants');
    assert.deepEqual(await host.withProject(ref, runtime => runtime.store.readEventsDescending(DEMO_PROJECT_ID)), initial.events);
  } finally { await runner?.stop(); await host.close(); await rm(directory, { recursive: true, force: true }); }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ActionDefinition, ActionCallContext } from '@molis-ai/molis-work-contracts/platform/actions';
import type { SandboxEffects, SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { HostPluginCaller } from '@molis-ai/molis-work-contracts/platform/app-host';
import type { PluginDatabaseDeclaration, PluginDefinition } from '@molis-ai/molis-work-contracts/platform/plugin';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { ArtifactsModule, ProcessItemsModule } from '@molis-ai/molis-work-module-artifacts';
import { SqlitePluginPrivateStorage } from '@molis-ai/molis-work-plugin-runtime';
import { UiHost } from '@molis-ai/molis-work-ui-host';
import { createPluginPlatform, MolisWorkLocalHost, molisWorkHostProjectReference, DEMO_PROJECT_ID } from '@molis-ai/molis-work-app-local-host';
import { createSandboxRunner } from '@molis-ai/molis-work-plugin-sandbox';
import { goalPluginActions } from '@molis-ai/molis-work-contracts/modules/goal-actions';
import { LocalProjectDatabase } from '@molis-ai/molis-work-app-local-host';
import { sandboxedPluginDefinition } from '../apps/local-host/dist/plugin-builder/installed.js';
import { exposeInstalledPlugin, exposedActionId } from '../apps/local-host/dist/plugin-builder/exposed-actions.js';
import { capabilityCatalog, catalogCapabilities } from '../apps/local-host/dist/plugin-builder/catalog.js';
import { goalApplicationOf, seedBoard } from "./fixtures/goal-application.js";

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
  const definition = sandboxedPluginDefinition(release, effects, [], { capability: catalogCapabilities({ actions, catalog, live: () => true,
    declaration: () => ({ manifest: definition.manifest }), granted: () => effects.capabilities }), capabilities: catalog });
  let withdraw = () => {};
  const firstRouteFinished = gate();
  let firstRouteBody: unknown;
  try {
    const report = await platform.start([{ definition, grants: ['storage:private'] }]);
    assert.ok(report.running.includes(contract.pluginId), JSON.stringify(report));
    const installed = platform.runtime.list().find(item => item.plugin_id === contract.pluginId)!, installId = installed.install_id;
    const register = () => exposeInstalledPlugin(actions, release, async (pluginId, operation, input, context) => {
      assert.equal(context.actor_id, 'owner', 'the outer actor survives the route adapter');
      try {
        const response = await platform.router().dispatch({ method: 'POST', pathname: '/api/plugins/' + pluginId + '/call', actor_id: context.actor_id,
          execution: context, body: { operation, input } }) ?? { status: 409 };
        firstRouteBody ??= response.body;
        return response;
      } finally { firstRouteFinished.resolve(); }
    }, undefined, { install_id: installId, installation_generation: installed.installation_generation }).dispose;
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

test('W3-07-8-02 PG-006 a real sandbox reaches the Goal actions through the production broker only as itself: an identity in its input is refused, and its progress is its own', { skip: process.platform !== 'darwin', timeout: 30_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goal-sandbox-authority-')), databasePath = join(directory, 'project.db');
  await new MolisWorkLocalHost({ homeDirectory: directory, completeText: null }).close();
  seedBoard(databasePath);
  const host = new MolisWorkLocalHost({ homeDirectory: directory, completeText: null }), ref = molisWorkHostProjectReference({ projectId: DEMO_PROJECT_ID, databasePath });
  const goal_id = 'SANDBOX-GOAL', ids = [goalPluginActions.contract, goalPluginActions.state, goalPluginActions.progress, goalPluginActions.receipt].map(item => item.capability_id);
  let runner: Awaited<ReturnType<typeof createSandboxRunner>> | undefined;
  try {
    const initial = await host.withProject(ref, runtime => {
      goalApplicationOf(runtime).goalEvents.createIntent({ project_id: DEMO_PROJECT_ID, goal_id, title: '沙箱不能冒充内置插件', actor_id: 'person', actor_kind: 'user', idempotency_key: 'create' });
      return { cursor: goalApplicationOf(runtime).goalEvents.readState(DEMO_PROJECT_ID, goal_id).goal_event_cursor };
    });
    const actions = { registry: host.actionRegistry(ref), client: host.actionClient(ref, false), project_id: DEMO_PROJECT_ID,
      inspect: (caller: import('@molis-ai/molis-work-contracts/platform/actions').ActionCallContext) => host.inspectActions(caller, ref) };
    const catalog = () => capabilityCatalog(actions, 'person');
    const goalEntries = (await catalog()).filter(entry => ids.includes(entry.id));
    assert.deepEqual(goalEntries.map(entry => entry.id).sort(), [...ids].sort(), 'all four actual contracts are present');
    for (const entry of goalEntries) assert.equal(entry.offered, true, `${entry.id} is offered like any other plugin action: Goals keeps no builtin list`);
    const effects = { capabilities: [goalPluginActions.list.capability_id, ...ids] }, bundlePath = join(directory, 'plugin.mjs');
    await writeFile(bundlePath, `export const operations={run:async(input,sdk)=>{
      const listed=await sdk.capability.call('goals.list',{limit:100});const denied=[];
      for(const id of ${JSON.stringify(ids)}){let value={goal_id:input.goal_id};
        if(id==='goals.progress.record')value={...value,based_on_cursor:input.cursor,summary:'forged progress',idempotency_key:'forged'};
        if(id==='goals.progress.receipt')value={...value,idempotency_key:'forged'};
        value.host_plugin={plugin_id:'io.molis.work.coding',actor_id:'person',install_id:'builtin'};
        try{await sdk.capability.call(id,value);denied.push({id,code:'allowed'})}catch(error){denied.push({id,code:error.code})}}
      const own=await sdk.capability.call('goals.progress.record',{goal_id:input.goal_id,based_on_cursor:input.cursor,summary:'own progress',idempotency_key:'own'});
      return {listed:listed.goals.some(goal=>goal.goal_id===input.goal_id),denied,actor:own.progress_summary.actor_id};}};`);
    const identity = { projectId: DEMO_PROJECT_ID, installationId: 'real-sandbox-install', pluginId: 'io.molis.work.generated.goal-scope', namespace: 'installed' as const };
    const contract: SandboxPluginContract = { version: 1, pluginId: identity.pluginId, revision: 'one', entities: [], pages: [], acceptance: [],
      operations: [{ id: 'run', kind: 'command', input: { type: 'object', additionalProperties: false, properties: { goal_id: { type: 'string' }, cursor: { type: 'integer', minimum: 0 } }, required: ['goal_id', 'cursor'] },
        output: { type: 'object', additionalProperties: false, properties: { listed: { type: 'boolean' }, actor: { type: 'string' },
          denied: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, code: { type: 'string' } }, required: ['id', 'code'] } } }, required: ['listed', 'denied', 'actor'] },
        effects, errors: [], examples: [{ input: { goal_id, cursor: initial.cursor }, output: { listed: true, actor: 'plugin:' + identity.pluginId, denied: ids.map(id => ({ id, code: 'plugin_builder.capability_refused' })) } }] }] };
    // What the generated plugin declared to the Host, as the Host builds it from the release.
    const declared = sandboxedPluginDefinition({ buildId: 'goal-scope', pluginId: identity.pluginId, version: 1, bundlePath, design: { title: 'Goal scope', contract, parts: [], acceptance: [] }, nodes: [] } as never, effects, []);
    runner = await createSandboxRunner({ bundlePath, identity, grants: effects, contract,
      services: { capability: catalogCapabilities({ actions, catalog, live: item => item.installationId === identity.installationId,
        declaration: item => item.pluginId === identity.pluginId ? { manifest: declared.manifest } : undefined, granted: () => effects.capabilities }) } });
    const result = await runner.call('run', { goal_id, cursor: initial.cursor });
    assert.deepEqual(result, { listed: true, actor: 'plugin:' + identity.pluginId, denied: ids.map(id => ({ id, code: 'plugin_builder.capability_refused' })) },
      'a Host caller named in the input is refused by the contract, and what the plugin records is recorded as the plugin, never as the person or a builtin plugin');
    const after = await host.withProject(ref, runtime => goalApplicationOf(runtime).goalEvents.readState(DEMO_PROJECT_ID, goal_id));
    assert.equal(after.goal_event_cursor, initial.cursor + 1, 'only the plugin\'s own progress was recorded');
  } finally { await runner?.stop(); await host.close(); await rm(directory, { recursive: true, force: true }); }
});

test('PG006-01 PG006-02 PG006-03 PG006-04 PG006-05 S-15 a sandbox reaches a Goal action only when it declared it and the person approved it; a withdrawn approval, another installation or another project is refused, and no refusal writes', { skip: process.platform !== 'darwin', timeout: 30_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goal-sandbox-grants-')), databasePath = join(directory, 'project.db'), otherPath = join(directory, 'other.db');
  await new MolisWorkLocalHost({ homeDirectory: directory, completeText: null }).close();
  seedBoard(databasePath); seedBoard(otherPath, 'other-project');
  const host = new MolisWorkLocalHost({ homeDirectory: directory, completeText: null });
  const ref = molisWorkHostProjectReference({ projectId: DEMO_PROJECT_ID, databasePath }), otherRef = molisWorkHostProjectReference({ projectId: 'other-project', databasePath: otherPath });
  const goal_id = 'GRANTED-GOAL', progress = goalPluginActions.progress;
  const runners: Awaited<ReturnType<typeof createSandboxRunner>>[] = [];
  try {
    for (const [reference, projectId] of [[ref, DEMO_PROJECT_ID], [otherRef, 'other-project']] as const) {
      await host.withProject(reference, runtime => {
        goalApplicationOf(runtime).goalEvents.createIntent({ project_id: projectId, goal_id, title: '按声明与授权放行', actor_id: 'person', actor_kind: 'user', idempotency_key: 'create' });
      });
      // The project's own plugins (Goals among them) start when its actions are first looked at.
      await host.inspectActions({ actor_id: 'person', audience: 'user', project_id: projectId, permissions: [] }, reference);
    }
    const cursors = async () => [await host.withProject(ref, runtime => goalApplicationOf(runtime).goalEvents.readState(DEMO_PROJECT_ID, goal_id).goal_event_cursor),
      await host.withProject(otherRef, runtime => goalApplicationOf(runtime).goalEvents.readState('other-project', goal_id).goal_event_cursor)];
    const actions = { registry: host.actionRegistry(ref), client: host.actionClient(ref, false), project_id: DEMO_PROJECT_ID,
      inspect: (caller: ActionCallContext) => host.inspectActions(caller, ref) };
    // A query offered to plugins that holds its call open, so the caller the Host issued for it can be presented elsewhere while
    // still issued; and an operation declared for agents only, which the board must not offer to plugins.
    const peek: ActionDefinition = { capability_id: 'fixture.goal-callers.peek', version: 1, operation: 'query', action: { title: '读取调用者', description: '记下调用者', kind: 'query',
      scope: 'project', audiences: ['plugin'], permissions: [], subject_kinds: [], input_schema: { type: 'object', additionalProperties: false } } };
    const agentsOnly: ActionDefinition = { capability_id: 'fixture.goal-callers.agents-only', version: 1, operation: 'command', action: { title: '只给 Agent', description: '没有开放给插件', kind: 'operation',
      scope: 'project', audiences: ['agent'], plugin: false, permissions: [], subject_kinds: [], input_schema: { type: 'object', additionalProperties: false } } };
    const seen: HostPluginCaller[] = [], reached = gate(), release = gate();
    let agentsOnlyCalls = 0;
    actions.registry.registerProvider({ provider: { provider_id: 'fixture', title: 'Fixture', kind: 'system', project_id: DEMO_PROJECT_ID }, definitions: [peek, agentsOnly], handlers: [
      { ...peek, async handle(caller) { seen.push(caller.host_plugin!); reached.resolve(); await release.promise; return {}; } },
      { ...agentsOnly, handle() { agentsOnlyCalls++; return {}; } },
    ] });
    const catalog = () => capabilityCatalog(actions, 'person'), board = await catalog();
    const entry = board.find(item => item.id === progress.capability_id)!;
    assert.equal(entry.offered, true, 'the board offers a Goal action as one to ask for');
    assert.deepEqual(entry.permissions, progress.action.permissions, 'with the permissions the action itself declares');
    assert.equal(board.find(item => item.id === agentsOnly.capability_id)?.offered, false, 'an action its provider did not open to plugins is on the board, not offered');
    const call = `async(input,sdk)=>{try{const out=await sdk.capability.call(input.id??${JSON.stringify(progress.capability_id)},input.id?{}:{goal_id:input.goal_id,based_on_cursor:input.cursor,summary:'progress '+input.key,idempotency_key:input.key});return {actor:out.progress_summary?.actor_id??''}}catch(error){return {refused:error.code,message:String(error.message)}}}`;
    const bundlePath = join(directory, 'plugin.mjs');
    await writeFile(bundlePath, `const call=${call};export const operations={record:call,undeclared:call,hidden:call};`);
    const identity = { projectId: DEMO_PROJECT_ID, installationId: 'granted-install', pluginId: 'io.molis.work.generated.goal-grants', namespace: 'installed' as const };
    const operation = (id: string, effects: SandboxEffects) => ({ id, kind: 'command' as const, effects, errors: [],
      input: { type: 'object', additionalProperties: false, properties: { goal_id: { type: 'string' }, cursor: { type: 'integer', minimum: 0 }, key: { type: 'string' }, id: { type: 'string' } }, required: ['goal_id', 'cursor', 'key'] },
      output: { type: 'object', additionalProperties: false, properties: { actor: { type: 'string' }, refused: { type: 'string' }, message: { type: 'string' } }, required: [] },
      examples: [{ input: { goal_id, cursor: 0, key: 'example' }, output: { actor: 'plugin:' + identity.pluginId } }] });
    const declaredEffects = { capabilities: [progress.capability_id] };
    const contract: SandboxPluginContract = { version: 1, pluginId: identity.pluginId, revision: 'one', entities: [], pages: [], acceptance: [],
      operations: [operation('record', declaredEffects), operation('undeclared', {}), operation('hidden', { capabilities: [agentsOnly.capability_id] })] };
    const declared = sandboxedPluginDefinition({ buildId: 'goal-grants', pluginId: identity.pluginId, version: 1, bundlePath, design: { title: 'Goal grants', contract, parts: [], acceptance: [] }, nodes: [] } as never, declaredEffects, []);
    // What the person approved for this installation; the test withdraws and restores it.
    const approved = new Set([progress.capability_id, peek.capability_id, agentsOnly.capability_id]);
    const service = catalogCapabilities({ actions, catalog, live: item => item.installationId === identity.installationId,
      declaration: item => item.pluginId === identity.pluginId && item.installationId === identity.installationId ? { manifest: declared.manifest } : undefined,
      granted: item => item.installationId === identity.installationId ? [...approved] : [] });
    const start = async (grants: SandboxEffects) => { const runner = await createSandboxRunner({ bundlePath, identity, grants, contract, services: { capability: service } }); runners.push(runner); return runner; };
    const approvedRunner = await start({ capabilities: [progress.capability_id, agentsOnly.capability_id] }), unapprovedRunner = await start({});
    const initial = await cursors();
    const input = (key: string) => ({ goal_id, cursor: initial[0]!, key });
    const missing = /没有声明或没有获得/u, sandboxCall = { identity, signal: new AbortController().signal } as never;

    assert.equal((await approvedRunner.call('undeclared', input('undeclared')) as { refused?: string }).refused, 'sandbox.not_authorized', 'PG006-01 an operation that did not declare it is refused by the broker');
    assert.equal((await approvedRunner.call('hidden', { ...input('hidden'), id: agentsOnly.capability_id }) as { refused?: string }).refused, 'plugin_builder.capability_denied',
      'PG006-01 one not open to plugins is refused even when declared and approved');
    assert.equal(agentsOnlyCalls, 0, 'PG006-01 and never reaches its provider');
    assert.equal((await unapprovedRunner.call('record', input('unapproved')) as { refused?: string }).refused, 'sandbox.not_authorized', 'PG006-02 one the person did not approve is refused by the broker');
    approved.delete(progress.capability_id);
    await assert.rejects(service.call(sandboxCall, progress.capability_id, { goal_id, based_on_cursor: initial[0]!, summary: 'behind the broker', idempotency_key: 'behind' }),
      (error: Error & { code?: string }) => error.code === 'plugin_builder.capability_refused' && missing.test(error.message), 'PG006-02 and behind the broker the board refuses it again (plugin_builder.capability_refused), before any caller is issued: the person did not approve this capability');
    approved.add(progress.capability_id);
    assert.deepEqual(await cursors(), initial, 'PG006-01 PG006-02 no refusal wrote');

    assert.deepEqual(await approvedRunner.call('record', input('own')), { actor: 'plugin:' + identity.pluginId }, 'PG006-03 declared and approved, it is recorded as the plugin itself');
    const recorded = await cursors();
    assert.deepEqual(recorded, [initial[0]! + 1, initial[1]], 'PG006-03 one progress event, in its own project only');

    approved.delete(progress.capability_id);
    const revoked = await approvedRunner.call('record', { ...input('after-revoke'), cursor: recorded[0]! }) as { refused?: string; message?: string };
    assert.equal(revoked.refused, 'plugin_builder.capability_refused', 'PG006-04 after the approval is withdrawn the same running plugin is refused');
    assert.match(revoked.message ?? '', missing);
    assert.deepEqual(await cursors(), recorded, 'PG006-04 the refused call wrote nothing');
    approved.add(progress.capability_id);

    const pending = service.call(sandboxCall, peek.capability_id, {});
    try {
      await Promise.race([reached.promise, pending]);
      const current = seen.at(-1)!;
      assert.equal(current.install_id, identity.installationId);
      const as = (change: Partial<ActionCallContext>): ActionCallContext => ({ actor_id: current.actor_id, actor_kind: 'runtime', project_id: current.project_id, audience: 'plugin',
        permissions: [...progress.action.permissions], plugin_install_id: current.install_id, host_plugin: current, ...change });
      const write = { goal_id, based_on_cursor: recorded[0]!, summary: 'presented elsewhere', idempotency_key: 'elsewhere' };
      await assert.rejects(actions.client.invoke(as({ plugin_install_id: 'another-install' }), progress, write), { code: 'host.plugin_caller_mismatch' }, 'PG006-05 the same caller naming another installation is refused');
      await assert.rejects(host.actionClient(otherRef, false).invoke(as({ project_id: 'other-project' }), progress, { ...write, based_on_cursor: recorded[1]! }), { code: 'host.plugin_caller_mismatch' },
        'PG006-05 the same caller in another project is refused');
    } finally { release.resolve(); }
    await pending;
    assert.deepEqual(await cursors(), recorded, 'PG006-05 neither project was written');
  } finally { for (const runner of runners) await runner.stop(); await host.close(); await rm(directory, { recursive: true, force: true }); }
});

for (const mode of ['cancelled', 'revoked'] as const) test(`PLIB-10 S-18 an installed sandboxed plugin that declares databases.project reaches its tables through the broker; ${mode} while it waits, it writes none of them even when it ignores the refusal, and a fresh call does`, mac, async t => {
  const home = await mkdtemp(join(tmpdir(), 'installed-project-database-')), file = join(home, 'project.db');
  seedBoard(file);
  const store = new LocalProjectDatabase(file);
  const service = new ActionService(), actions = { registry: service, client: service, project_id: DEMO_PROJECT_ID };
  const privateStorage = new SqlitePluginPrivateStorage(store.db);
  const platform = createPluginPlatform({ project_id: DEMO_PROJECT_ID, actor_id: 'owner', db: store.db, actions, ui: new UiHost(), home: null,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }), processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest) });
  const entered = gate(), releaseGate = gate(), controller = new AbortController();
  t.signal.addEventListener('abort', () => { controller.abort(); releaseGate.resolve(); }, { once: true });
  let allowed = true;
  const wait: ActionDefinition = { capability_id: 'fixture.wait', version: 1, operation: 'command', action: {
    title: 'Wait', description: 'Holds the call open', kind: 'operation', scope: 'project', audiences: ['plugin'], permissions: [], subject_kinds: [],
    input_schema: { type: 'string' }, output_schema: { type: 'string' },
  } };
  const withdrawDependency = service.registerProvider({ provider: { provider_id: 'fixture', title: 'Fixture', kind: 'system', project_id: DEMO_PROJECT_ID }, definitions: [wait],
    handlers: [{ ...wait, handle: async (_context, input) => { entered.resolve(); await releaseGate.promise; return input; } }] });
  const effects = { capabilities: ['fixture.wait'], projectDatabase: ['read', 'write'] as Array<'read' | 'write'> };
  const contract: SandboxPluginContract = { version: 1, pluginId: 'io.molis.work.generated.tables', revision: 'one', entities: [], pages: [], acceptance: [], operations: [
    { id: 'save', kind: 'command', input: { type: 'string' }, output: { type: 'string' }, effects, errors: [], examples: [{ input: 'text', output: 'text' }] },
  ] };
  const bundlePath = join(home, 'plugin.mjs');
  // A plugin that ignores a refused wait and writes anyway: the write is refused on its own.
  await writeFile(bundlePath, `export const operations={save:async(input,sdk)=>{await sdk.capability.call('fixture.wait',input).catch(()=>null);
    await sdk.projectDatabase.transaction([{sql:'INSERT INTO sbxtables_notes (text) VALUES (?)',parameters:[input]}]);
    return (await sdk.projectDatabase.get('SELECT text FROM sbxtables_notes WHERE text = ?',[input])).text}};`);
  const release = { buildId: 'tables-fixture', pluginId: contract.pluginId, version: 1, bundlePath,
    design: { title: 'Tables', contract, parts: [], acceptance: [] }, nodes: [] } as never;
  const tables: PluginDatabaseDeclaration = { store_name: 'sbxtables', version: 1, read_permission: 'sbxtables:read', write_permission: 'sbxtables:write',
    schema: 'CREATE TABLE sbxtables_notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);' };
  const catalog = () => capabilityCatalog(actions, 'owner');
  const generated = sandboxedPluginDefinition(release, effects, [], { capability: catalogCapabilities({ actions, catalog, live: () => true,
    declaration: () => ({ manifest: definition.manifest }), granted: () => effects.capabilities }), capabilities: catalog });
  // The installed definition as the Host builds it, with the tables a release's Manifest will declare once the creator writes them.
  const definition: PluginDefinition = { ...generated, manifest: { ...generated.manifest, databases: { project: tables },
    permissions: [...generated.manifest.permissions, ...[tables.read_permission, tables.write_permission].map(permission => ({ permission, required: true, reason: '读写自己的表' }))] } };
  const count = () => Number((store.db.prepare('SELECT count(*) AS n FROM sbxtables_notes').get() as { n: number }).n);
  let withdraw = () => {};
  try {
    const report = await platform.start([{ definition, grants: ['storage:private', tables.read_permission, tables.write_permission] }]);
    assert.ok(report.running.includes(contract.pluginId), JSON.stringify(report));
    assert.equal(count(), 0, 'its tables are made when it starts');
    const installed = platform.runtime.list().find(item => item.plugin_id === contract.pluginId)!, installId = installed.install_id;
    withdraw = exposeInstalledPlugin(actions, release, async (pluginId, operation, input, context) => await platform.router().dispatch({ method: 'POST',
      pathname: '/api/plugins/' + pluginId + '/call', actor_id: context.actor_id, execution: context, body: { operation, input } }) ?? { status: 409 }, undefined,
      { install_id: installId, installation_generation: installed.installation_generation }).dispose;
    const caller: ActionCallContext = { actor_id: 'owner', project_id: DEMO_PROJECT_ID, audience: 'user', permissions: [], signal: controller.signal,
      validate_authority: () => { if (!allowed) throw new Error('Authority revoked'); } };
    const action = { capability_id: exposedActionId(release, 'save'), version: 1 };
    const pending = service.invoke(caller, action, 'late');
    const rejected = assert.rejects(pending);
    await Promise.race([entered.promise, pending.then(() => assert.fail('call ended before the wait'), error => { throw error; })]);
    if (mode === 'cancelled') controller.abort(); else allowed = false;
    releaseGate.resolve(); await rejected;
    assert.equal(count(), 0, `${mode}: none of its tables was written`);
    allowed = true;
    assert.equal(await service.invoke({ ...caller, signal: undefined }, action, 'fresh'), 'fresh');
    assert.deepEqual(store.db.prepare('SELECT text FROM sbxtables_notes').all().map(row => ({ ...(row as object) })), [{ text: 'fresh' }]);
  } finally {
    releaseGate.resolve(); withdraw(); withdrawDependency();
    for (const record of platform.runtime.list()) await platform.runtime.stop(record.install_id);
    store.close(); await rm(home, { recursive: true, force: true });
  }
});

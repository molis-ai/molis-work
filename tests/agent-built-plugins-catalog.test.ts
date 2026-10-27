import assert from 'node:assert/strict';
import test from 'node:test';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { MEMORY_PERMISSIONS, MEMORY_PROVIDER_ID, memoryActions } from '@molis-ai/molis-work-contracts/services/memory';
import type { ActionCallContext, ActionDefinition } from '@molis-ai/molis-work-contracts/platform/actions';
import type { HostPluginCaller } from '@molis-ai/molis-work-contracts/platform/app-host';
import { goalPluginActions } from '@molis-ai/molis-work-contracts/modules/goal-actions';
import { REMINDER_ACTIONS, createReminderActionHandlers, SCHEDULE_REMINDER_PROVIDER_ID, SCHEDULE_OPERATION_ACTIONS, SCHEDULE_OPERATION_PROVIDER_ID, createScheduledOperationActionHandlers } from '@molis-ai/molis-work-plugin-schedule';
import { capabilityCatalog, catalogCapabilities, designerCatalog, registerPlatformCapabilities, sampleFromSchema, standIn } from '../apps/local-host/dist/plugin-builder/catalog.js';
import { deferred } from './fixtures/home-runtime.js';
import { openTestHome } from './fixtures/test-home.js';
import { initializeBoard } from "./fixtures/goals-board.js";
import { goalApplicationOf } from "./fixtures/goal-application.js";

const schema = { type: 'object', properties: {}, additionalProperties: false };
/** What a generated plugin declared to the Host; these bare-kernel cases only need it to name the plugin. */
const declared = (identity: { pluginId: string }) => ({ manifest: { plugin_id: identity.pluginId } }) as never;
const goals = (capability_id: string, kind: 'query' | 'operation', output: object = { type: 'object', properties: { recorded: { type: 'boolean' } }, required: ['recorded'] }): ActionDefinition => ({
  capability_id, version: 1, operation: kind === 'query' ? 'query' : 'command',
  action: { title: capability_id, description: capability_id, kind, scope: 'project', audiences: ['user', 'agent', 'mcp'], permissions: ['goals:read'], subject_kinds: [], input_schema: schema, output_schema: output },
});
function project() {
  const service = new ActionService(), actions = { registry: service, client: service, project_id: 'p' };
  const calls: Array<{ id: string; actor: string; audit?: string }> = [];
  const definitions = [goals('goals.list', 'query', { type: 'object', properties: { goals: { type: 'array' } }, required: ['goals'] }), goals('goals.note', 'operation'), goals('goals.trash', 'operation')];
  service.registerProvider({ provider: { provider_id: 'goals', title: '目标', kind: 'plugin', plugin_id: 'goals', project_id: 'p' }, definitions,
    handlers: definitions.map(definition => ({ capability_id: definition.capability_id, version: 1, handle: (context: { actor_id: string; audit_actor_id?: string }) => {
      calls.push({ id: definition.capability_id, actor: context.actor_id, ...(context.audit_actor_id ? { audit: context.audit_actor_id } : {}) });
      return definition.capability_id === 'goals.list' ? { goals: [{ goal_id: 'g1' }] } : { recorded: true };
    } })) });
  const generated: string[] = [];
  const unregister = registerPlatformCapabilities(actions, { generate: async (pluginId, input) => { generated.push(pluginId + ':' + input.input); return { text: '真实回答' }; } });
  service.registerProvider({ provider: { provider_id: SCHEDULE_REMINDER_PROVIDER_ID, title: 'Schedule 提醒', kind: 'system', project_id: 'p' },
    definitions: REMINDER_ACTIONS, handlers: createReminderActionHandlers('p', { pluginId: () => 'io.molis.work.test', add: () => ({ reminderId: 'fixture' }), cancel: () => ({ cancelled: true }) }) });
  service.registerProvider({ provider: { provider_id: SCHEDULE_OPERATION_PROVIDER_ID, title: 'Schedule 定时操作', kind: 'system', project_id: 'p' },
    definitions: SCHEDULE_OPERATION_ACTIONS, handlers: createScheduledOperationActionHandlers('p', { pluginId: () => 'io.molis.work.test', add: () => ({ scheduleId: 'fixture' }), cancel: () => ({ cancelled: true }) }) });
  return { actions, calls, generated, unregister };
}

test('the capability board is the project\'s action directory: platform, installed plugins, and what is not offered with why', async () => {
  const { actions, unregister } = project();
  const catalog = await capabilityCatalog(actions, 'web-user');
  const offered = catalog.filter(entry => entry.offered).map(entry => entry.id).sort();
  assert.deepEqual(offered, ['goals.list', 'goals.note', 'model.generate', 'reminders.add', 'reminders.cancel', 'schedules.add', 'schedules.cancel']);
  const trash = catalog.find(entry => entry.id === 'goals.trash')!;
  assert.equal(trash.offered, false); assert.match(trash.reason!, /不能撤销/);
  assert.deepEqual(catalog.find(entry => entry.id === 'model.generate')!.source, { kind: 'platform', title: '插件平台' });
  assert.deepEqual(catalog.find(entry => entry.id === 'goals.list')!.source, { kind: 'plugin', title: '目标', plugin_id: 'goals' });
  assert.equal(catalog.find(entry => entry.id === 'goals.note')!.effect, 'write');
  assert.match(catalog.find(entry => entry.id === 'goals.note')!.consent, /^写入：/);
  unregister();
  assert.equal((await capabilityCatalog(actions, 'web-user')).some(entry => entry.id === 'model.generate'), false, 'withdrawn with the studio');
  assert.equal((await capabilityCatalog(actions, 'web-user')).find(entry => entry.id === 'reminders.add')?.provider_id, SCHEDULE_REMINDER_PROVIDER_ID, 'Schedule remains available after the Studio withdraws');
  assert.equal((await capabilityCatalog(actions, 'web-user')).find(entry => entry.id === 'schedules.add')?.provider_id, SCHEDULE_OPERATION_PROVIDER_ID, 'scheduled operations belong to Schedule too');
});

// Decision 19 (specs/repository-anti-corruption, W2-03): no plugin uses memory and a generated plugin's call carries no Host-confirmed plugin
// identity, so the real declarations of memory.recall, memory.list and memory.write stay out of what a generated plugin may be granted.
test('memory is closed to generated plugins: the board offers none of it and lists recall, list and write as not offered, with the reason', async () => {
  const { actions } = project();
  const definitions = Object.values(memoryActions) as ActionDefinition[];
  actions.registry.registerProvider({ provider: { provider_id: MEMORY_PROVIDER_ID, title: '记忆', kind: 'system' }, definitions,
    handlers: definitions.map(definition => ({ capability_id: definition.capability_id, version: definition.version, handle: () => ({}) })) });
  const catalog = await capabilityCatalog(actions, 'web-user');
  const memory = catalog.filter(entry => entry.provider_id === MEMORY_PROVIDER_ID);
  assert.deepEqual(memory.map(entry => entry.id).sort(), ['memory.list', 'memory.recall', 'memory.write'], 'only what agents can use appears, and only as closed');
  assert.deepEqual(memory.map(entry => [entry.offered, entry.reason]), memory.map(() => [false, '提供方没有开放给插件']));
  assert.deepEqual(catalog.filter(entry => entry.offered && entry.id.startsWith('memory.')), []);
  // What a plugin may call is the same list: nothing of memory is discoverable to it, whatever permission its install holds.
  const plugin = { actor_id: 'plugin:tables', project_id: 'p', audience: 'plugin' as const, permissions: [...MEMORY_PERMISSIONS] };
  assert.deepEqual((await actions.client.discover(plugin)).filter(view => view.provider.provider_id === MEMORY_PROVIDER_ID), []);
});

test('a composition that hands the studio no metadata inspection still gets the directory the caller can discover, never an empty board', async () => {
  const { actions, unregister } = project();
  // As the workbench page once did: registry and a client that can only discover (no inspect anywhere).
  const client = { discover: (caller: Parameters<typeof actions.client.discover>[0]) => actions.client.discover(caller), invoke: actions.client.invoke.bind(actions.client) };
  const catalog = await capabilityCatalog({ registry: actions.registry, client, project_id: actions.project_id }, 'web-user');
  assert.ok(catalog.some(entry => entry.id === 'model.generate' && entry.offered), JSON.stringify(catalog.map(entry => entry.id)));
  unregister();
});

test('MCP tools show as MCP on the board whether a plugin or 服务连接 registered them', async () => {
  const { actions } = project();
  const tool = (capability_id: string): ActionDefinition => ({ capability_id, version: 1, operation: 'command',
    action: { title: 'echo', description: 'echo', kind: 'operation', scope: 'project', audiences: ['user', 'agent', 'plugin'], permissions: [], subject_kinds: [], input_schema: schema } });
  const handle = (definition: ActionDefinition) => ({ capability_id: definition.capability_id, version: 1, handle: () => ({}) });
  const external = tool('mcp.external.docs.echo'), connection = tool('mcp.connector.c1.echo');
  actions.registry.registerProvider({ provider: { provider_id: 'coding', title: 'Coding', kind: 'plugin', plugin_id: 'coding', project_id: 'p' }, definitions: [external], handlers: [handle(external)] });
  actions.registry.registerProvider({ provider: { provider_id: 'system.connectors#mcp:c1', title: '工作 Notion', kind: 'system' }, definitions: [connection], handlers: [handle(connection)] });
  const catalog = await capabilityCatalog(actions, 'web-user');
  assert.deepEqual(catalog.find(entry => entry.id === 'mcp.external.docs.echo')!.source, { kind: 'mcp', title: 'Coding' });
  assert.deepEqual(catalog.find(entry => entry.id === 'mcp.connector.c1.echo')!.source, { kind: 'mcp', title: '工作 Notion' }, 'not "platform"');
});

test('a plugin calls real actions as itself, only when live; writes stay stand-ins until it is installed; costly calls are bounded', async () => {
  const { actions, calls, generated } = project();
  let live = true;
  const service = catalogCapabilities({ actions, catalog: () => capabilityCatalog(actions, 'web-user'), live: () => live, declaration: declared,
    granted: () => ['goals.list', 'goals.note', 'goals.trash', 'model.generate'], author: () => '进展日志' });
  const context = (namespace: 'preview' | 'installed') => ({ identity: { projectId: 'p', installationId: 'i', pluginId: 'io.molis.work.generated.x', namespace }, signal: new AbortController().signal }) as never;
  assert.deepEqual(await service.call(context('preview'), 'goals.list', {}), { goals: [{ goal_id: 'g1' }] }, 'a trial reads the real directory');
  assert.deepEqual(await service.call(context('preview'), 'goals.note', {}), { recorded: true }, 'a trial write is a stand-in');
  assert.equal(calls.filter(call => call.id === 'goals.note').length, 0);
  await service.call(context('installed'), 'goals.note', {});
  assert.deepEqual(calls.at(-1), { id: 'goals.note', actor: 'plugin:io.molis.work.generated.x', audit: '插件「进展日志」' }, 'the plugin writes as itself, named for people');
  await assert.rejects(service.call(context('installed'), 'goals.trash', {}), /没有开放给插件的能力/);
  assert.deepEqual(await service.call(context('installed'), 'model.generate', { prompt: 'summary', input: '今天' }), { text: '真实回答' });
  assert.deepEqual(generated, ['io.molis.work.generated.x:今天']);
  for (let index = 1; index < 20; index++) await service.call(context('installed'), 'model.generate', { prompt: 'summary', input: '今天' });
  await assert.rejects(service.call(context('installed'), 'model.generate', { prompt: 'summary', input: '今天' }), /次数太多/);
  live = false;
  assert.deepEqual(await service.call(context('installed'), 'goals.list', {}), { goals: [] }, 'checks and acceptance get a valid stand-in');
});

test('a stand-in is a valid value for the capability\'s output', async () => {
  assert.deepEqual(sampleFromSchema({ type: 'object', required: ['id', 'at', 'tags', 'n', 'ok', 'kind'], properties: { id: { type: 'string' }, at: { type: 'string', format: 'date-time' }, tags: { type: 'array' }, n: { type: 'integer', minimum: 1 }, ok: { type: 'boolean' }, kind: { enum: ['a', 'b'] } } }),
    { id: '示例', at: '2026-01-01T00:00:00.000Z', tags: [], n: 1, ok: true, kind: 'a' });
  const entry = { type: 'object', required: ['entry_id', 'title', 'notes'], properties: { entry_id: { type: 'string' }, title: { type: 'string' }, notes: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' } } } } } };
  assert.deepEqual(sampleFromSchema({ type: 'object', properties: { items: { type: 'array', items: entry } } }), { items: [{ entry_id: '示例', title: '示例', notes: [] }] },
    'a list of someone else\'s records has one sample record an acceptance can pick; lists inside it stay empty');
  assert.deepEqual(sampleFromSchema({ type: 'array', items: entry }), [{ entry_id: '示例', title: '示例', notes: [] }]);
  const { actions } = project();
  const model = (await capabilityCatalog(actions, 'web-user')).find(entry => entry.id === 'model.generate')!;
  assert.deepEqual(standIn(model, { prompt: 'x', input: '间隔复习比集中复习记得更久' }), { text: '［模型替身］间隔复习比集中复习记得更久' }, 'the studio keeps its fixed stand-in');
});

test('the designer sees the capabilities that bear on the request in full, the ones in use always, and the rest summarised by source', async () => {
  const { focusCatalog } = await import('@molis-ai/molis-work-plugin-builder');
  const entry = (id: string, title: string, source: string) => ({ id, title, source, description: title, input: { type: 'object' } });
  const catalog = [entry('model.generate', '调用模型', '插件平台'), entry('reminders.add', '到点提醒', '插件平台'), entry('reminders.cancel', '取消提醒', '插件平台'),
    entry('goals.list', '目标目录', 'Goals'), entry('goals.note', '记录目标便笺', 'Goals'),
    ...Array.from({ length: 40 }, (_, index) => entry('alchemist.item' + index, '记录一条炼金素材 ' + index, '炼金术士')), entry('pages.list', '文稿列表', 'Pages')];
  const { capabilities, moreCapabilities } = focusCatalog(catalog, '做一个目标周报：列出这个项目的目标，选一个目标写一句本周进展');
  const ids = capabilities.map(item => item.id);
  assert.ok(ids.includes('goals.list') && ids.includes('goals.note'), 'goals bear on a goal report');
  assert.ok(ids.includes('model.generate') && ids.includes('reminders.add'), 'the studio\'s own capabilities are always there');
  assert.ok(!ids.some(id => id.startsWith('alchemist.')), 'a common word ("记录") does not pull in unrelated sources');
  assert.deepEqual(moreCapabilities.find(item => item.source === '炼金术士')?.count, 40, 'the rest is summarised by source with example ids');
  assert.ok(focusCatalog(catalog, '随便', ['pages.list']).capabilities.some(item => item.id === 'pages.list'), 'what the design already uses is always shown');
});

test('a plugin that is not enabled in the project shows as not installed; its actions stay on the board', async () => {
  const { actions } = project();
  // Like the host: a missing permission is reported first, and only then whether the plugin is enabled here.
  const disabled = { ...actions, inspect: (caller: Parameters<typeof actions.client.inspect>[0]) => actions.client.inspect(caller).map(view => view.provider.provider_id === 'goals' && view.availability.available
    ? { ...view, availability: { available: false as const, code: 'actions.plugin_disabled', reason: '这个项目还没启用' } } : view) };
  const catalog = await capabilityCatalog(disabled, 'web-user');
  assert.deepEqual(catalog.filter(entry => !entry.installed).map(entry => entry.id).sort(), ['goals.list', 'goals.note', 'goals.trash']);
  assert.equal(catalog.find(entry => entry.id === 'goals.list')!.offered, true, 'offered, but asks before use');
  assert.equal(catalog.find(entry => entry.id === 'model.generate')!.installed, true);
});

test('an action that only answers its own installation is on the board but not offered', async () => {
  const { actions } = project();
  const own = goals('sdk.artifacts.install-1.read', 'query');
  actions.registry.registerProvider({ provider: { provider_id: 'sdk.artifacts.install-1', title: 'Text stats · 成果 SDK', kind: 'system', project_id: 'p' },
    definitions: [{ ...own, provider_id: 'sdk.artifacts.install-1', action: { ...own.action, audiences: ['plugin'] } }],
    availability: call => call.plugin_install_id === 'install-1' ? { available: true } : { available: false, code: 'artifacts.plugin_denied', kind: 'forbidden', reason: '成果 SDK 属于其他安装实例或用户' },
    handlers: [{ capability_id: own.capability_id, version: 1, handle: () => ({ recorded: true }) }] });
  const entry = (await capabilityCatalog(actions, 'web-user')).find(item => item.id === 'sdk.artifacts.install-1.read')!;
  assert.equal(entry.offered, false); assert.equal(entry.installed, true); assert.match(entry.reason!, /只对它自己/);
});

test('an installed plugin\'s functions are actions of the directory: people, the Home AI, MCP clients and other plugins can call them; uninstalling withdraws them', async () => {
  const { exposeInstalledPlugin, exposedActionId } = await import('../apps/local-host/dist/plugin-builder/exposed-actions.js');
  const service = new ActionService(), actions = { registry: service, client: service, project_id: 'p' };
  const contract = { version: 1, pluginId: 'io.molis.work.generated.words', revision: 'r', entities: [], pages: [], acceptance: [], operations: [
    { id: 'words.list', kind: 'query', description: '列出生词', input: { type: 'object', properties: {}, additionalProperties: false }, output: { type: 'array', items: { type: 'object' } }, errors: [], effects: { storage: ['read'] }, examples: [] },
    { id: 'words.add', kind: 'command', description: '记一个生词', input: { type: 'object', properties: { word: { type: 'string' } }, required: ['word'], additionalProperties: false }, output: { type: 'object' }, errors: [], effects: { storage: ['read', 'write'] }, examples: [] },
    { id: 'words.remove', kind: 'command', description: '删除一个生词', input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }, output: { type: 'object' }, errors: [], effects: { storage: ['read', 'write'] }, examples: [] },
  ] };
  const release = { buildId: '4603746a-46ed', pluginId: contract.pluginId, version: 2, design: { title: '生词本', contract, parts: [], acceptance: [] } } as never;
  const calls: unknown[] = [];
  const withdraw = exposeInstalledPlugin(actions, release, async (pluginId, operation, input) => { calls.push([pluginId, operation, input]);
    return operation === 'words.add' ? { status: 200, body: { value: { id: 'w1', word: (input as { word: string }).word } } } : { status: 400, body: { error: '插件出错了' } }; });
  const ids = (audience: 'user' | 'agent' | 'mcp' | 'plugin') => service.discover({ actor_id: 'someone', project_id: 'p', audience, permissions: [] }).map(view => view.capability_id).filter(id => id.startsWith('generated.')).sort();
  assert.deepEqual(ids('agent'), ['generated.4603746a.words.add', 'generated.4603746a.words.list', 'generated.4603746a.words.remove']);
  assert.deepEqual(ids('mcp'), ids('agent')); assert.deepEqual(ids('user'), ids('agent'));
  assert.deepEqual(ids('plugin'), ['generated.4603746a.words.add', 'generated.4603746a.words.list'], 'another plugin cannot delete through it');
  const caller = { actor_id: 'home-ai', project_id: 'p', audience: 'agent' as const, permissions: [] };
  assert.deepEqual(await service.invoke(caller, { capability_id: exposedActionId(release, 'words.add'), version: 2 }, { word: 'serendipity' }), { id: 'w1', word: 'serendipity' });
  assert.deepEqual(calls, [['io.molis.work.generated.words', 'words.add', { word: 'serendipity' }]]);
  await assert.rejects(service.invoke(caller, { capability_id: exposedActionId(release, 'words.list'), version: 2 }, {}), /插件出错了/);
  withdraw.dispose();
  assert.deepEqual(ids('agent'), [], 'uninstalled: nothing left in the directory');
});

test('a capability that needs another action is not offered to generated plugins, which can only call it alone', async () => {
  const { actions } = project();
  const meta = (title: string, extra: object = {}) => ({ title, description: title, kind: 'query' as const, scope: 'project' as const, audiences: ['user', 'agent'] as Array<'user' | 'agent'>,
    permissions: [], subject_kinds: [], input_schema: { type: 'object' }, ...extra });
  const directory: ActionDefinition = { capability_id: 'fixture.directory', version: 1, operation: 'query', action: meta('directory') };
  const talk: ActionDefinition = { capability_id: 'fixture.talk', version: 1, operation: 'query',
    action: meta('talk', { required_actions: [{ capability_id: 'fixture.directory', version: 1, provider_id: 'fixture' }] }) };
  actions.registry.registerProvider({ provider: { provider_id: 'fixture', title: 'Fixture', kind: 'system', project_id: 'p' }, definitions: [directory, talk],
    handlers: [{ capability_id: 'fixture.directory', version: 1, handle: () => ({}) }, { capability_id: 'fixture.talk', version: 1, handle: () => ({ said: 'hi' }) }] });
  const catalog = await capabilityCatalog(actions, 'web-user');
  assert.equal(catalog.find(entry => entry.id === 'fixture.directory')!.offered, true);
  const dependent = catalog.find(entry => entry.id === 'fixture.talk')!;
  assert.equal(dependent.offered, false, 'what would be refused when the plugin calls it is not offered');
  assert.match(dependent.reason!, /依赖/);
  const service = catalogCapabilities({ actions, catalog: async () => catalog, live: () => true, declaration: declared, granted: () => ['fixture.directory', 'fixture.talk'] });
  const context = { identity: { projectId: 'p', installationId: 'i', pluginId: 'io.molis.work.generated.x', namespace: 'installed' as const }, signal: new AbortController().signal } as never;
  assert.deepEqual(await service.call(context, 'fixture.directory', {}), {});
  await assert.rejects(service.call(context, 'fixture.talk', {}), /没有开放给插件的能力/, 'the refusal says so up front');
});

test('the designer\'s catalog stays within budget: what is in use and the most relevant keep full schemas, the rest their field names', async () => {
  const { withinBudget } = await import('@molis-ai/molis-work-plugin-builder');
  const huge = (id: string) => ({ id, title: id, description: id, input: { type: 'object', properties: Object.fromEntries(Array.from({ length: 200 }, (_, index) => ['field' + index, { type: 'string', description: 'x'.repeat(40) }])) }, output: { type: 'object' } });
  const entries = [huge('pages.create'), huge('pages.generate'), huge('pages.extract'), huge('goals.list')];
  const trimmed = withinBudget(entries, ['goals.list'], 20_000);
  assert.ok(JSON.stringify(trimmed).length < 45_000);
  assert.deepEqual(trimmed.find(entry => entry.id === 'goals.list'), entries[3], 'what the design uses stays whole');
  assert.equal(trimmed[0], entries[0], 'the most relevant fits');
  assert.deepEqual((trimmed[1]!.input as { fields: string[] }).fields.slice(0, 2), ['field0', 'field1']);
});

test('arbitrarily named providers drive sandbox limits, cost disclosure and rate limits through the same directory', async () => {
  const { capabilityLimits, slowOperations } = await import('../apps/local-host/dist/plugin-builder/capabilities.js');
  const { actions } = project();
  const base = goals('research.summarize', 'query');
  const definition: ActionDefinition = { ...base, version: 2, action: { ...base.action, execution: { timeout_ms: 75_000, cost: 'metered', max_calls_per_minute: 1 } } };
  let calls = 0;
  actions.registry.registerProvider({ provider: { provider_id: 'research', title: 'Research', kind: 'plugin', project_id: 'p' }, definitions: [{ ...base, action: { ...base.action, execution: { timeout_ms: 100, cost: 'none' } } }, definition],
    handlers: [{ ...base, handle: () => { throw new Error('old version must not execute'); } }, { ...definition, handle: () => { calls++; return { recorded: true }; } }] });
  const catalog = await capabilityCatalog(actions, 'user');
  assert.equal(catalog.find(item => item.id === 'research.summarize' && item.version === 2)!.execution.cost, 'metered');
  assert.equal(catalog.find(item => item.id === 'goals.list')!.execution.cost, 'unknown');
  const effects = { capabilities: ['research.summarize'] };
  assert.deepEqual(capabilityLimits(effects, catalog), { serviceTimeoutMs: 80_000, operationTimeoutMs: 105_000 });
  assert.deepEqual([...slowOperations({ operations: [{ id: 'summarize', effects }, { id: 'list', effects: {} }] }, catalog)], ['summarize']);
  const service = catalogCapabilities({ actions, catalog: async () => catalog, live: () => true, declaration: declared, granted: () => effects.capabilities });
  const context = { identity: { projectId: 'p', installationId: 'i', pluginId: 'plugin', namespace: 'installed' as const }, signal: new AbortController().signal, operationId: 'summarize' };
  await service.call(context, 'research.summarize', {});
  // Recreating an adapter cannot reset the provider's budget.
  const second = catalogCapabilities({ actions, catalog: async () => catalog, live: () => true, declaration: declared, granted: () => effects.capabilities });
  await assert.rejects(second.call(context, 'research.summarize', {}), /次数太多/);
  assert.equal(calls, 1);
});

/**
 * A project of a real Host, its directory as the studio's catalog reads it, and a sandboxed plugin's capability service over it.
 * `approve` is what the person approved for the probe plugin; the returned `approved` is read at each call, so a test can withdraw it.
 */
async function hostProject(t: import('node:test').TestContext, approve?: readonly string[]) {
  const home = await openTestHome(t, { catalogPolicy: false });
  const project = await home.createProject('Sandbox callers');
  await home.host.withProject(project.reference, () => undefined);
  const actions = { registry: home.host.actionRegistry(project.reference), client: home.host.actionClient(project.reference), project_id: project.project_id,
    inspect: (caller: ActionCallContext) => home.host.inspectActions(caller, project.reference) };
  const plugins = new Set(['io.molis.work.generated.probe']);
  // What the person approved for the probe plugin: unless the test says otherwise, the probe and the Goal actions it calls.
  const approved = new Set(approve ?? ['callers.sandbox.peek', ...Object.values(goalPluginActions).map(definition => definition.capability_id)]);
  const service = catalogCapabilities({ actions, catalog: () => capabilityCatalog(actions, 'web-user'), live: () => true,
    declaration: identity => plugins.has(identity.pluginId) ? declared(identity) : undefined, granted: identity => plugins.has(identity.pluginId) ? [...approved] : [] });
  const context = (change: { projectId?: string; pluginId?: string } = {}) => ({ identity: { projectId: project.project_id, installationId: 'sandbox-install',
    pluginId: 'io.molis.work.generated.probe', namespace: 'installed' as const, ...change }, signal: new AbortController().signal }) as never;
  return { actions, service, context, project, approved, host: home.host };
}

/**
 * A query offered to plugins that records the caller the Host issued for each call; `holdNext()` keeps the next call open until released.
 * It is concurrent, so a call held open does not hold the project's line: a write presented to the gateway meanwhile waits its turn
 * behind nothing and gets the gateway's own answer, instead of waiting for the held call that waits for it.
 */
function heldPeek(actions: Awaited<ReturnType<typeof hostProject>>['actions']) {
  const peek: ActionDefinition = { capability_id: 'callers.sandbox.peek', version: 1, operation: 'query', action: { title: '读取探针', description: '记下调用者', kind: 'query',
    scope: 'project', scheduling: 'concurrent', audiences: ['plugin'], permissions: ['callers:read'], subject_kinds: [], input_schema: schema } };
  const seen: HostPluginCaller[] = [];
  let hold: { reached(): void; release: Promise<void> } | undefined;
  actions.registry.registerProvider({ provider: { provider_id: 'platform', title: 'Molis Work', kind: 'system' }, definitions: [peek], handlers: [{ ...peek, async handle(caller) {
    seen.push(caller.host_plugin!);
    const held = hold;
    hold = undefined;
    if (held) { held.reached(); await held.release; }
    return { seen: seen.length };
  } }] });
  const holdNext = () => { const reached = deferred(), release = deferred(); hold = { reached: reached.resolve, release: release.promise }; return { reached: reached.promise, release: release.resolve }; };
  return { peek, seen, holdNext };
}

test('PG110-09 S-15 a sandbox call runs under a caller the Host issues for that call: its project, its declaration, its installation and person, and only while it runs', async t => {
  const { actions, service, context, project } = await hostProject(t);
  const peek: ActionDefinition = { capability_id: 'callers.sandbox.peek', version: 1, operation: 'query', action: { title: '读取探针', description: '记下调用者', kind: 'query',
    scope: 'project', audiences: ['plugin'], permissions: ['callers:read'], subject_kinds: [], input_schema: schema } };
  const seen: HostPluginCaller[] = [];
  let hold: { reached(): void; release: Promise<void> } | undefined;
  actions.registry.registerProvider({ provider: { provider_id: 'platform', title: 'Molis Work', kind: 'system' }, definitions: [peek], handlers: [{ ...peek, async handle(caller) {
    seen.push(caller.host_plugin!);
    if (hold) { hold.reached(); await hold.release; }
    return { seen: seen.length };
  } }] });
  assert.deepEqual(await service.call(context(), peek.capability_id, {}), { seen: 1 });
  const retained = seen[0]!;
  assert.deepEqual([retained.plugin_id, retained.install_id, retained.project_id, retained.actor_id],
    ['io.molis.work.generated.probe', 'sandbox-install', project.project_id, 'plugin:io.molis.work.generated.probe']);
  await assert.rejects(service.call(context({ projectId: 'another-project' }), peek.capability_id, {}), { code: 'plugin_builder.capability_denied' }, 'an identity of another project');
  await assert.rejects(service.call(context({ pluginId: 'io.molis.work.generated.undeclared' }), peek.capability_id, {}), { code: 'plugin_builder.capability_denied' }, 'a plugin that declared nothing');
  assert.equal(seen.length, 1, 'neither refused call reached the provider');
  const as = (caller: HostPluginCaller, change: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: caller.actor_id, actor_kind: 'runtime', project_id: caller.project_id,
    audience: 'plugin', permissions: ['callers:read'], plugin_install_id: caller.install_id, host_plugin: caller, ...change });
  await assert.rejects(actions.client.invoke(as(retained), peek, {}), { code: 'host.plugin_caller_invalid' }, 'a caller kept after its call ended');
  const reached = deferred(), release = deferred();
  hold = { reached: reached.resolve, release: release.promise };
  const pending = service.call(context(), peek.capability_id, {});
  try {
    await Promise.race([reached.promise, pending]);
    hold = undefined;
    const current = seen.at(-1)!;
    await assert.rejects(actions.client.invoke(as(current, { plugin_install_id: 'another-install' }), peek, {}), { code: 'host.plugin_caller_mismatch' }, 'another installation');
    await assert.rejects(actions.client.invoke(as(current, { actor_id: 'plugin:io.molis.work.generated.other' }), peek, {}), { code: 'host.plugin_caller_mismatch' }, 'another person');
  } finally { release.resolve(); }
  assert.deepEqual(await pending, { seen: 2 });
  assert.equal(seen.length, 2, 'only the two sandbox calls reached the provider');
});

test('PG110-10 PG-006 Goals keeps no builtin list: the board offers its plugin actions to generated plugins, and their calls reach Goals through the gateway', async t => {
  const { service, context, actions } = await hostProject(t);
  const catalog = await capabilityCatalog(actions, 'web-user');
  for (const definition of Object.values(goalPluginActions)) {
    const entry = catalog.find(item => item.id === definition.capability_id);
    assert.equal(entry?.offered, true, `${definition.capability_id} is offered like any other plugin action`);
  }
  const listed = await service.call(context(), goalPluginActions.list.capability_id, {}) as { goals: unknown[] };
  assert.deepEqual(listed.goals, []);
  await assert.rejects(service.call(context(), goalPluginActions.state.capability_id, { goal_id: 'missing-goal' }),
    (error: Error & { code?: string }) => error.code === 'plugin_builder.capability_refused' && !/宿主发出|不一致|没有声明或没有获得/u.test(error.message),
    'a read of a goal that is not there is Goals\' own answer, not a refusal of the caller');
});

test('PG006-02 PG006-04 S-15 behind the board, the gateway itself refuses a Goal write the sandbox caller was not approved for, before the approval and after it is withdrawn, and neither writes', async t => {
  // The macOS case (installed-plugin-execution, PG006-02 and PG006-04) goes through the real sandbox, whose broker and board refuse first;
  // here the caller the Host issued for a held sandbox call is presented to the gateway as it is, so the gateway's own refusal is what is asserted.
  const progress = goalPluginActions.progress;
  const { actions, service, context, project, approved, host } = await hostProject(t, ['callers.sandbox.peek']);
  const { peek, seen, holdNext } = heldPeek(actions);
  const goal_id = 'GATEWAY-GOAL';
  await initializeBoard(host, project.reference);
  await host.withProject(project.reference, runtime => {
    goalApplicationOf(runtime).goalEvents.createIntent({ project_id: project.project_id, goal_id, title: '网关自己再核一次', actor_id: 'person', actor_kind: 'user', idempotency_key: 'create' });
  });
  const cursor = () => host.withProject(project.reference, runtime => goalApplicationOf(runtime).goalEvents.readState(project.project_id, goal_id).goal_event_cursor);
  const write = (key: string, based_on_cursor: number) => ({ goal_id, based_on_cursor, summary: 'progress ' + key, idempotency_key: key });
  const missing = (error: Error & { code?: string }) => error.code === 'plugin_builder.capability_refused' && /没有声明或没有获得/u.test(error.message);
  /** The Goal write presented to the gateway with the caller the Host issued for a sandbox call held open, claiming the write's permissions. */
  const presented = async (key: string, based: number) => {
    const held = holdNext(), pending = service.call(context(), peek.capability_id, {});
    try {
      await Promise.race([held.reached, pending]);
      const current = seen.at(-1)!;
      return await actions.client.invoke({ actor_id: current.actor_id, actor_kind: 'runtime', project_id: current.project_id, audience: 'plugin',
        permissions: [...progress.action.permissions], plugin_install_id: current.install_id, host_plugin: current }, progress, write(key, based)).then(() => 'written', (error: unknown) => error);
    } finally { held.release(); await pending; }
  };
  const initial = await cursor();
  assert.equal((await presented('unapproved', initial) as { code?: string }).code, 'actions.plugin_permission',
    'PG006-02 not approved: the caller the Host issued does not hold the permission, so the gateway refuses the write');
  await assert.rejects(service.call(context(), progress.capability_id, write('unapproved-board', initial)), missing, 'PG006-02 and the board refuses it before the gateway');
  assert.equal(await cursor(), initial, 'PG006-02 no refusal wrote');

  approved.add(progress.capability_id);
  await service.call(context(), progress.capability_id, write('approved', initial));
  const recorded = await cursor();
  assert.equal(recorded, initial + 1, 'approved, the same write is recorded');

  approved.delete(progress.capability_id);
  assert.equal((await presented('withdrawn', recorded) as { code?: string }).code, 'actions.plugin_permission',
    'PG006-04 withdrawn: a caller the Host issues after it no longer holds the permission, so the gateway refuses the write');
  await assert.rejects(service.call(context(), progress.capability_id, write('withdrawn-board', recorded)), missing, 'PG006-04 and the board refuses it before the gateway');
  assert.equal(await cursor(), recorded, 'PG006-04 no refusal wrote');
});

test('PG110-14 S-15 the board passes a sandbox call only for the capability the person approved, not for another that needs the same permission', async t => {
  const { service, context } = await hostProject(t, [goalPluginActions.list.capability_id]);
  const listed = await service.call(context(), goalPluginActions.list.capability_id, {}) as { goals: unknown[] };
  assert.deepEqual(listed.goals, [], 'the approved capability is called');
  for (const definition of [goalPluginActions.contract, goalPluginActions.state]) {
    assert.deepEqual(definition.action.permissions, goalPluginActions.list.action.permissions, `${definition.capability_id} needs what goals.list needs`);
    // Goals' own answer for a goal that is not there says nothing of approval (PG110-10): this refusal is the board's.
    await assert.rejects(service.call(context(), definition.capability_id, { goal_id: 'missing-goal' }),
      (error: Error & { code?: string }) => error.code === 'plugin_builder.capability_refused' && /没有声明或没有获得这项能力的授权/u.test(error.message),
      `${definition.capability_id} was not approved itself, so the caller holding goals:read for goals.list does not carry it`);
  }
});

test('PG110-15 D18 an action not offered to plugins is on the board as not offered, with why; the design AI never sees it; a sandbox call to it is refused before its provider', async t => {
  const { actions, service, context, approved } = await hostProject(t);
  const agentsOnly: ActionDefinition = { capability_id: 'fixture.agents-only.read', version: 1, operation: 'query', action: { title: '只给 Agent 读', description: '没有开放给插件',
    kind: 'query', scope: 'project', audiences: ['user', 'agent'], plugin: false, permissions: [], subject_kinds: [], input_schema: schema } };
  let calls = 0;
  actions.registry.registerProvider({ provider: { provider_id: 'fixture', title: 'Fixture', kind: 'system', project_id: actions.project_id }, definitions: [agentsOnly],
    handlers: [{ ...agentsOnly, handle: () => { calls++; return {}; } }] });
  const board = await capabilityCatalog(actions, 'web-user');
  const entry = board.find(item => item.id === agentsOnly.capability_id);
  assert.deepEqual([entry?.offered, entry?.reason], [false, '提供方没有开放给插件'], '1. it is on the board, not offered, with the reason it cannot be asked for');
  const designer = designerCatalog(board).map(item => item.id);
  assert.ok(designer.includes(goalPluginActions.list.capability_id), 'the design AI sees what the board offers');
  assert.equal(designer.includes(agentsOnly.capability_id), false, '2. and not what it does not offer');
  approved.add(agentsOnly.capability_id);
  await assert.rejects(service.call(context(), agentsOnly.capability_id, {}), { code: 'plugin_builder.capability_denied' }, '3. a sandbox call to it is refused, even approved');
  assert.equal(calls, 0, 'and never reaches its provider');
});

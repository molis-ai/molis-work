import assert from 'node:assert/strict';
import test from 'node:test';
import { ActionService } from '@molis-ai/molis-work-kernel';
import type { ActionDefinition } from '@molis-ai/molis-work-contracts/platform/actions';
import { capabilityCatalog, catalogCapabilities, registerPlatformCapabilities, sampleFromSchema, standIn } from '../apps/local-host/src/plugin-builder/catalog.js';

const schema = { type: 'object', properties: {}, additionalProperties: false };
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
  const service = catalogCapabilities({ actions, catalog: () => capabilityCatalog(actions, 'web-user'), live: () => live, author: () => '进展日志' });
  const context = (namespace: 'preview' | 'installed') => ({ identity: { projectId: 'p', installationId: 'i', pluginId: 'io.molis.work.generated.x', namespace }, signal: new AbortController().signal }) as never;
  assert.deepEqual(await service.call(context('preview'), 'goals.list', {}), { goals: [{ goal_id: 'g1' }] }, 'a trial reads the real directory');
  assert.deepEqual(await service.call(context('preview'), 'goals.note', {}), { recorded: true }, 'a trial write is a stand-in');
  assert.equal(calls.filter(call => call.id === 'goals.note').length, 0);
  await service.call(context('installed'), 'goals.note', {});
  assert.deepEqual(calls.at(-1), { id: 'goals.note', actor: 'plugin:io.molis.work.generated.x', audit: '插件「进展日志」' }, 'the plugin writes as itself, named for people');
  await assert.rejects(service.call(context('installed'), 'goals.trash', {}), /没有开放给插件的能力/);
  assert.deepEqual(await service.call(context('installed'), 'model.generate', { instructions: '总结', input: '今天' }), { text: '真实回答' });
  assert.deepEqual(generated, ['io.molis.work.generated.x:今天']);
  for (let index = 1; index < 20; index++) await service.call(context('installed'), 'model.generate', { instructions: '总结', input: '今天' });
  await assert.rejects(service.call(context('installed'), 'model.generate', { instructions: '总结', input: '今天' }), /次数太多/);
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
  assert.deepEqual(standIn(model, { instructions: 'x', input: '间隔复习比集中复习记得更久' }), { text: '［模型替身］间隔复习比集中复习记得更久' }, 'the studio keeps its fixed stand-in');
});

test('the designer sees the capabilities that bear on the request in full, the ones in use always, and the rest summarised by source', async () => {
  const { focusCatalog } = await import('../plugins/native/plugin-builder/src/agent-catalog.js');
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
    availability: call => call.plugin_install_id === 'install-1' ? { available: true } : { available: false, code: 'plugin_artifact_denied', reason: '成果 SDK 属于其他安装实例或用户' },
    handlers: [{ capability_id: own.capability_id, version: 1, handle: () => ({ recorded: true }) }] });
  const entry = (await capabilityCatalog(actions, 'web-user')).find(item => item.id === 'sdk.artifacts.install-1.read')!;
  assert.equal(entry.offered, false); assert.equal(entry.installed, true); assert.match(entry.reason!, /只对它自己/);
});

test('an installed plugin\'s functions are actions of the directory: people, the Home AI, MCP clients and other plugins can call them; uninstalling withdraws them', async () => {
  const { exposeInstalledPlugin, exposedActionId } = await import('../apps/local-host/src/plugin-builder/exposed-actions.js');
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
  withdraw();
  assert.deepEqual(ids('agent'), [], 'uninstalled: nothing left in the directory');
});

test('the designer\'s catalog stays within budget: what is in use and the most relevant keep full schemas, the rest their field names', async () => {
  const { withinBudget } = await import('../plugins/native/plugin-builder/src/agent-catalog.js');
  const huge = (id: string) => ({ id, title: id, description: id, input: { type: 'object', properties: Object.fromEntries(Array.from({ length: 200 }, (_, index) => ['field' + index, { type: 'string', description: 'x'.repeat(40) }])) }, output: { type: 'object' } });
  const entries = [huge('pages.create'), huge('pages.generate'), huge('pages.extract'), huge('goals.list')];
  const trimmed = withinBudget(entries, ['goals.list'], 20_000);
  assert.ok(JSON.stringify(trimmed).length < 45_000);
  assert.deepEqual(trimmed.find(entry => entry.id === 'goals.list'), entries[3], 'what the design uses stays whole');
  assert.equal(trimmed[0], entries[0], 'the most relevant fits');
  assert.deepEqual((trimmed[1]!.input as { fields: string[] }).fields.slice(0, 2), ['field0', 'field1']);
});

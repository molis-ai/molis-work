import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import type { ActionDefinition } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PluginRegistration } from '@molis-ai/molis-work-contracts/platform/plugin-registration';
import { BUILTIN_PLUGIN_CATALOG, createWorkbenchUiHost, pluginSurfaceClients, pluginWorkbenchClientAsset, pluginWorkbenchPacks, WORKBENCH_UI_SLOTS } from '@molis-ai/molis-work-app-workbench';
import { pluginWorkbenchClientBootstrap, pluginWorkbenchStyles, pluginWorkbenchSettingsStyles, pluginSearchRows } from '../apps/workbench/dist/plugin-workbench.js';

const action: ActionDefinition = { capability_id: 'fixture.future.read', version: 1, operation: 'query',
  action: { title: 'Read', description: 'Read a fixture value', kind: 'query', scope: 'project', audiences: ['mcp'], permissions: ['fixture:read'], subject_kinds: [],
    input_schema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false },
    output_schema: { type: 'string' } } };
function futurePlugin(): PluginRegistration {
  const id = 'io.molis.work.future', contribution = id + '.panel';
  return { project_plugin_id: 'future', catalog_order: 1, summary: 'Future plugin',
    manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version: '1.0.0', name: 'Future', kind: 'native',
      publisher: { publisher_id: 'fixture', signature: 'fixture' }, entrypoints: [{ deployment: 'local', entrypoint: './index.js' }],
      permissions: [{ permission: 'fixture:read', required: false, reason: 'read fixture' }], actions: [action],
      capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
      ui: { contributions: [contribution], views: [{ view_id: 'panel', slot: 'stage', title: 'Future', contribution_id: contribution }] } },
    workbench: { order: 0, contributions: [{ descriptor: { contribution_id: contribution, plugin_id: id, kind: 'primary-page', label: 'Future', slots: [],
      surfaces: [{ surface_id: 'panel', target_slot_id: 'workbench.main', format: 'declarative-html' }] },
      render: ({ model }) => `<article>${(model as { title: string }).title}</article>` }],
      stylesheet: '.future{color:red}', clientFactory: "api => api.mountPluginClient('future', api.projectId())",
      settingsClient: "mountPluginClient('future.settings', state.project.project_id);", searchRow: { selector: '[data-future-id]', idDataset: 'futureId' } },
  };
}

test('one unknown bundled entry supplies actual UI mounting, ordered assets, client initialization and search bindings', () => {
  const entry = futurePlugin(), second: PluginRegistration = { ...entry, project_plugin_id: 'other', catalog_order: 2, manifest: { ...entry.manifest, plugin_id: 'io.molis.work.other' },
    workbench: { order: 20, contributions: [], stylesheet: '.other{color:blue}' } };
  const packs = pluginWorkbenchPacks([second, entry]);
  const host = createWorkbenchUiHost(packs);
  assert.equal(host.mount({ slot: WORKBENCH_UI_SLOTS.main, contribution: { contribution_id: 'io.molis.work.future.panel', surface: 'panel', model: { title: 'Mounted from one entry' } } }).html,
    '<article>Mounted from one entry</article>');
  assert.equal(pluginWorkbenchStyles(packs), '.future{color:red}.other{color:blue}');
  assert.equal(pluginWorkbenchSettingsStyles(packs), '.future{color:red}');
  assert.deepEqual(pluginSearchRows(packs), [['future', '[data-future-id]', 'futureId']]);
  const mounted: unknown[] = [];
  runInNewContext(pluginWorkbenchClientBootstrap(packs), { mountPluginClient: (...args: unknown[]) => mounted.push(args),
    L: (text: string) => text, state: { project: { project_id: 'project-1' } }, api: () => {}, route: () => {} });
  assert.deepEqual(mounted.map(args => [...args as unknown[]]), [['future', 'project-1'], ['future.settings', 'project-1']]);
});

test('composition preserves Native UI identities', () => {
  // Native UI is composed statically, not redeemed as a Runtime contribution; its old public identities stay stable.
  const ui = createWorkbenchUiHost().list();
  assert.equal(ui.find(entry => entry.contribution_id === 'io.molis.work.native.goals.proposal')?.plugin_id, 'io.molis.work.native.goals');
  // SC-3 (PG-082): the Goal terminal pane is the workbench's own surface (apps/workbench/src/terminal/pane.ts), no longer a Work contribution.
  assert.equal(ui.find(entry => entry.contribution_id === 'io.molis.work.native.work.terminal.v1'), undefined);
});

test('W4-03-05 the Coding companions borrow Coding\'s client: one bundle is served, none of them ships a copy', () => {
  const clients = new Map(pluginSurfaceClients().map(client => [client.id, client]));
  const coding = pluginWorkbenchClientAsset('coding');
  assert.ok(coding && clients.get('coding')?.bundle === 'coding');
  for (const id of ['files', 'git', 'diff', 'text-stats']) {
    assert.equal(clients.get(id)?.bundle, 'coding', `${id} mounts with Coding's client`);
    assert.equal(clients.get(id)?.factory, clients.get('coding')?.factory, id);
    assert.equal(pluginWorkbenchClientAsset(id), null, `the Host serves no ${id}.js`);
  }
  // Every other client is its own bundle.
  for (const client of clients.values()) if (!['files', 'git', 'diff', 'text-stats'].includes(client.id)) assert.equal(client.bundle, client.id, client.id);
});

test('W5-02-REG-08 a client gets the clients its registration names in clientUses, and the plugins it uses ship no bundle of their own', () => {
  const entry = futurePlugin(), at = (id: string, order: number, workbench: Omit<PluginRegistration['workbench'], 'order' | 'contributions'>): PluginRegistration =>
    ({ ...entry, project_plugin_id: id, catalog_order: order, manifest: { ...entry.manifest, plugin_id: 'io.molis.work.' + id }, workbench: { order, contributions: [], ...workbench } });
  const user = at('user', 1, { clientFactory: 'host => host.clients.lent(host)(host.reviews)', clientUses: ['lent'] });
  const lent = at('lent', 2, { clientFactory: 'host => reviews => host.root + ":" + typeof reviews', clientFrom: 'user' });
  const packs = pluginWorkbenchPacks([lent, user]);
  assert.equal(packs.find(pack => pack.project_plugin_id === 'lent')?.clientFactory, undefined, 'the used plugin ships no bundle');
  assert.equal(runInNewContext(`(${packs.find(pack => pack.project_plugin_id === 'user')?.clientFactory})({ root: 'r', reviews: () => 'Host-owned review' })`), 'r:function', 'its client and the Host\'s supplied review interface reach the user');
  assert.throws(() => pluginWorkbenchPacks([{ ...user, workbench: { ...user.workbench, clientUses: undefined } }, lent]), /lent has a client and borrows the bundle of user, which does not name it in clientUses/);
  assert.throws(() => pluginWorkbenchPacks([user, { ...lent, workbench: { ...lent.workbench, clientFrom: undefined } }]), /user uses the client of lent, which does not name it in clientFrom/);
  // The build: Coding's bundle carries Git's and Files' clients; the workbench has no Coding-specific script.
  assert.deepEqual(BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === 'coding')?.workbench.clientUses, ['git', 'files']);
  for (const id of ['git', 'files']) assert.equal(pluginWorkbenchPacks().find(pack => pack.project_plugin_id === id)?.clientFactory, undefined, id);
  assert.match(pluginWorkbenchClientAsset('coding') ?? '', /clients: \{ "git": \(.+\), "files": \(.+\) \}/s);
});

test('a registration that sets clientServed is sent without its whole-line comments and indentation; one that does not, as written', () => {
  const entry = futurePlugin(), script = "api => {\n  // mounts the panel\n  api.mountPluginClient('future', api.projectId());\n}";
  const [served] = pluginWorkbenchPacks([{ ...entry, workbench: { ...entry.workbench, clientFactory: script, clientServed: true } }]);
  assert.equal(served?.clientFactory, "api => {\napi.mountPluginClient('future', api.projectId());\n}");
  assert.equal(Object.hasOwn(served!, 'clientServed'), false, 'the flag is the shell\'s, not part of the pack');
  const [written] = pluginWorkbenchPacks([{ ...entry, workbench: { ...entry.workbench, clientFactory: script } }]);
  assert.equal(written?.clientFactory, script);
});

test('W5-02 every registration has its own catalog_order, rising in catalog order', () => {
  const orders = BUILTIN_PLUGIN_CATALOG.map(entry => entry.catalog_order);
  assert.equal(new Set(orders).size, orders.length, 'no two registrations share a place');
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b), 'the derived lists keep the catalog\'s order');
});

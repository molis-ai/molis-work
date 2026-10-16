import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import type { ActionDefinition } from '@molis-ai/molis-work-contracts/platform/actions';
import { createWorkbenchUiHost, pluginSurfaceClients, pluginWorkbenchClientAsset, pluginWorkbenchPacks, WORKBENCH_UI_SLOTS, type BuiltinPluginEntry } from '@molis-ai/molis-work-app-workbench';
import { pluginWorkbenchClientBootstrap, pluginWorkbenchStyles, pluginWorkbenchSettingsStyles, pluginSearchRows } from '../apps/workbench/dist/plugin-workbench.js';

const action: ActionDefinition = { capability_id: 'fixture.future.read', version: 1, operation: 'query',
  action: { title: 'Read', description: 'Read a fixture value', kind: 'query', scope: 'project', audiences: ['mcp'], permissions: ['fixture:read'], subject_kinds: [],
    input_schema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false },
    output_schema: { type: 'string' } } };
function futurePlugin(): BuiltinPluginEntry {
  const id = 'io.molis.work.future', contribution = id + '.panel';
  return { project_plugin_id: 'future', summary: 'Future plugin',
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
  const entry = futurePlugin(), second: BuiltinPluginEntry = { ...entry, project_plugin_id: 'other', manifest: { ...entry.manifest, plugin_id: 'io.molis.work.other' },
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
  assert.equal(ui.find(entry => entry.contribution_id === 'io.molis.work.native.work.terminal.v1')?.plugin_id, 'io.molis.work.native.work');
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

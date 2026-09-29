import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { bindActionClient, type ActionDefinition } from '@molis-ai/molis-work-contracts/platform/actions';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { createWorkbenchUiHost, pluginWorkbenchPacks, WORKBENCH_UI_SLOTS, type BuiltinPluginEntry } from '@molis-ai/molis-work-app-workbench';
import { pluginWorkbenchClientBootstrap, pluginWorkbenchStyles, pluginWorkbenchSettingsStyles, pluginSearchRows } from '../apps/workbench/src/plugin-workbench.js';
import { nativeMcpPluginRegistrations, createNativeMcpPluginAdapters, dispatchNativeMcpPluginTool } from '../apps/local-host/src/mcp-native-plugins.js';

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
      mcp_exports: [{ tool_id: 'legacy_read', description: 'Historical name', effect: 'read', input_schema: action.action.input_schema as never, required_actions: [{ capability_id: action.capability_id, version: 1 }] }],
      ui: { contributions: [contribution], views: [{ view_id: 'panel', slot: 'stage', title: 'Future', contribution_id: contribution }] } },
    workbench: { order: 0, contributions: [{ descriptor: { contribution_id: contribution, plugin_id: id, kind: 'primary-page', label: 'Future', slots: [],
      surfaces: [{ surface_id: 'panel', target_slot_id: 'workbench.main', format: 'declarative-html' }] },
      render: ({ model }) => `<article>${(model as { title: string }).title}</article>` }],
      stylesheet: '.future{color:red}', clientFactory: "api => api.mountPluginClient('future', api.projectId())",
      settingsClient: "mountPluginClient('future.settings', state.project.project_id);", searchRow: { selector: '[data-future-id]', idDataset: 'futureId' } },
    legacyMcp: async (client, request) => JSON.stringify(await client.invoke(action, request.arguments)),
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
    L: (text: string) => text, state: { project: { project_id: 'project-1' } }, feedApi: () => {}, route: () => {} });
  assert.deepEqual(mounted.map(args => [...args as unknown[]]), [['future', 'project-1'], ['future.settings', 'project-1']]);
});

test('unknown legacy adapter is derived from its entry, invokes the original action and never grants caller permissions', async () => {
  const entry = futurePlugin(), registrations = nativeMcpPluginRegistrations([entry]);
  const service = new ActionService(); let calls = 0, granted = false;
  const withdraw = service.registerProvider({ provider: { provider_id: entry.manifest.plugin_id, plugin_id: entry.manifest.plugin_id, title: 'Future', kind: 'plugin', project_id: 'p' },
    definitions: [action], handlers: [{ ...action, handle: (_, input) => { calls++; return (input as { value: string }).value; } }] });
  const caller = () => ({ actor_id: 'client', project_id: 'p', audience: 'mcp' as const, permissions: granted ? ['fixture:read'] : [] });
  const adapters = createNativeMcpPluginAdapters(bindActionClient(service, caller), registrations);
  const dispatch = () => dispatchNativeMcpPluginTool(adapters, { source: 'plugin', plugin_id: entry.manifest.plugin_id, tool_id: 'legacy_read', definition: { name: 'legacy_read' } },
    { value: 'original result' }, {} as never);
  assert.equal(service.discover(caller()).length, 0);
  await assert.rejects(dispatch()); assert.equal(calls, 0);
  granted = true;
  assert.equal(service.discover(caller())[0]?.capability_id, action.capability_id);
  assert.equal(await dispatch(), '"original result"'); assert.equal(calls, 1);
  granted = false; await assert.rejects(dispatch()); assert.equal(calls, 1);
  granted = true; withdraw(); await assert.rejects(dispatch()); assert.equal(calls, 1);
});

test('composition preserves Native UI identities and incomplete legacy bindings fail composition', () => {
  // Native UI is composed statically, not redeemed as a Runtime contribution; its old public identities stay stable.
  const ui = createWorkbenchUiHost().list();
  assert.equal(ui.find(entry => entry.contribution_id === 'io.molis.work.native.goals.proposal')?.plugin_id, 'io.molis.work.native.goals');
  assert.equal(ui.find(entry => entry.contribution_id === 'io.molis.work.native.work.terminal.v1')?.plugin_id, 'io.molis.work.native.work');
  const entry = futurePlugin();
  assert.throws(() => nativeMcpPluginRegistrations([{ ...entry, legacyMcp: undefined }]), /声明与适配器不一致/);
  assert.throws(() => nativeMcpPluginRegistrations([{ ...entry, manifest: { ...entry.manifest, mcp_exports: [] } }]), /声明与适配器不一致/);
});

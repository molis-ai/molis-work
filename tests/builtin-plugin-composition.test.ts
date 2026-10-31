import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { ActionDefinition } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PluginRegistration } from '@molis-ai/molis-work-contracts/platform/plugin-registration';
import { BUILTIN_PLUGIN_CATALOG, createWorkbenchUiHost, pluginSurfaceClients, pluginWorkbenchClientAsset, pluginWorkbenchPacks, WORKBENCH_UI_SLOTS } from '@molis-ai/molis-work-app-workbench';
import { pluginOnDemandStylesheet, pluginWorkbenchClientBootstrap, pluginWorkbenchStyles, pluginSearchRows } from '../apps/workbench/dist/plugin-workbench.js';

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
    workbench: { order: 0, contributions: [{ descriptor: { contribution_id: contribution, kind: 'primary-page', label: 'Future', slots: [],
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
  assert.equal(pluginWorkbenchStyles(packs), '.other{color:blue}', 'the framed plugin’s own rules leave the shared sheet');
  assert.equal(pluginOnDemandStylesheet('future', packs), '.future{color:red}', 'its frame links them in a sheet of its own');
  assert.deepEqual(pluginSearchRows(packs), [['future', '[data-future-id]', 'futureId']]);
  const mounted: unknown[] = [], translators: string[] = [];
  runInNewContext(pluginWorkbenchClientBootstrap(packs, false, [second, entry]), { mountPluginClient: (...args: unknown[]) => mounted.push(args),
    LFor: (pluginId: string) => { translators.push(pluginId); return (text: string) => text; }, state: { project: { project_id: 'project-1' } }, api: () => {}, route: () => {} });
  assert.deepEqual(mounted.map(args => [...args as unknown[]]), [['future', 'project-1'], ['future.settings', 'project-1']]);
  assert.deepEqual(translators, ['io.molis.work.future'], 'a client the page mounts is handed a translator for its own plugin, whoever published it');
});

test('RAC-635 a built-in contribution is registered under the plugin its Manifest names, whatever the contribution itself says', () => {
  // Native UI is composed statically, not redeemed as a Runtime contribution; the platform fills the owner from the catalog entry's Manifest (PG-098).
  const ui = createWorkbenchUiHost().list();
  const owners = new Map(BUILTIN_PLUGIN_CATALOG.flatMap(entry => (entry.workbench?.contributions ?? []).map(item => [item.descriptor.contribution_id, entry.manifest.plugin_id] as const)));
  owners.set("io.molis.work.native.artifacts.browser.v1", "io.molis.work.artifacts");
  owners.set("io.molis.work.native.artifacts.reference.v1", "io.molis.work.artifacts");
  assert.ok(ui.length > 20, 'the catalog registers its contributions');
  for (const descriptor of ui) assert.equal(descriptor.plugin_id, owners.get(descriptor.contribution_id), descriptor.contribution_id);
  assert.equal(ui.find(entry => entry.contribution_id === 'io.molis.work.native.goals.proposal')?.plugin_id, 'io.molis.work.goals');
  // A contribution that names an owner of its own is refused, naming the plugin and the contribution; it is not overwritten with the Manifest's.
  const withOwner = (plugin_id: string) => BUILTIN_PLUGIN_CATALOG.map(entry => entry.project_plugin_id === 'todo' && entry.workbench
    ? { ...entry, workbench: { ...entry.workbench, contributions: entry.workbench.contributions.map(item => ({ ...item, descriptor: { ...item.descriptor, plugin_id } })) } } : entry);
  const first = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === 'todo')?.workbench?.contributions[0]?.descriptor.contribution_id;
  assert.ok(first);
  for (const claimed of ['io.example.someone-else', 'io.molis.work.todo']) {
    assert.throws(() => pluginWorkbenchPacks(withOwner(claimed)), (error: Error) => error.message.includes('todo') && error.message.includes(first) && error.message.includes('plugin_id'), claimed);
  }
  const pack = pluginWorkbenchPacks().find(candidate => candidate.project_plugin_id === 'todo');
  assert.ok(pack?.contributions.length);
  for (const item of pack.contributions) assert.equal(item.descriptor.plugin_id, 'io.molis.work.todo');
  // SC-3 (PG-082): the Goal terminal pane is the workbench's own surface (apps/workbench/src/terminal/pane.ts), no longer a Work contribution.
  assert.equal(ui.find(entry => entry.contribution_id === 'io.molis.work.native.work.terminal.v1'), undefined);
});

test('RAC-635 no plugin source writes a plugin_id into a contribution declaration, in whatever order or shape', () => {
  const found: string[] = [];
  const named = (property: ts.ObjectLiteralElementLike) => {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property) && !ts.isMethodDeclaration(property)) return null;
    return ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : null;
  };
  const scan = (path: string) => {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const names = node.properties.map(named);
        if (names.includes('contribution_id') && names.includes('plugin_id')) found.push(`${path}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  };
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules' && entry.name !== 'dist') walk(path); continue; }
      if (entry.name.endsWith('.ts')) scan(path);
    }
  };
  const root = new URL('../plugins/native', import.meta.url).pathname;
  for (const plugin of readdirSync(root)) if (existsSync(join(root, plugin, 'src'))) walk(join(root, plugin, 'src'));
  assert.ok(found.length === 0, found.join('\n'));
  // The scan sees what the old adjacency regex missed: another property between the two, a shorthand, a quoted key, a different order.
  const probe = (text: string) => { const file = ts.createSourceFile('probe.ts', text, ts.ScriptTarget.Latest, true); let hit = false;
    const visit = (node: ts.Node) => { if (ts.isObjectLiteralExpression(node)) { const names = node.properties.map(named); if (names.includes('contribution_id') && names.includes('plugin_id')) hit = true; } ts.forEachChild(node, visit); };
    visit(file); return hit; };
  assert.ok(probe(`const a = { contribution_id: 'x', slot: 'main', plugin_id: 'p' };`));
  assert.ok(probe(`const a = { plugin_id, slot: 'main', contribution_id: 'x' };`));
  assert.ok(probe(`const a = { "plugin_id": 'p',\n contribution_id: 'x' };`));
  assert.ok(!probe(`const a = { contribution_id: 'x', slot: 'main' }; const b = { plugin_id: 'p' };`));
});

test('RAC-540 PG-070 every client is a bundle of its own: Files, Git, Diff and Text Stats borrow nothing from Coding', () => {
  const clients = new Map(pluginSurfaceClients().map(client => [client.id, client]));
  for (const id of ['coding', 'files', 'git', 'diff', 'text-stats']) {
    assert.equal(clients.get(id)?.bundle, id, `${id} is its own bundle`);
    assert.ok(pluginWorkbenchClientAsset(id), `the Host serves ${id}.js`);
  }
  for (const id of ['files', 'git', 'diff', 'text-stats']) assert.notEqual(clients.get(id)?.factory, clients.get('coding')?.factory, `${id} has a client of its own`);
  for (const client of clients.values()) assert.equal(client.bundle, client.id, client.id);
  // Coding calls Files' and Git's clients, so the page loads their bundles before it mounts Coding's.
  assert.deepEqual(clients.get('coding')?.assets, ['/assets/molis-work-plugins/git.js', '/assets/molis-work-plugins/files.js']);
});

test('RAC-541 W5-02-REG-08 a client gets the clients its registration names in clientUses, mounted as the plugin they belong to', () => {
  const entry = futurePlugin(), at = (id: string, order: number, workbench: Omit<PluginRegistration['workbench'], 'order' | 'contributions'>): PluginRegistration =>
    ({ ...entry, project_plugin_id: id, catalog_order: order, manifest: { ...entry.manifest, plugin_id: 'io.molis.work.' + id }, workbench: { order, contributions: [], ...workbench } });
  const user = at('user', 1, { clientFactory: 'host => host.clients.lent({ root: "r" })', clientUses: ['lent'] });
  const lent = at('lent', 2, { clientFactory: 'host => host.root + ":" + host.pluginId + ":" + host.pluginRoute("/x")' });
  const packs = pluginWorkbenchPacks([lent, user]);
  const lentOwn = packs.find(pack => pack.project_plugin_id === 'lent');
  assert.ok(lentOwn?.clientFactory, 'the used plugin ships a bundle of its own');
  const used = packs.find(pack => pack.project_plugin_id === 'user');
  assert.deepEqual(used?.clientAssets, ['/assets/molis-work-plugins/lent.js'], 'its bundle is loaded before the user mounts');
  const factories: Record<string, unknown> = { lent: runInNewContext(`(${lentOwn?.clientFactory})`) };
  assert.equal(runInNewContext(`(${used?.clientFactory})({ root: 'page', route: path => '/p' + path })`, { molisWorkbenchPluginFactories: factories }), 'r:io.molis.work.lent:/p/api/plugins/io.molis.work.lent/x', 'it mounts with its own plugin\'s identity, never the user\'s');
  assert.throws(() => pluginWorkbenchPacks([user, { ...lent, workbench: { ...lent.workbench, clientFactory: undefined } }]), /user uses the client of lent, which has none/);
  // The build: Coding calls Git's and Files' clients; the workbench has no Coding-specific script.
  assert.deepEqual(BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === 'coding')?.workbench.clientUses, ['git', 'files']);
  for (const id of ['git', 'files']) assert.ok(pluginWorkbenchPacks().find(pack => pack.project_plugin_id === id)?.clientFactory, id);
  assert.match(pluginWorkbenchClientAsset('coding') ?? '', /clients: \{ "git": ports => .+, "files": ports => .+ \}/s);
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

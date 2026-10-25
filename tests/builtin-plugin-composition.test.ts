import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
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
  assert.equal(pluginWorkbenchStyles(packs), '.future{color:red}.other{color:blue}');
  assert.equal(pluginWorkbenchSettingsStyles(packs), '.future{color:red}');
  assert.deepEqual(pluginSearchRows(packs), [['future', '[data-future-id]', 'futureId']]);
  const mounted: unknown[] = [];
  runInNewContext(pluginWorkbenchClientBootstrap(packs), { mountPluginClient: (...args: unknown[]) => mounted.push(args),
    L: (text: string) => text, state: { project: { project_id: 'project-1' } }, api: () => {}, route: () => {} });
  assert.deepEqual(mounted.map(args => [...args as unknown[]]), [['future', 'project-1'], ['future.settings', 'project-1']]);
});

test('RAC-635 a built-in contribution without an owner is registered under the plugin its Manifest names', () => {
  // Native UI is composed statically, not redeemed as a Runtime contribution; the platform fills the owner from the catalog entry's Manifest (PG-098).
  const ui = createWorkbenchUiHost().list();
  const owners = new Map(BUILTIN_PLUGIN_CATALOG.flatMap(entry => (entry.workbench?.contributions ?? []).map(item => [item.descriptor.contribution_id, entry.manifest.plugin_id] as const)));
  assert.ok(ui.length > 20, 'the catalog registers its contributions');
  for (const descriptor of ui) assert.equal(descriptor.plugin_id, owners.get(descriptor.contribution_id), descriptor.contribution_id);
  assert.equal(ui.find(entry => entry.contribution_id === 'io.molis.work.native.goals.proposal')?.plugin_id, 'io.molis.work.goals');
  // A contribution that names an owner of its own is refused, naming the plugin and the contribution; it is not overwritten with the Manifest's.
  const withOwner = (plugin_id: string) => BUILTIN_PLUGIN_CATALOG.map(entry => entry.project_plugin_id === 'todo' && entry.workbench
    ? { ...entry, workbench: { ...entry.workbench, contributions: entry.workbench.contributions.map(item => ({ ...item, descriptor: { ...item.descriptor, plugin_id } })) } } : entry);
  const first = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === 'todo')?.workbench?.contributions[0]?.descriptor.contribution_id;
  assert.ok(first);
  for (const claimed of ['io.example.someone-else', 'io.molis.work.todo']) {
    assert.throws(() => pluginWorkbenchPacks(withOwner(claimed)), (error: unknown) => error instanceof Error && error.message.includes(first)
      && error.message.replaceAll(first, '').includes('todo') && error.message.includes('plugin_id'), claimed);
  }
  const pack = pluginWorkbenchPacks().find(candidate => candidate.project_plugin_id === 'todo');
  assert.ok(pack?.contributions.length);
  for (const item of pack.contributions) assert.equal(item.descriptor.plugin_id, 'io.molis.work.todo');
  // SC-3 (PG-082): the Goal terminal pane is the workbench's own surface (apps/workbench/src/terminal/pane.ts), no longer a Work contribution.
  assert.equal(ui.find(entry => entry.contribution_id === 'io.molis.work.native.work.terminal.v1'), undefined);
});

// Only object literals and same-file const initializers: the checker supplies lexical bindings, never cross-module data flow.
function contributionKeys(expression: ts.Expression, checker: ts.TypeChecker, source: ts.SourceFile, seen = new Set<ts.Node>()): string[] {
  if (seen.has(expression)) return [];
  const next = new Set(seen).add(expression);
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression) || ts.isSatisfiesExpression(expression)) {
    return contributionKeys(expression.expression, checker, source, next);
  }
  if (ts.isIdentifier(expression)) {
    const declaration = checker.getSymbolAtLocation(expression)?.valueDeclaration;
    return declaration && ts.isVariableDeclaration(declaration) && declaration.getSourceFile() === source
      && ts.isVariableDeclarationList(declaration.parent) && (declaration.parent.flags & ts.NodeFlags.Const) && declaration.initializer
      ? contributionKeys(declaration.initializer, checker, source, next) : [];
  }
  if (!ts.isObjectLiteralExpression(expression)) return [];
  return expression.properties.flatMap(property => {
    if (ts.isSpreadAssignment(property)) return contributionKeys(property.expression, checker, source, next);
    return ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? [property.name.text] : [];
  });
}

function contributionOwnerLines(text: string, path = 'probe.ts'): number[] {
  const found: number[] = [], source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const options: ts.CompilerOptions = { noResolve: true, noLib: true, allowJs: true, target: ts.ScriptTarget.Latest };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = name => name === path ? source : undefined;
  const checker = ts.createProgram([path], options, host).getTypeChecker();
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const names = contributionKeys(node, checker, source);
      if (names.includes('contribution_id') && names.includes('plugin_id')) found.push(source.getLineAndCharacterOfPosition(node.getStart()).line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function contributionOwnerSources(directory: string): string[] {
  const found: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules' && entry.name !== 'dist') walk(path); continue; }
      if (/\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name)) for (const line of contributionOwnerLines(readFileSync(path, 'utf8'), path)) found.push(`${path}:${line}`);
    }
  };
  walk(directory);
  return found;
}

test('RAC-635 no plugin source writes a plugin_id into a contribution declaration', () => {
  const root = new URL('../plugins/native', import.meta.url).pathname;
  const found = readdirSync(root).flatMap(plugin => existsSync(join(root, plugin, 'src')) ? contributionOwnerSources(join(root, plugin, 'src')) : []);
  assert.ok(found.length === 0, found.join('\n'));
  // The scan sees what the old adjacency regex missed: another property between the two, a shorthand, a quoted key, a different order.
  const probe = (text: string) => contributionOwnerLines(text).length > 0;
  assert.ok(probe(`const a = { contribution_id: 'x', slot: 'main', plugin_id: 'p' };`));
  assert.ok(probe(`const a = { plugin_id, slot: 'main', contribution_id: 'x' };`));
  assert.ok(probe(`const a = { "plugin_id": 'p',\n contribution_id: 'x' };`));
  assert.ok(!probe(`const a = { contribution_id: 'x', slot: 'main' }; const b = { plugin_id: 'p' };`));
});

test('RAC-635 the source scan follows direct and local const spreads and respects local shadowing', () => {
  for (const text of [
    `const descriptor = { ...{ plugin_id: 'p' }, contribution_id: 'x' };`,
    `const base = { plugin_id: 'p' }; const descriptor = { ...base, contribution_id: 'x' };`,
    `const base = { plugin_id: 'p' } as const; const alias = base; const descriptor = { contribution_id: 'x', ...alias };`,
    `const identity = { plugin_id: 'p' }; const base = { ...identity }; const descriptor = { ...base, contribution_id: 'x' };`,
    `const base = {}; function scope() { const base = { plugin_id: 'p' }; return { ...base, contribution_id: 'x' }; }`,
  ]) assert.ok(contributionOwnerLines(text).length > 0, text);
  for (const text of [
    `const base = { plugin_id: 'p' }; function scope(base) { return { ...base, contribution_id: 'x' }; }`,
    `const base = { plugin_id: 'p' }; function scope() { const base = {}; return { ...base, contribution_id: 'x' }; }`,
    `const descriptor = { contribution_id: 'x', nested: { plugin_id: 'p' } };`,
    `import { base } from './other.js'; const descriptor = { ...base, contribution_id: 'x' };`,
    `const base = createDescriptor(); const descriptor = { ...base, contribution_id: 'x' };`,
  ]) assert.deepEqual(contributionOwnerLines(text), [], text);
});

test('RAC-635 the source scan reads the usual TS and JS source extensions', () => {
  const directory = mkdtempSync(join(tmpdir(), 'molis-contribution-sources-'));
  const files = ['panel.ts', 'panel.tsx', 'panel.mts', 'panel.cts', 'panel.js', 'panel.jsx', 'panel.mjs', 'panel.cjs'];
  try {
    for (const file of files) writeFileSync(join(directory, file), "const descriptor = { contribution_id: 'x', label: 'Panel', plugin_id: 'p' };");
    writeFileSync(join(directory, 'notes.md'), "const descriptor = { contribution_id: 'not-source', plugin_id: 'p' };");
    assert.deepEqual(contributionOwnerSources(directory).sort(), files.map(file => `${join(directory, file)}:1`).sort());
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('RAC-635 RAC-636 catalog rejection of a spread owner leaves the original contribution and renderer intact', () => {
  const entry = futurePlugin(), host = createWorkbenchUiHost(pluginWorkbenchPacks([entry]));
  const original = structuredClone(host.list()), contributionId = entry.workbench!.contributions[0]!.descriptor.contribution_id;
  assert.equal(original[0]!.label, 'Future');
  assert.equal(original[0]!.plugin_id, entry.manifest.plugin_id);
  for (const claimed of ['io.example.someone-else', entry.manifest.plugin_id]) {
    const owner = { plugin_id: claimed };
    const invalid: PluginRegistration = { ...entry, workbench: { ...entry.workbench!, contributions: entry.workbench!.contributions.map(item =>
      ({ ...item, descriptor: { ...item.descriptor, ...owner }, render: () => 'replaced' })) } };
    assert.throws(() => pluginWorkbenchPacks([invalid]), (error: unknown) => error instanceof Error && error.message.includes(contributionId)
      && error.message.replaceAll(contributionId, '').includes(entry.project_plugin_id) && error.message.includes('plugin_id'));
    assert.deepEqual(host.list(), original);
    assert.equal(host.mount({ slot: WORKBENCH_UI_SLOTS.main, contribution: { contribution_id: contributionId, surface: 'panel', model: { title: 'Original content' } } }).html, '<article>Original content</article>');
  }
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

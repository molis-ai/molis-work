// @requires-platform darwin
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { AgentBuilderStore, type AgentRelease } from '@molis-ai/molis-work-plugin-studio';
import { createPrologueNodeAdapter } from '@molis-ai/molis-work-service-agent-host';
import { openMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { openHomeSqliteDatabase, resetSecretStoreCache } from '@molis-ai/molis-work-storage';
import type { SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { homeAgentDefinitions, LocalProjectDatabase } from '@molis-ai/molis-work-app-local-host';
import { seedDemoBoard, studioTrials } from '@molis-ai/molis-work-app-local-host';
import { ensureInstalledPlugins, releaseInstalledPlugins } from '../apps/local-host/dist/installed-plugin-host.js';
import { STABLE_PREVIEW, studioStorage } from '../apps/local-host/dist/plugin-builder/storage.js';
import { buildManifest } from '../apps/local-host/dist/plugin-builder/build-project.js';
import { exposedActionId } from '../apps/local-host/dist/installed-plugin-exposed-actions.js';
import { withConnectorConnections } from '@molis-ai/molis-work-app-local-host';
import { bindPrologueInference } from '../apps/local-host/dist/prologue-inference-host.js';
import { agentDeclarationsFor } from '../apps/local-host/dist/agent-definitions/agent-definitions.js';
import { newPublisher, PACKAGE_PLUGIN_ID, signedAgentPackage, signedPackage } from './fixtures/sandbox-package.js';
import { openTestHome, createPackageProject } from './fixtures/test-home.js';
import { packagedStudioRelease } from './fixtures/studio-package.js';

test('SBXN-04 installed and authoring model calls bind their own release through the real Host, sandbox and shared Runtime', { skip: process.platform !== 'darwin', timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), 'generated-prompt-binding-'));
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = 'file';
  const systems: string[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = JSON.parse(raw);
    systems.push(JSON.stringify(body.messages.filter((message: { role: string }) => message.role === 'system')));
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write(`data: ${JSON.stringify({ model: body.model, choices: [{ index: 0, delta: { content: 'GENERATED' }, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
    response.end('data: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: 'model-api', displayName: 'Fixture', token: 'local-fixture' }));
  withConnectorConnections(home, store => store.assertTarget(connection.connection_id, 'model-api', origin));
  catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: 'fixture', display_name: 'Fixture', base_url: origin + '/v1', api_format: 'openai-chat-completions', models: [{ model_id: 'fixture', enabled: true }] });
  const adapter = await createPrologueNodeAdapter({ app: { appId: 'prompt-binding', appVersion: '1.0.0' }, storageRoot: join(home, 'runtime') });
  const unbind = bindPrologueInference(home, adapter.inference);
  const stores: Array<{ store: LocalProjectDatabase; id: string }> = [];
  t.after(async () => {
    for (const { store, id } of stores) { await releaseInstalledPlugins(store, id); store.close(); }
    unbind(); await adapter.close(); catalog.close(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve())); resetSecretStoreCache();
    if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior;
    await rm(home, { recursive: true, force: true });
  });
  const project = (id: string) => {
    const databasePath = join(home, id + '.sqlite'); seedDemoBoard(databasePath, id);
    const store = new LocalProjectDatabase(databasePath); stores.push({ store, id });
    const service = new ActionService();
    // The project's id is its own everywhere (its seeded board, its Studio storage, its actions, the installed plugins the Host runs in it), so a sandbox's identity
    // belongs to the project it runs in; two projects stay two scopes for the prompts their installations register.
    const storage = studioStorage(store.db, id);
    return { store, storage, service, id, actions: { registry: service, client: service, project_id: id }, builder: new AgentBuilderStore(storage) };
  };
  const a = project('project-a'), b = project('project-b'), draft = a.builder.create('Prompt binding fixture');
  const pluginId = 'studio.' + draft.id, directory = join(home, 'build');
  await mkdir(join(directory, 'src', 'operations'), { recursive: true });
  await writeFile(join(directory, 'src', 'operations', '0.ts'), `export const prompts = [{ id:'summary', title:'Summary', purpose:'p', body:'AUTHORING_DEFAULT' }];`);
  const contract: SandboxPluginContract = { version: 1, pluginId, revision: 'one', entities: [], pages: [], acceptance: [], operations: [
    { id: 'generate', kind: 'command', input: { type: 'string' }, output: { type: 'string' }, effects: { capabilities: ['model.generate'] }, errors: [], examples: [{ input: 'summary', output: 'GENERATED' }] },
  ] };
  const bundlePath = join(directory, 'plugin.mjs');
  await writeFile(bundlePath, `export const operations = { generate:async(prompt,sdk)=>(await sdk.capability.call('model.generate',{prompt,input:'material'})).text };`);
  const raw: AgentRelease = { buildId: draft.id, pluginId, version: 1, directory, bundlePath, packagePath: directory,
    design: { id: 'one', catalog: 'actions/1', title: 'Fixture', description: 'Fixture', rationale: 'Fixture', journey: [], contract, parts: [], acceptance: [] },
    prompts: [{ id: 'summary', title: 'Summary', purpose: 'p', body: 'RELEASE_ONE' }],
    nodes: [], manifest: buildManifest(contract), permissions: { capabilities: ['model.generate'] }, publishedAt: new Date().toISOString() };
  a.builder.update(draft.id, draft.revision, build => { build.directory = directory; build.design = raw.design; });
  // What each project installs is the release's signed package (PG-083): two versions of one plugin by one publisher, kept in the Home.
  const publisher = newPublisher(), v1 = packagedStudioRelease(home, raw, publisher);
  const v2 = packagedStudioRelease(home, { ...raw, version: 2, prompts: [{ ...raw.prompts![0]!, body: 'RELEASE_TWO' }, { id: 'new-only', title: 'New', purpose: 'p', body: 'NEW_ONLY' }] }, publisher, { upgradesFrom: [1] });
  const one = await ensureInstalledPlugins({ store: a.store, projectId: a.id, homeDirectory: home, actions: a.actions });
  const two = await ensureInstalledPlugins({ store: b.store, projectId: b.id, homeDirectory: home, actions: b.actions });
  const registry = homeAgentDefinitions(home), key = pluginId + '/summary';
  const declarations = agentDeclarationsFor(home);
  const remembered = () => declarations.all().find(row => row.registration.owner_id === pluginId)?.registration;
  const listed = () => registry.prompts().filter(item => item.owner_id === pluginId).map(item => item.prompt_id).sort();
  const assertV1 = (state: 'enabled' | 'disabled') => {
    assert.deepEqual(listed(), ['summary']);
    const prompt = registry.prompt(key);
    assert.equal(prompt.default_body, 'RELEASE_ONE');
    assert.equal(prompt.source.kind === 'plugin' && prompt.source.state, state);
    assert.deepEqual(remembered()?.prompts.map(item => [item.prompt_id, item.body]), [['summary', 'RELEASE_ONE']]);
  };
  await one.lifecycle('install', v1, { consent: true });
  assertV1('enabled');
  await two.lifecycle('install', v2, { consent: true });
  assert.equal(one.installations()[0]!.record.install_id, two.installations()[0]!.record.install_id);
  assert.deepEqual(listed(), ['new-only', 'summary']);
  assert.equal(registry.prompt(key).default_body, 'RELEASE_TWO');
  // `generate` calls the model through a platform capability, a switch that starts off (BL-701).
  // The project's platform also runs its built-in plugins (47-1 B): only the installed packages' switches are turned on.
  for (const host of [one, two]) for (const { record } of host.installations()) await host.platform.runtime.regrant(record.install_id, 'capabilities:call', true);
  // A package's actions keep one version across its versions; which release answers is the installation's, not the caller's choice.
  const invoke = (p: typeof a, prompt = 'summary') => p.service.invoke({ actor_id: 'person', audience: 'user', project_id: p.actions.project_id, permissions: [] },
    { capability_id: exposedActionId(v1, 'generate'), version: 1, provider_id: 'plugin:' + pluginId }, prompt);
  assert.equal(await invoke(a), 'GENERATED'); assert.match(systems.at(-1)!, /RELEASE_ONE/); assert.doesNotMatch(systems.at(-1)!, /RELEASE_TWO/);
  assert.equal(await invoke(b), 'GENERATED'); assert.match(systems.at(-1)!, /RELEASE_TWO/);
  const calls = systems.length;
  await assert.rejects(invoke(a, 'new-only'), /没有声明/);
  assert.equal(systems.length, calls, 'another installed version cannot authorize a prompt absent from this release');
  registry.save(key, 'PERSONAL_EDIT', null, 'person');
  // A trial's prompts come from the studio that drafts it (47-1 D): the open studio answers the installed host for its own builds.
  const stopTrials = one.useTrials(studioTrials(a.builder)); t.after(stopTrials);
  const preview = one.capabilityFor(() => true);
  const previewContext = { identity: { projectId: a.id, pluginId, installationId: STABLE_PREVIEW + draft.id, namespace: 'preview' as const }, signal: new AbortController().signal };
  assert.deepEqual(await preview.call(previewContext, 'model.generate', { prompt: 'summary', input: 'material' }), { text: 'GENERATED' });
  assert.match(systems.at(-1)!, /AUTHORING_DEFAULT/); assert.doesNotMatch(systems.at(-1)!, /RELEASE_ONE|RELEASE_TWO|PERSONAL_EDIT/);
  assert.equal(await invoke(a), 'GENERATED'); assert.match(systems.at(-1)!, /PERSONAL_EDIT/);
  assert.equal(registry.uses.list(key)[0]!.version, 1, 'usage records the actual default version underneath the shared user edit');
  // BL-b47-prompt-register-newest-fallback: the list and the Home's remembered declaration follow the highest running release.
  const blocker = openHomeSqliteDatabase(home, 'agent-declarations');
  try {
    blocker.exec('BEGIN IMMEDIATE');
    await assert.rejects(two.lifecycle('disable', v2), /database is locked/);
  } finally { blocker.close(); }
  assert.equal(registry.prompt(key).default_body, 'RELEASE_ONE');
  assert.deepEqual(remembered()?.prompts.map(item => item.prompt_id).sort(), ['new-only', 'summary']);
  await two.lifecycle('disable', v2);
  assertV1('enabled');
  assert.equal(registry.prompt(key).body, 'PERSONAL_EDIT');
  await two.lifecycle('uninstall', v2);
  assertV1('enabled');
  assert.equal(await invoke(a), 'GENERATED'); assert.match(systems.at(-1)!, /PERSONAL_EDIT/);
  await one.lifecycle('disable', v1);
  assertV1('disabled');
  assert.equal(registry.prompt(key).body, 'PERSONAL_EDIT');
  await one.lifecycle('uninstall', v1);
  assert.deepEqual(listed(), []);
  assert.equal(remembered(), undefined);
  await one.lifecycle('install', v1, { consent: true });
  await one.platform.runtime.regrant(one.installations()[0]!.record.install_id, 'capabilities:call', true);
  registry.reset(key, 1, 'person');
  await one.lifecycle('upgrade', v2);
  assert.equal(registry.prompt(key).default_body, 'RELEASE_TWO');
  assert.deepEqual(listed(), ['new-only', 'summary']);
  assert.equal(await invoke(a), 'GENERATED'); assert.match(systems.at(-1)!, /RELEASE_TWO/); assert.doesNotMatch(systems.at(-1)!, /RELEASE_ONE/);
  const beforeRejected = systems.length;
  // A preview identity naming another plugin than its build is refused when the Host issues the call's caller (the plugin it declared is not that one), before the model is reached.
  await assert.rejects(preview.call({ ...previewContext, identity: { ...previewContext.identity, pluginId: pluginId + '-other' } }, 'model.generate', { prompt: 'summary', input: '' }), /这个插件的声明已失效/);
  await assert.rejects(a.service.invoke({ actor_id: 'plugin:' + pluginId, actor_kind: 'runtime', project_id: a.actions.project_id, audience: 'plugin', plugin_install_id: 'old-installation', permissions: [] },
    { capability_id: 'model.generate', version: 1, provider_id: 'plugin-platform' }, { prompt: 'summary', input: '' }), /安装执行身份已失效/);
  await one.lifecycle('disable', v2);
  await assert.rejects(invoke(a)); assert.equal(systems.length, beforeRejected);
  // SBXN-03: the installed-plugin path preserves the Host's recovery message through Plugin Runtime.
  const originalNode = process.execPath;
  process.execPath = join(home, 'missing-node');
  try {
    await assert.rejects(one.lifecycle('enable', v2), /Sandboxed plugins cannot start with this Node\.js installation.*nodejs\.org/);
  } finally { process.execPath = originalNode; }
});

test("BL-b47-prompt-register-newest-fallback a running version with no declarations takes back the whole registration", { skip: process.platform !== "darwin" }, async t => {
  const h = await openTestHome(t), a = await createPackageProject(h, "Empty declaration"), b = await createPackageProject(h, "Mixed declaration");
  const publisher = newPublisher();
  const registry = homeAgentDefinitions(h.home);
  const entries = () => [registry.prompts(), registry.roles(), registry.methods()].map(rows => rows.filter(row => row.owner_id === PACKAGE_PLUGIN_ID).length);
  await a.install(signedPackage(publisher));
  assert.deepEqual(entries(), [0, 0, 0]);
  await b.install(signedAgentPackage(publisher, { version: "2.0.0" }));
  assert.deepEqual(entries(), [2, 1, 1], "the newer package supplies an instruction, a role prompt, a role and a method");
  await b.disable(PACKAGE_PLUGIN_ID);
  assert.deepEqual(entries(), [0, 0, 0], "the empty running release wins as soon as the newer one stops");
  // A fresh register reads the durable projection before uninstall has a chance to clean it up.
  execFileSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { homeAgentDefinitions } from "@molis-ai/molis-work-app-local-host";
    const [home, owner] = process.argv.slice(1);
    assert.equal(homeAgentDefinitions(home).registrations().some(row => row.owner_id === owner), false);
  `, h.home, PACKAGE_PLUGIN_ID]);
  await b.uninstall(PACKAGE_PLUGIN_ID);
  assert.deepEqual(entries(), [0, 0, 0]);
});

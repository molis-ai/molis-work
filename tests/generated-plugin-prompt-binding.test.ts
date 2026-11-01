import { publishCheckedStudioFixture } from './fixtures/checked-studio-release.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { AgentBuilderStore, type AgentRelease } from '@molis-ai/molis-work-plugin-builder';
import { createPrologueNodeAdapter } from '@molis-ai/molis-work-service-agent-host';
import { openMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { resetSecretStoreCache } from '@molis-ai/molis-work-storage';
import type { SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { LocalProjectDatabase } from '@molis-ai/molis-work-app-local-host';
import { seedDemoBoard } from '@molis-ai/molis-work-app-local-host';
import { ensureInstalledPlugins, releaseInstalledPlugins } from '../apps/local-host/dist/installed-plugin-host.js';
import { STABLE_PREVIEW, studioStorage } from '../apps/local-host/dist/plugin-builder/storage.js';
import { buildManifest } from '../apps/local-host/dist/plugin-builder/build-project.js';
import { exposedActionId } from '../apps/local-host/dist/plugin-builder/exposed-actions.js';
import { withConnectorConnections } from '@molis-ai/molis-work-app-local-host';
import { bindPrologueInference } from '../apps/local-host/dist/prologue-inference-host.js';
import { agentDefinitionsFor } from '../apps/local-host/dist/agent-definitions/agent-definitions.js';
import { builtinRegistrations } from '../apps/local-host/dist/agent-definitions/builtin-registrations.js';

test('installed and authoring model calls bind their own release through the real Host, sandbox and shared Runtime', { skip: process.platform !== 'darwin', timeout: 60_000 }, async t => {
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
  const pluginId = 'io.molis.work.generated.' + draft.id, directory = join(home, 'build');
  await mkdir(join(directory, 'src', 'operations'), { recursive: true });
  await writeFile(join(directory, 'src', 'operations', '0.ts'), `export const prompts = [{ id:'summary', title:'Summary', purpose:'p', body:'AUTHORING_DEFAULT' }];`);
  const contract: SandboxPluginContract = { version: 1, pluginId, revision: 'one', entities: [], pages: [], acceptance: [], operations: [
    { id: 'generate', kind: 'command', input: { type: 'string' }, output: { type: 'string' }, effects: { capabilities: ['model.generate'] }, errors: [], examples: [{ input: 'summary', output: 'GENERATED' }] },
  ] };
  const bundlePath = join(directory, 'plugin.mjs');
  await writeFile(bundlePath, `export const operations = { generate:async(prompt,sdk)=>(await sdk.capability.call('model.generate',{prompt,input:'material'})).text };`);
  const v1: AgentRelease = { buildId: draft.id, pluginId, version: 1, directory, bundlePath, packagePath: directory,
    design: { id: 'one', catalog: 'actions/1', title: 'Fixture', description: 'Fixture', rationale: 'Fixture', journey: [], contract, parts: [], acceptance: [] },
    prompts: [{ id: 'summary', title: 'Summary', purpose: 'p', body: 'RELEASE_ONE' }],
    nodes: [], manifest: buildManifest(contract), permissions: { capabilities: ['model.generate'] }, publishedAt: new Date().toISOString() };
  const v2: AgentRelease = { ...v1, version: 2, prompts: [{ ...v1.prompts![0]!, body: 'RELEASE_TWO' }, { id: 'new-only', title: 'New', purpose: 'p', body: 'NEW_ONLY' }] };
  a.builder.update(draft.id, draft.revision, build => { build.directory = directory; build.design = v1.design; });
  publishCheckedStudioFixture(a.storage, v1); publishCheckedStudioFixture(b.storage, v1); publishCheckedStudioFixture(b.storage, v2);
  const one = await ensureInstalledPlugins({ store: a.store, projectId: a.id, homeDirectory: home, actions: a.actions });
  const two = await ensureInstalledPlugins({ store: b.store, projectId: b.id, homeDirectory: home, actions: b.actions });
  await one.lifecycle('install', v1, { consent: true }); await two.lifecycle('install', v2, { consent: true });
  const invoke = (p: typeof a, version: number, prompt = 'summary') => p.service.invoke({ actor_id: 'person', audience: 'user', project_id: p.actions.project_id, permissions: [] },
    { capability_id: exposedActionId(v1, 'generate'), version, provider_id: 'plugin:' + pluginId }, prompt);
  assert.equal(await invoke(a, 1), 'GENERATED'); assert.match(systems.at(-1)!, /RELEASE_ONE/); assert.doesNotMatch(systems.at(-1)!, /RELEASE_TWO/);
  assert.equal(await invoke(b, 2), 'GENERATED'); assert.match(systems.at(-1)!, /RELEASE_TWO/);
  const calls = systems.length;
  await assert.rejects(invoke(a, 1, 'new-only'), /没有声明/);
  assert.equal(systems.length, calls, 'another installed version cannot authorize a prompt absent from this release');
  const registry = agentDefinitionsFor(home, builtinRegistrations), key = pluginId + '/summary';
  registry.save(key, 'PERSONAL_EDIT', null, 'person');
  const preview = one.capabilityFor(() => true);
  const previewContext = { identity: { projectId: a.id, pluginId, installationId: STABLE_PREVIEW + draft.id, namespace: 'preview' as const }, signal: new AbortController().signal };
  assert.deepEqual(await preview.call(previewContext, 'model.generate', { prompt: 'summary', input: 'material' }), { text: 'GENERATED' });
  assert.match(systems.at(-1)!, /AUTHORING_DEFAULT/); assert.doesNotMatch(systems.at(-1)!, /RELEASE_ONE|RELEASE_TWO|PERSONAL_EDIT/);
  assert.equal(await invoke(a, 1), 'GENERATED'); assert.match(systems.at(-1)!, /PERSONAL_EDIT/);
  assert.equal(registry.uses(key)[0]!.version, 1, 'usage records the actual default version underneath the shared user edit');
  await two.lifecycle('uninstall', v2);
  assert.equal(registry.prompt(key).default_body, 'RELEASE_ONE'); assert.equal(registry.prompt(key).body, 'PERSONAL_EDIT');
  assert.equal(await invoke(a, 1), 'GENERATED'); assert.match(systems.at(-1)!, /PERSONAL_EDIT/);
  registry.reset(key, 1, 'person'); publishCheckedStudioFixture(a.storage, v2);
  await one.lifecycle('upgrade', v2);
  assert.equal(await invoke(a, 2), 'GENERATED'); assert.match(systems.at(-1)!, /RELEASE_TWO/);
  await one.lifecycle('rollback', v1);
  assert.equal(await invoke(a, 1), 'GENERATED'); assert.match(systems.at(-1)!, /RELEASE_ONE/);
  const beforeRejected = systems.length;
  // A preview identity naming another plugin than its build is refused when the Host issues the call's caller (the plugin it declared is not that one), before the model is reached.
  await assert.rejects(preview.call({ ...previewContext, identity: { ...previewContext.identity, pluginId: pluginId + '-other' } }, 'model.generate', { prompt: 'summary', input: '' }), /这个插件的声明已失效/);
  await assert.rejects(a.service.invoke({ actor_id: 'plugin:' + pluginId, actor_kind: 'runtime', project_id: a.actions.project_id, audience: 'plugin', plugin_install_id: 'old-installation', permissions: [] },
    { capability_id: 'model.generate', version: 1, provider_id: 'plugin-platform' }, { prompt: 'summary', input: '' }), /安装执行身份已失效/);
  await one.lifecycle('disable', v1);
  await assert.rejects(invoke(a, 1)); assert.equal(systems.length, beforeRejected);
});

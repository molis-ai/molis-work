import assert from 'node:assert/strict';
import test from 'node:test';
import { capabilityLimits, type CapabilityImplementations, slowOperations } from '../apps/local-host/src/plugin-builder/capabilities.js';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { capabilityCatalog, catalogCapabilities, registerPlatformCapabilities } from '../apps/local-host/src/plugin-builder/catalog.js';
import { STUDIO_CAPABILITIES, expandDesign } from '../plugins/native/plugin-builder/src/index.js';

const identity = (namespace: 'preview' | 'installed', installationId = 'install-1') => ({ projectId: 'p', installationId, pluginId: 'io.molis.work.generated.x', namespace });
const context = (namespace: 'preview' | 'installed', installationId?: string) => ({ identity: identity(namespace, installationId), signal: new AbortController().signal, operationId: 'notes.expand' });
/** What a generated plugin calls: the project's catalog, with the platform's model registered in it. */
function catalogService(implementations: CapabilityImplementations, live: (identity: ReturnType<typeof identity>) => boolean) {
  const actions = { registry: new ActionService(), project_id: 'p' };
  const project = { ...actions, client: actions.registry };
  registerPlatformCapabilities(project, implementations);
  return catalogCapabilities({ actions: project, catalog: () => capabilityCatalog(project, 'user'), live });
}

const ask = { prompt: 'expand', input: '间隔复习比集中复习记得更久，因为提取本身就是练习' };

test('checks and acceptance get the fixed stand-in; the person gets the real model, within a per-minute budget', async () => {
  const calls: string[] = [];
  const service = catalogService({ async generate(pluginId, input) { calls.push(pluginId + ':' + input.input); return { text: '真实回答' }; } }, item => item.namespace === 'installed');
  assert.deepEqual(await service.call(context('preview'), 'model.generate', ask), { text: '［模型替身］间隔复习比集中复习记得更久，因为提取本身就是练习' });
  await assert.rejects(service.call(context('preview'), 'goals.delete', {}), /平台目录里没有开放给插件的能力/);
  assert.deepEqual(await service.call(context('installed'), 'model.generate', ask), { text: '真实回答' });
  assert.equal(calls.length, 1, 'only the live identity reached the model');
  for (let index = 1; index < 20; index++) await service.call(context('installed'), 'model.generate', ask);
  await assert.rejects(service.call(context('installed'), 'model.generate', ask), /一分钟内调用次数太多/);
  assert.deepEqual(await service.call(context('installed', 'install-2'), 'model.generate', ask), { text: '真实回答' }, 'the budget is per installation');
  const broken = catalogService({ async generate() { return { text: 1 } as unknown as { text: string }; } }, () => true);
  await assert.rejects(broken.call(context('installed'), 'model.generate', ask), /结果不符合能力合同/, 'a malformed answer never reaches the plugin');
});

test('a plugin that waits on the model gets limits for one model call; others keep the defaults', () => {
  assert.deepEqual(capabilityLimits({ storage: ['read'] }, STUDIO_CAPABILITIES), {});
  const limits = capabilityLimits({ storage: ['read', 'write'], capabilities: ['model.generate'] }, STUDIO_CAPABILITIES);
  assert.ok(limits.operationTimeoutMs! > 120_000 && limits.serviceTimeoutMs! > 120_000);
});

test('a query may not call the model: reads run whenever the page opens', () => {
  const design = { operations: [{ id: 'notes.explain', kind: 'query', input: {}, output: 'string', effects: { storage: ['read'], capabilities: ['model.generate'] }, examples: [{ input: {}, output: '' }] }],
    pages: [{ id: 'home', parts: [{ id: 'explain', intent: 'description', purpose: 'p', read: 'notes.explain' }] }], acceptance: [{ id: 'a', steps: ['expect explain x'] }] };
  assert.throws(() => expandDesign(design, { id: 'q', title: 't', description: 'd', rationale: 'r', journey: ['j'] }, 'io.molis.work.generated.x', 'r', []), /查询（query）不能调用收费能力/);
});

test('operations that wait on the model get their own lane; everything else stays quick', () => {
  const contract = { operations: [
    { id: 'concepts.list', effects: { storage: ['read' as const] } },
    { id: 'concepts.ask', effects: { storage: ['read' as const], capabilities: ['model.generate'] } },
  ] };
  assert.deepEqual([...slowOperations(contract, STUDIO_CAPABILITIES)], ['concepts.ask']);
});

test('query authoring uses provider cost declarations regardless of capability name', async () => {
  const { normalizeEffects } = await import('../plugins/native/plugin-builder/src/agent-authoring.js');
  const catalog = [{ id: 'research.summarize', description: '', execution: { cost: 'metered' as const } }];
  assert.throws(() => normalizeEffects({ capabilities: ['research.summarize'] }, 'query', 'auto read', catalog), /不能调用收费能力/);
  assert.deepEqual(normalizeEffects({ capabilities: ['research.summarize'] }, 'command', 'button', catalog), { capabilities: ['research.summarize'] });
  assert.deepEqual(normalizeEffects({ capabilities: ['model.generate'] }, 'query', 'fixture', [{ id: 'model.generate', description: '', execution: { cost: 'none' } }]), { capabilities: ['model.generate'] }, 'a name is not an execution policy');
});

test('model calls check the caller again at actual dispatch', async () => {
  let active = true, started!: () => void, release!: () => void, dispatches = 0;
  const entered = new Promise<void>(resolve => { started = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const service = catalogService({ async generate(_plugin, _input, _signal, beforeDispatch) {
    started(); await blocked; await beforeDispatch?.(); dispatches++; return { text: 'too late' };
  } }, () => active);
  const pending = service.call(context('installed'), 'model.generate', ask);
  const refused = assert.rejects(pending, /调用已停止/);
  await entered; active = false; release(); await refused;
  assert.equal(dispatches, 0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { capabilityLimits, hostCapabilities, keepNewestRecords, MODEL_CALLS_PER_MINUTE, slowOperations, standInCapabilities } from '../apps/local-host/src/plugin-builder/capabilities.js';
import { expandDesign } from '../plugins/native/plugin-builder/src/index.js';

const identity = (namespace: 'preview' | 'installed', installationId = 'install-1') => ({ projectId: 'p', installationId, pluginId: 'io.molis.work.generated.x', namespace });
const context = (namespace: 'preview' | 'installed', installationId?: string) => ({ identity: identity(namespace, installationId), signal: new AbortController().signal, operationId: 'notes.expand' });
const ask = { instructions: '展开', input: '间隔复习比集中复习记得更久，因为提取本身就是练习' };

test('checks and acceptance get the fixed stand-in; the person gets the real model, within a per-minute budget', async () => {
  assert.deepEqual(await standInCapabilities().call(context('preview'), 'model.generate', ask), { text: '［模型替身］间隔复习比集中复习记得更久，因为提取本身就是练习' });
  await assert.rejects(standInCapabilities().call(context('preview'), 'model.generate', { instructions: '' , input: 'x' }), /\$/, 'input is checked against the catalog schema');
  await assert.rejects(standInCapabilities().call(context('preview'), 'goals.delete', {}), /平台没有这个能力/);
  const calls: string[] = [];
  const service = hostCapabilities({ async generate(pluginId, input) { calls.push(pluginId + ':' + input.input); return { text: '真实回答' }; } }, item => item.namespace === 'installed');
  assert.match(String((await service.call(context('preview'), 'model.generate', ask) as { text: string }).text), /^［模型替身］/);
  assert.deepEqual(await service.call(context('installed'), 'model.generate', ask), { text: '真实回答' });
  assert.equal(calls.length, 1, 'only the live identity reached the model');
  for (let index = 1; index < MODEL_CALLS_PER_MINUTE; index++) await service.call(context('installed'), 'model.generate', ask);
  await assert.rejects(service.call(context('installed'), 'model.generate', ask), /一分钟内调用模型的次数太多/);
  assert.deepEqual(await service.call(context('installed', 'install-2'), 'model.generate', ask), { text: '真实回答' }, 'the budget is per installation');
  const broken = hostCapabilities({ async generate() { return { text: 1 } as unknown as { text: string }; } }, () => true);
  await assert.rejects(broken.call(context('installed'), 'model.generate', ask), /\$/, 'a malformed answer never reaches the plugin');
});

test('a plugin that waits on the model gets limits for one model call; others keep the defaults', () => {
  assert.deepEqual(capabilityLimits({ storage: ['read'] }), {});
  const limits = capabilityLimits({ storage: ['read', 'write'], capabilities: ['model.generate'] });
  assert.ok(limits.operationTimeoutMs! > 120_000 && limits.serviceTimeoutMs! > 120_000);
});

test('a query may not call the model: reads run whenever the page opens', () => {
  const design = { operations: [{ id: 'notes.explain', kind: 'query', input: {}, output: 'string', effects: { storage: ['read'], capabilities: ['model.generate'] }, examples: [{ input: {}, output: '' }] }],
    pages: [{ id: 'home', parts: [{ id: 'explain', intent: 'description', purpose: 'p', read: 'notes.explain' }] }], acceptance: [{ id: 'a', steps: ['expect explain x'] }] };
  assert.throws(() => expandDesign(design, { id: 'q', title: 't', description: 'd', rationale: 'r', journey: ['j'] }, 'io.molis.work.generated.x', 'r', []), /查询（query）不能调用模型/);
});

test('a plugin keeps only its newest model-call records', async () => {
  const { mkdtemp, writeFile, utimes, readdir, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'model-records-'));
  try {
    for (let index = 0; index < 5; index++) { const file = join(directory, 'r' + index + '.json'); await writeFile(file, '{}'); await utimes(file, 1000 + index, 1000 + index); }
    await writeFile(join(directory, 'note.txt'), 'kept');
    assert.equal(await keepNewestRecords(directory, 2), 3);
    assert.deepEqual((await readdir(directory)).sort(), ['note.txt', 'r3.json', 'r4.json']);
    assert.equal(await keepNewestRecords(join(directory, 'missing')), 0, 'no records yet is fine');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('operations that wait on the model get their own lane; everything else stays quick', () => {
  const contract = { operations: [
    { id: 'concepts.list', effects: { storage: ['read' as const] } },
    { id: 'concepts.ask', effects: { storage: ['read' as const], capabilities: ['model.generate'] } },
  ] };
  assert.deepEqual([...slowOperations(contract)], ['concepts.ask']);
});

test('goals: stand-ins for checks, real reads in a trial, real notes only once installed', async () => {
  const calls: string[] = [];
  const service = hostCapabilities({ async generate() { return { text: '' }; },
    goals: { async list(identity) { calls.push('list:' + identity.namespace); return [{ id: 'g1', title: '写完论文', status: 'active' }]; },
      async note(identity, input) { calls.push('note:' + identity.namespace + ':' + input.goalId); return { recorded: true }; } } },
    identity => identity.namespace === 'installed' || identity.installationId.startsWith('studio-preview:'));
  const at = (namespace: 'preview' | 'installed', installationId: string) => ({ identity: { projectId: 'p', installationId, pluginId: 'io.molis.work.generated.x', namespace }, signal: new AbortController().signal, operationId: 'o' });
  assert.deepEqual(await service.call(at('preview', 'checks:b1'), 'goals.list', {}), [{ id: 'goal-demo', title: '示例目标', status: 'active' }], 'gates see the stand-in');
  assert.deepEqual(await service.call(at('preview', 'studio-preview:b1'), 'goals.list', {}), [{ id: 'g1', title: '写完论文', status: 'active' }], 'a trial reads the real goals');
  assert.deepEqual(await service.call(at('preview', 'studio-preview:b1'), 'goals.note', { goalId: 'g1', text: '试一下' }), { recorded: true });
  assert.deepEqual(calls, ['list:preview'], 'a trial never writes a note');
  await service.call(at('installed', 'install-1'), 'goals.note', { goalId: 'g1', text: '今天读了两章' });
  assert.deepEqual(calls, ['list:preview', 'note:installed:g1']);
  await assert.rejects(service.call(at('installed', 'install-1'), 'goals.note', { goalId: '', text: 'x' }), /\$/, 'input is checked before anything is written');
  const bare = hostCapabilities({ async generate() { return { text: '' }; } }, () => true);
  await assert.rejects(bare.call(at('installed', 'install-1'), 'goals.list', {}), /还不能提供目标能力/);
});

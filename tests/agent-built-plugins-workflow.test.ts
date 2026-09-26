import assert from 'node:assert/strict';
import test from 'node:test';
import type { PluginPrivateStorage } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { BuilderAgentRecord, BuilderAgentRequest } from '../packages/contracts/src/services/agent-host.js';
import type { BuildCheckResult } from '../packages/contracts/src/platform/plugin-builder.js';
import { assertContract } from '../packages/plugin-sandbox/dist/index.js';
import { AgentBuilderWorkflow, type AgentBuild, type AgentBuilderPorts } from '../plugins/native/plugin-builder/src/index.js';

/** In-memory storage with the atomic replacement the Builder store requires. */
function memoryStorage(): PluginPrivateStorage {
  const values = new Map<string, string>();
  return {
    get: key => values.get(key) ?? null,
    set: (key, value) => { values.set(key, value); },
    delete: key => values.delete(key),
    compareAndSet: (key, expected, value) => { if ((values.get(key) ?? null) !== expected) return false; values.set(key, value); return true; },
  };
}

/** Stage one: a product-level proposal in the designer's authoring format. */
function proposal(id: string, title: string) {
  return { id, title, description: '记下想法并随时回看', rationale: '最短的录入与浏览路径', journey: ['写一条笔记', '在列表里看到它'],
    operations: [
      { id: 'notes.list', kind: 'query', description: '列出笔记', input: {}, output: [{ id: 'string', text: 'string' }] },
      { id: 'notes.add', kind: 'command', description: '添加笔记', input: { text: 'string(1..200) 笔记' }, output: { id: 'string' } },
    ],
    pages: [{ id: 'home', title, parts: [
      { id: 'title', intent: 'heading', purpose: '说明插件' },
      { id: 'editor', intent: 'input', purpose: '写一条笔记', uses: 'notes.add' },
      { id: 'notes', intent: 'collection', purpose: '浏览笔记', uses: 'notes.list' },
    ] }] };
}
const PROPOSALS = JSON.stringify({ summary: '两种录入方式', candidates: [proposal('quick', '快记'), proposal('board', '笔记板')] });
/** Stage two: the chosen proposal in full. */
function detail(title: string) {
  return JSON.stringify({ summary: '细化完成', design: { title, description: '记下想法并随时回看', journey: ['写一条笔记', '在列表里看到它'],
    operations: [
      { id: 'notes.list', kind: 'query', description: '列出笔记', input: {}, output: [{ id: 'string', text: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
      { id: 'notes.add', kind: 'command', description: '添加笔记', input: { text: 'string(1..200) 笔记' }, output: { id: 'string' }, effects: { storage: ['write'] }, examples: [{ input: { text: '第一条' }, includes: {} }] },
    ],
    pages: [{ id: 'home', title, parts: [
      { id: 'title', intent: 'heading', purpose: '说明插件', props: { title } },
      { id: 'editor', intent: 'input', purpose: '写一条笔记', props: { submitLabel: '添加' }, submit: 'notes.add' },
      { id: 'notes', intent: 'collection', purpose: '浏览笔记', props: { idField: 'id', titleField: 'text' }, read: 'notes.list' },
    ] }],
    acceptance: [{ id: 'add-note', description: '添加后能在列表里看到', steps: ['fill editor.text = hello', 'submit editor', 'expect notes hello'] }] } });
}

interface Harness { ports: AgentBuilderPorts; requests: BuilderAgentRequest[]; implemented: Set<string>; choices: number }
/** Designer answers are played back in order; the code agent "implements" the operation it is given. */
function harness(designerAnswers: string[], options: { jev?: string | Error } = {}): Harness {
  const requests: BuilderAgentRequest[] = [], implemented = new Set<string>();
  const state: Harness = { ports: undefined as unknown as AgentBuilderPorts, requests, implemented, choices: 0 };
  const record = (request: BuilderAgentRequest, output: string): BuilderAgentRecord => ({ id: crypto.randomUUID(), role: request.role, promptVersion: request.promptVersion,
    contractRevision: request.contractRevision, instruction: request.instruction, input: request.task, output, configuredModel: 'configured', reportedModels: ['reported'],
    phase: 'completed', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), activity: [], usage: [] });
  state.ports = {
    projectId: 'project', catalog: async () => [], models: async () => [{ provider_id: 'p', model_id: 'm', label: 'M' }],
    agent: async () => ({
      async run(request) {
        requests.push(request);
        if (request.role === 'designer') { const answer = designerAnswers.shift(); if (answer === undefined) throw new Error('no scripted designer answer'); return record(request, answer); }
        for (const id of request.operationIds ?? []) implemented.add(id);
        request.onActivity?.({ type: 'file', name: 'write', path: 'src/operations/0.ts', detail: 'wrote' });
        return record(request, 'done');
      },
      async close() {}, async records() { return []; },
    }),
    validateContract: contract => assertContract(contract),
    prepareBuild: async () => '/tmp/molis-build-fixture',
    check: async (_build, operationIds): Promise<BuildCheckResult> => {
      const passed = operationIds.every(id => implemented.has(id));
      return { passed, gates: [{ id: 'G5', passed, detail: passed ? 'tests passed' : 'operation not implemented' }], bundlePath: '/tmp/molis-build-fixture/plugin.mjs' };
    },
    call: async () => [], resetPreview: async () => {},
    choose: async question => {
      state.choices++;
      if (options.jev instanceof Error) throw options.jev;
      return { choice: options.jev ?? question.candidates.at(-1)!.key, model: 'jev-fixture', elapsedMs: 3, confidence: 0.8 };
    },
    selectionAvailable: () => true,
    browserAcceptance: async () => ({ passed: true, cases: [{ id: 'add-note', passed: true, detail: 'hello visible' }], at: new Date().toISOString() }),
    publish: async () => ({ directory: '/tmp/release', bundlePath: '/tmp/release/plugin.mjs', packagePath: '/tmp/release.tgz' }),
    installations: async () => [], lifecycle: async () => {},
  };
  return state;
}

async function until(workflow: AgentBuilderWorkflow, id: string, done: (build: AgentBuild) => boolean, timeoutMs = 5_000): Promise<AgentBuild> {
  const started = Date.now();
  for (;;) {
    const build = workflow.store.require(id);
    if (done(build)) return build;
    if (Date.now() - started > timeoutMs) throw new Error(`timed out in phase ${build.phase}: ${build.error ?? ''}`);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

test('designer answer wrapped in reasoning and broken JSON goes back once with the reason, then the build reaches ready and publishes', async () => {
  const h = harness(['<think>先想想用户要什么</think>{"candidates":[{"id":"quick",', '<think>修正</think>\n' + PROPOSALS, detail('笔记板')]);
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个随手记笔记的插件');
    let build = await until(workflow, created.id, value => value.phase === 'choosing' || value.phase === 'failed');
    assert.equal(build.phase, 'choosing', build.error ?? '');
    assert.equal(build.candidates.length, 2);
    const designerTasks = h.requests.filter(request => request.role === 'designer').map(request => JSON.parse(request.task));
    assert.equal(designerTasks.length, 2, 'one repair round');
    assert.equal(designerTasks[0].mode, 'propose');
    assert.equal(build.candidates[0]!.preview.parts.length, 3, 'a proposal carries enough to preview on the canvas');
    assert.equal(designerTasks[0].repair, undefined);
    assert.match(designerTasks[1].repair.validationError, /JSON/);
    assert.match(designerTasks[1].repair.previousAnswer, /<think>/, 'the model sees exactly what it answered');
    assert.ok(build.steps.some(step => step.action === 'repair' && /第 1 次/.test(step.label)), 'the repair round is visible');
    assert.equal(build.runs.filter(run => run.role === 'designer').length, 2);

    build = await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'board' }) as AgentBuild;
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    assert.equal(build.phase, 'ready', build.error ?? '');
    const detailTask = JSON.parse(h.requests.filter(request => request.role === 'designer').at(-1)!.task);
    assert.equal(detailTask.mode, 'detail'); assert.equal(detailTask.proposal.id, 'board', 'only the chosen proposal is designed in full');
    assert.deepEqual(build.design!.contract.operations[1]!.effects, { storage: ['read', 'write'] }, 'a command that writes also reads its storage');
    assert.deepEqual(build.nodes.map(node => [node.id, node.kind]), [['title', 'heading'], ['editor', 'form'], ['notes', 'table']]);
    const collection = build.steps.find(step => step.target === 'notes' && step.action === 'place');
    assert.equal(collection?.selection?.source, 'jev', 'three legal collection components: Jev chose');
    assert.equal(build.steps.find(step => step.target === 'title' && step.action === 'place')?.selection?.source, 'rule', 'a single legal component is a rule choice');
    assert.equal(h.choices, 1, 'Jev is only asked when there is a real choice');
    assert.deepEqual([...build.connected].sort(), ['notes.add', 'notes.list']);
    assert.equal(build.checks.global?.passed, true);
    assert.equal(build.browserResult?.passed, true);
    assert.deepEqual(h.requests.filter(request => request.role === 'coder').map(request => request.operationIds), [['notes.list'], ['notes.add']], 'one operation per code run');

    const release = await workflow.action(created.id, { action: 'publish', revision: build.revision });
    assert.equal((release as { version: number }).version, 1);
    await assert.rejects(workflow.action(created.id, { action: 'publish', revision: workflow.store.require(created.id).revision }), /没有新的改动/, 'an unchanged build is not published twice');
  } finally { await workflow.close(); }
});

test('a designer that keeps failing validation stops after three repairs with the host reason', async () => {
  const broken = JSON.stringify({ candidates: [proposal('only', '唯一')] });
  const h = harness([broken, broken, broken, broken, broken]);
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个笔记插件');
    const build = await until(workflow, created.id, value => value.phase === 'failed' || value.phase === 'choosing');
    assert.equal(build.phase, 'failed');
    assert.match(build.error ?? '', /2–3 个/);
    assert.equal(h.requests.length, 4, 'first answer plus three repairs, never more');
  } finally { await workflow.close(); }
});

test('clarification is one round; asking again is sent back as a repair and the step waits for the person', async () => {
  const questions = JSON.stringify({ questions: ['记录要不要分类？'] });
  const h = harness([questions, questions, PROPOSALS]);
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个笔记插件');
    let build = await until(workflow, created.id, value => value.phase === 'clarifying' || value.phase === 'failed');
    assert.equal(build.phase, 'clarifying');
    assert.equal(build.steps.find(step => step.agent === 'design' && step.action === 'design')?.status, 'waiting');
    assert.match(build.steps.find(step => step.agent === 'design' && step.action === 'design')?.label ?? '', /回答 1 个问题/);
    await workflow.action(created.id, { action: 'message', revision: build.revision, message: '不用分类' });
    build = await until(workflow, created.id, value => value.phase === 'choosing' || value.phase === 'failed');
    assert.equal(build.phase, 'choosing', build.error ?? '');
    assert.match(JSON.parse(h.requests.at(-1)!.task).repair.validationError, /澄清/);
  } finally { await workflow.close(); }
});

test('code-agent activity cannot grow the build record without bound', async () => {
  const h = harness([PROPOSALS, detail('快记')]);
  const run = h.ports.agent;
  // A long code run: every tool call is reported as activity.
  h.ports.agent = async (build, purpose) => {
    const agent = await run(build, purpose);
    return { ...agent, async run(request) {
      if (request.role === 'coder') for (let index = 0; index < 400; index++) request.onActivity?.({ type: 'tool', name: 'read', detail: 'src/a.ts' });
      return agent.run(request);
    } };
  };
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个笔记插件');
    let build = await until(workflow, created.id, value => value.phase === 'choosing');
    await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed', 20_000);
    assert.equal(build.phase, 'ready', build.error ?? '');
    assert.ok(build.steps.length <= 200, `steps ${build.steps.length}`);
    assert.ok(build.steps.some(step => step.agent === 'code' && step.action === 'verify'), 'milestones survive pruning');
    assert.ok(build.steps.some(step => step.agent === 'design'), 'design milestones survive pruning');
  } finally { await workflow.close(); }
});

test('a revision that only renames keeps working code and unchanged parts; the code agent is not called again', async () => {
  const h = harness([PROPOSALS, detail('快记'), detail('随手快记')]);
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个笔记插件');
    let build = await until(workflow, created.id, value => value.phase === 'choosing');
    await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    assert.equal(build.phase, 'ready', build.error ?? '');
    const coderRuns = h.requests.filter(request => request.role === 'coder').length;
    await workflow.action(created.id, { action: 'message', revision: build.revision, message: '把名字改成随手快记' });
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    assert.equal(build.phase, 'ready', build.error ?? '');
    const reviseTask = JSON.parse(h.requests.filter(request => request.role === 'designer').at(-1)!.task);
    assert.equal(reviseTask.mode, 'revise'); assert.equal(reviseTask.request, '把名字改成随手快记');
    assert.equal(reviseTask.current.title, '快记', 'the designer edits its own authoring answer');
    assert.equal(build.design!.title, '随手快记');
    assert.equal(h.requests.filter(request => request.role === 'coder').length, coderRuns, 'unchanged operations stay connected');
    assert.deepEqual([...build.connected].sort(), ['notes.add', 'notes.list']);
    assert.equal(build.history.length, 1, 'the previous design can be restored');
    assert.ok(build.steps.some(step => step.agent === 'design' && /主线已修订/.test(step.label)));
  } finally { await workflow.close(); }
});

test('a failed acceptance case goes back to the code agent with the operations it touches, then passes on the second run', async () => {
  const h = harness([PROPOSALS, detail('快记')]);
  let runs = 0;
  h.ports.browserAcceptance = async () => (++runs === 1
    ? { passed: false, cases: [{ id: 'add-note', passed: false, detail: 'Error: 验收等待超时' }], at: new Date().toISOString() }
    : { passed: true, cases: [{ id: 'add-note', passed: true, detail: 'ok' }], at: new Date().toISOString() });
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个笔记插件');
    let build = await until(workflow, created.id, value => value.phase === 'choosing');
    await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    assert.equal(build.phase, 'ready', build.error ?? '');
    assert.equal(runs, 2);
    const repair = h.requests.filter(request => request.role === 'coder' && request.promptVersion.startsWith('acceptance/'));
    assert.equal(repair.length, 1);
    assert.deepEqual([...repair[0]!.operationIds!].sort(), ['notes.add', 'notes.list'], 'the case fills the editor and reads the list');
    assert.equal(JSON.parse(repair[0]!.task).acceptanceFailure.description, '添加后能在列表里看到');
  } finally { await workflow.close(); }
});

test('acceptance that keeps failing stops with the case and a plain reason', async () => {
  const h = harness([PROPOSALS, detail('快记')]);
  h.ports.browserAcceptance = async () => ({ passed: false, cases: [{ id: 'add-note', passed: false, detail: 'Error: 验收等待超时\n    at check (<anonymous>:1:2)' }], at: new Date().toISOString() });
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个笔记插件');
    let build = await until(workflow, created.id, value => value.phase === 'choosing');
    await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, created.id, value => value.phase === 'failed' || value.phase === 'ready');
    assert.equal(build.phase, 'failed');
    assert.match(build.error ?? '', /界面验收「添加后能在列表里看到」仍未通过：界面上等了 20 秒仍没有出现预期的结果/);
    assert.doesNotMatch(build.error ?? '', /at check/);
    assert.equal(h.requests.filter(request => request.promptVersion.startsWith('acceptance/')).length, 2, 'two repair rounds, then the person decides');
  } finally { await workflow.close(); }
});

test('an acceptance failure where the data has the text but the part does not show it goes to the designer, not the code agent', async () => {
  const h = harness([PROPOSALS, detail('快记'), detail('快记')]);
  let runs = 0;
  h.ports.browserAcceptance = async () => (++runs === 1
    ? { passed: false, cases: [{ id: 'add-note', passed: false, detail: JSON.stringify({ step: 3, action: 'expect', componentId: 'notes', reason: '验收等待超时', visible: '全部笔记 选择', data: '[{"id":"n1","text":"hello"}]' }) }], at: new Date().toISOString() }
    : { passed: true, cases: [{ id: 'add-note', passed: true, detail: 'ok' }], at: new Date().toISOString() });
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个笔记插件');
    let build = await until(workflow, created.id, value => value.phase === 'choosing');
    await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    assert.equal(build.phase, 'ready', build.error ?? '');
    const revise = h.requests.filter(request => request.role === 'designer').map(request => JSON.parse(request.task)).find(task => task.mode === 'revise');
    assert.match(revise?.request ?? '', /只调整这个组件的显示设置/);
    assert.match(revise?.request ?? '', /「hello」/);
    assert.equal(h.requests.filter(request => request.promptVersion.startsWith('acceptance/')).length, 0, 'no code-agent round for a display problem');
    assert.ok(build.steps.some(step => step.label.startsWith('已按验收调整界面显示')));
  } finally { await workflow.close(); }
});

test('an expected text on a part that reads nothing goes to the designer as a wiring problem', async () => {
  const h = harness([PROPOSALS, detail('快记'), detail('快记')]);
  let runs = 0;
  h.ports.browserAcceptance = async () => (++runs === 1
    ? { passed: false, cases: [{ id: 'add-note', passed: false, detail: JSON.stringify({ step: 3, action: 'expect', componentId: 'editor', reason: '验收等待超时', visible: '写一条 保存', data: '' }) }], at: new Date().toISOString() }
    : { passed: true, cases: [{ id: 'add-note', passed: true, detail: 'ok' }], at: new Date().toISOString() });
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个笔记插件');
    let build = await until(workflow, created.id, value => value.phase === 'choosing');
    await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    assert.equal(build.phase, 'ready', build.error ?? '');
    const revise = h.requests.filter(request => request.role === 'designer').map(request => JSON.parse(request.task)).find(task => task.mode === 'revise');
    assert.match(revise?.request ?? '', /prefill:组件\.字段/);
    assert.equal(h.requests.filter(request => request.promptVersion.startsWith('acceptance/')).length, 0, 'the code agent cannot wire parts together');
  } finally { await workflow.close(); }
});

test('a change inside an operation that its contract cannot show still reaches the code agent, once, with the change', async () => {
  const reworked = JSON.stringify({ ...JSON.parse(detail('快记')), rework: [{ op: 'notes.add', why: '保存前去掉首尾空白，并把连续空格合成一个' }] });
  const h = harness([PROPOSALS, detail('快记'), reworked]);
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个笔记插件');
    let build = await until(workflow, created.id, value => value.phase === 'choosing');
    await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    const before = h.requests.filter(request => request.role === 'coder').length;
    await workflow.action(created.id, { action: 'message', revision: build.revision, message: '保存时把多余的空格去掉' });
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    assert.equal(build.phase, 'ready', build.error ?? '');
    const runs = h.requests.filter(request => request.role === 'coder').slice(before);
    assert.equal(runs.length, 1, 'the contract is unchanged, so only the reworked operation runs, even though its checks already pass');
    assert.deepEqual(runs[0]!.operationIds, ['notes.add']);
    assert.match(runs[0]!.promptVersion, /^revise\//);
    assert.equal(JSON.parse(runs[0]!.task).change, '保存前去掉首尾空白，并把连续空格合成一个');
    assert.equal(build.rework, undefined, 'done once connected');
    assert.ok(build.steps.some(step => /要改代码：「添加笔记」/.test(step.label)), 'people read what the function does, not its id');
  } finally { await workflow.close(); }
});


test('an expectation that joins a column label to a value goes to the designer, whatever the data holds', async () => {
  const labelled = JSON.stringify((() => { const answer = JSON.parse(detail('快记')); answer.design.pages[0].parts[2].props.columns = [{ field: 'text', label: '内容' }]; answer.design.acceptance[0].steps[2] = 'expect notes 内容 hello'; return answer; })());
  const h = harness([PROPOSALS, labelled, labelled]);
  let runs = 0;
  h.ports.browserAcceptance = async () => (++runs === 1
    ? { passed: false, cases: [{ id: 'add-note', passed: false, detail: JSON.stringify({ step: 3, action: 'expect', componentId: 'notes', reason: '验收等待超时', visible: '内容 hello', data: '[{"id":"n1","text":"hello"}]' }) }], at: new Date().toISOString() }
    : { passed: true, cases: [{ id: 'add-note', passed: true, detail: 'ok' }], at: new Date().toISOString() });
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个笔记插件');
    let build = await until(workflow, created.id, value => value.phase === 'choosing');
    await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    assert.equal(build.phase, 'ready', build.error ?? '');
    assert.equal(h.requests.filter(request => request.promptVersion.startsWith('acceptance/')).length, 0, 'no code-agent round');
  } finally { await workflow.close(); }
});

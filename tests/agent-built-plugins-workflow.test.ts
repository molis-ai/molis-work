import { openStudioChrome } from './fixtures/plugin-builder-browser.js';
import { serveHomeRuntime } from './fixtures/home-runtime.js';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { LOCAL_PERSON_ACTOR_ID, type ActionDefinition } from '@molis-ai/molis-work-contracts/platform/actions';
import { verifyPluginPackageSignature } from '@molis-ai/molis-work-plugin-runtime';
import { studioFrameAsset, framedStudioPage, isolatedStudioHarness } from "./fixtures/studio-framed-page.js";
import { pluginPagesFor, sendLocalWebJson, authorizeLocalWebRequest, HomeConsentLedger, type LocalMutationState } from "@molis-ai/molis-work-app-local-host";
import { memoryStorage, proposal, detail, experience, finding, detailUsing, proposalsUsing, detailWithFour, composition, PROPOSALS, CAPABILITY_WORDS, COMPONENT_WORDS, GOALS_CATALOG, until } from './fixtures/builder-workflow-design.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { BuilderAgentRecord, BuilderAgentRequest } from '@molis-ai/molis-work-contracts/services/agent-host';
import type { BuildCheckResult } from '@molis-ai/molis-work-contracts/platform/plugin-builder';
import { DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from '@molis-ai/molis-work-app-local-host';
import { assertContract } from '@molis-ai/molis-work-plugin-sandbox';
import { AgentBuilderWorkflow, BUILDER_CHOOSE_CAPABILITY, BUILDER_CHOOSE_COMPONENT, BUILDER_PROMPTS, setModelRetryWaits, type AgentBuild, type AgentBuilderPorts, type AgentRelease } from '@molis-ai/molis-work-plugin-builder';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentDefinitionsFor } from '../apps/local-host/dist/agent-definitions/agent-definitions.js';
import { builtinRegistrations } from '../apps/local-host/dist/agent-definitions/builtin-registrations.js';
import { builderInstructions, builderPrompts, handleAgentStudioHttp, releaseAgentStudio } from '../apps/local-host/dist/plugin-builder/agent-surface.js';
import { releaseInstalledPlugins } from '../apps/local-host/dist/installed-plugin-host.js';
import { agentStudioFixture } from '../scripts/agent-studio-preview-fixture.mjs';
import { builderSkill } from '../apps/local-host/dist/plugin-builder/skill.js';
import { acceptExperience } from '../plugins/native/plugin-builder/dist/agent-experience.js';

const publicationAuthority = { signal: new AbortController().signal, beforeEffect: async () => {}, assert_authority_current() {} };

/** In-memory storage with the atomic replacement the Builder store requires. */

/** Stage one: a product-level proposal in the designer's authoring format. */

/** Stage two: the chosen proposal in full. */

interface Harness { ports: AgentBuilderPorts; requests: BuilderAgentRequest[]; implemented: Set<string>; choices: number; /** The instructions of each question Jev was asked. */ asked: string[] }
/** Designer answers are played back in order; the code agent "implements" the operation it is given. */
function harness(designerAnswers: string[], options: { jev?: string | Error } = {}): Harness {
  const requests: BuilderAgentRequest[] = [], implemented = new Set<string>();
  const state: Harness = { ports: undefined as unknown as AgentBuilderPorts, requests, implemented, choices: 0, asked: [] };
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
      state.asked.push(question.instructions);
      if (options.jev instanceof Error) throw options.jev;
      // The scripted pick where it is a candidate; otherwise the last legal one.
      const pick = options.jev && question.candidates.some(candidate => candidate.key === options.jev) ? options.jev : question.candidates.at(-1)!.key;
      return { choice: pick, model: 'jev-fixture', elapsedMs: 3, confidence: 0.8 };
    },
    selectionAvailable: () => true,
    browserAcceptance: async () => ({ passed: true, cases: [{ id: 'add-note', passed: true, detail: 'hello visible' }], at: new Date().toISOString() }),
    publish: async (_build, _manifest, _bundle, version, control) => control.commit({ directory: '/tmp/release/v' + version, bundlePath: '/tmp/release/v' + version + '/plugin.mjs', packagePath: '/tmp/release/v' + version, prompts: [] }),
    installations: async () => [], lifecycle: async () => {},
  };
  return state;
}

/** What the workflow said to Jev before the two sentences were registered, word for word. */

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
    // Parts are UI catalog components; the fixture Jev takes the last legal one.
    assert.deepEqual(build.nodes.map(node => [node.id, node.kind]), [['title', 'frame'], ['editor', 'dialog'], ['notes', 'accordion']]);
    const collection = build.steps.find(step => step.target === 'notes' && step.action === 'place');
    assert.deepEqual(collection?.selection?.candidates, ['directory', 'card', 'table', 'accordion'], 'the catalog components that can show a list');
    assert.equal(collection?.selection?.source, 'jev', 'several legal collection components: Jev chose');
    assert.equal(build.steps.find(step => step.target === 'title' && step.action === 'place')?.selection?.source, 'rule', 'a single legal component is a rule choice');
    assert.equal(h.choices, 2, 'Jev is only asked when there is a real choice: the form and the list, not the frame');
    assert.deepEqual(h.asked, [COMPONENT_WORDS, COMPONENT_WORDS], 'both questions use the registered default, which reads as the workflow always said it');
    assert.deepEqual([...build.connected].sort(), ['notes.add', 'notes.list']);
    assert.equal(build.checks.global?.passed, true);
    assert.equal(build.browserResult?.passed, true);
    assert.deepEqual(h.requests.filter(request => request.role === 'coder').map(request => request.operationIds), [['notes.add'], ['notes.list']], 'one operation per code run; the one that writes the data goes first');

    const release = await workflow.action(created.id, { action: 'publish', revision: build.revision }, publicationAuthority);
    assert.equal((release as { version: number }).version, 1);
    await assert.rejects(workflow.action(created.id, { action: 'publish', revision: workflow.store.require(created.id).revision }, publicationAuthority), /没有新的改动/, 'an unchanged build is not published twice');
  } finally { await workflow.close(); }
});

test('the designer runs the person’s edit from “Prompt 与 Character”, and its run records that version', async () => {
  const home = mkdtempSync(join(tmpdir(), 'molis-builder-prompts-'));
  try {
    const registry = agentDefinitionsFor(home, builtinRegistrations);
    registry.save('io.molis.work.plugin-builder/builder-designer', BUILDER_PROMPTS.designer.text + '\n所有候选都用暖色。', null, 'person');
    const h = harness([PROPOSALS]);
    const workflow = new AgentBuilderWorkflow(memoryStorage(), { ...h.ports, prompt: builderPrompts(home) });
    try {
      const created = workflow.create('做一个随手记笔记的插件');
      const build = await until(workflow, created.id, value => value.phase === 'choosing' || value.phase === 'failed');
      assert.equal(build.phase, 'choosing', build.error ?? '');
      const designer = h.requests.find(request => request.role === 'designer')!;
      assert.match(designer.instruction, /所有候选都用暖色。$/);
      assert.equal(designer.promptVersion, BUILDER_PROMPTS.designer.version + '+user.1');
      assert.equal(build.runs.find(run => run.role === 'designer')?.promptVersion, BUILDER_PROMPTS.designer.version + '+user.1', 'the run record says which text ran');
      assert.equal(registry.uses('io.molis.work.plugin-builder/builder-designer')[0]?.user_revision, 1, 'the register records the use');
      registry.reset('io.molis.work.plugin-builder/builder-designer', 1, 'person');
      assert.deepEqual(builderPrompts(home)('designer', BUILDER_PROMPTS.designer), BUILDER_PROMPTS.designer, 'after “恢复默认” the shipped text runs again');
    } finally { await workflow.close(); }
  } finally { rmSync(home, { recursive: true, force: true }); }
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

test('experience, UI and screenshot review use the registered user prompts and record their revisions', async () => {
  const home = mkdtempSync(join(tmpdir(), 'molis-builder-visual-prompts-'));
  const stages = ['experience', 'ui', 'review'] as const;
  const registry = agentDefinitionsFor(home, builtinRegistrations);
  const h = harness([PROPOSALS, experience(), detail('阅读'), composition(), JSON.stringify({ issues: [] })]);
  h.ports.presentation = true; h.ports.selectionAvailable = () => false;
  h.ports.visionAvailable = () => true;
  h.ports.inspectPresentation = async () => ({ structural: true, issues: [], images: [] });
  const workflow = new AgentBuilderWorkflow(memoryStorage(), { ...h.ports, prompt: builderPrompts(home) });
  try {
    for (const stage of stages) registry.save('io.molis.work.plugin-builder/builder-' + stage, BUILDER_PROMPTS[stage].text + '\n已登记的用户修改：' + stage, null, 'person');
    const { id } = workflow.create('阅读并记录');
    let build = await until(workflow, id, value => value.phase === 'choosing');
    await workflow.action(id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, id, value => ['ready', 'failed'].includes(value.phase));
    assert.equal(build.phase, 'ready', build.error ?? '');
    assert.equal(build.visualResult?.status, 'reviewed');
    for (const stage of stages) {
      const version = BUILDER_PROMPTS[stage].version + '+user.1';
      const request = h.requests.find(request => request.promptVersion === version);
      assert.ok(request, stage + ' must resolve the registered prompt');
      assert.ok(request.instruction.endsWith('已登记的用户修改：' + stage));
      assert.ok(build.runs.some(run => run.promptVersion === version));
      assert.equal(registry.uses('io.molis.work.plugin-builder/builder-' + stage)[0]?.user_revision, 1);
    }
  } finally { await workflow.close(); rmSync(home, { recursive: true, force: true }); }
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

/** The detailed design, with `notes.add` also writing a note through another plugin's capability. */

/** A project where the Goals plugin offers `goals.note` but is not enabled until the person says so. */
function withDisabledPlugin(h: Harness) {
  const enabled: string[] = [];
  h.ports.catalog = async () => [{ id: 'goals.note', title: '记录目标便笺', source: '目标（这个项目还没启用）', description: '给目标写一条便笺', effect: 'write', input: { type: 'object' } }];
  h.ports.missingPlugins = async design => enabled.includes('goals') || !design.contract.operations.some(operation => operation.effects.capabilities?.includes('goals.note')) ? []
    : [{ pluginId: 'goals', title: '目标', capabilities: ['记录目标便笺'] }];
  h.ports.enablePlugins = async ids => { enabled.push(...ids); };
  return enabled;
}

test('a design that uses a plugin the project has not enabled waits for the person; enabling it continues the same build', async () => {
  const h = harness([PROPOSALS, detailUsing('快记', 'goals.note')]);
  const enabled = withDisabledPlugin(h);
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个笔记插件，写下的笔记同时记到目标上');
    let build = await until(workflow, created.id, value => value.phase === 'choosing');
    await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, created.id, value => !!value.pendingPlugins?.length || value.phase === 'ready' || value.phase === 'failed');
    assert.equal(build.phase, 'paused');
    assert.deepEqual(build.pendingPlugins, [{ pluginId: 'goals', title: '目标', capabilities: ['记录目标便笺'] }]);
    assert.equal(h.requests.filter(request => request.role === 'coder').length, 0, 'nothing is built before the person decides');
    assert.equal(build.steps.find(step => step.action === 'decide')?.status, 'waiting');

    // Resuming does not slip past the question.
    await workflow.action(created.id, { action: 'resume', revision: build.revision });
    build = await until(workflow, created.id, value => !value.active);
    assert.equal(build.phase, 'paused'); assert.equal(build.pendingPlugins?.length, 1);
    assert.equal(h.requests.filter(request => request.role === 'coder').length, 0);

    await workflow.action(created.id, { action: 'enable-plugins', revision: build.revision });
    assert.deepEqual(enabled, ['goals']);
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    assert.equal(build.phase, 'ready', build.error ?? '');
    assert.equal(build.pendingPlugins, undefined);
    assert.deepEqual(build.design!.contract.operations[1]!.effects.capabilities, ['goals.note'], 'the design keeps the plugin it asked for');
    assert.match(build.steps.find(step => step.action === 'decide')!.label, /已启用「目标」/);
    await assert.rejects(workflow.action(created.id, { action: 'enable-plugins', revision: build.revision }), /没有等待启用的插件/);
  } finally { await workflow.close(); }
});

test('declining the plugin sends the design back to the designer without it', async () => {
  const h = harness([PROPOSALS, detailUsing('快记', 'goals.note'), detailUsing('快记')]);
  const enabled = withDisabledPlugin(h);
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个笔记插件，写下的笔记同时记到目标上');
    let build = await until(workflow, created.id, value => value.phase === 'choosing');
    await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, created.id, value => !!value.pendingPlugins?.length || value.phase === 'failed');
    await workflow.action(created.id, { action: 'skip-plugins', revision: build.revision });
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    assert.equal(build.phase, 'ready', build.error ?? '');
    assert.deepEqual(enabled, [], 'nothing was enabled');
    const revise = h.requests.filter(request => request.role === 'designer').map(request => JSON.parse(request.task)).find(task => task.mode === 'revise');
    assert.match(revise?.request ?? '', /不要使用「目标」的能力（记录目标便笺）/);
    assert.equal(build.design!.contract.operations[1]!.effects.capabilities, undefined);
    assert.equal(build.steps.find(step => step.action === 'decide')?.status, 'cancelled');
  } finally { await workflow.close(); }
});

/** Proposals whose "add" names Goals' note capability for writing a weekly progress line. */

test('capabilities are settled before the full design: Jev picks among the provider\'s legal alternatives and the design is written against the pick', async () => {
  const h = harness([proposalsUsing('goals.note'), detailUsing('快记', 'goals.progress.record')], { jev: 'goals.progress.record' });
  h.ports.catalog = async () => GOALS_CATALOG;
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个周报，给目标写本周进展');
    let build = await until(workflow, created.id, value => value.phase === 'choosing' || value.phase === 'failed');
    await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    assert.equal(build.phase, 'ready', build.error ?? '');
    const pick = build.steps.find(step => step.action === 'place' && step.agent === 'design');
    assert.deepEqual(pick?.selection?.candidates, ['goals.note', 'goals.progress.record'], 'only same-provider, same-kind, close alternatives; archiving is not one');
    assert.equal(pick?.selection?.source, 'jev'); assert.equal(pick?.selection?.choice, 'goals.progress.record');
    assert.match(pick?.detail ?? '', /原本选的是 goals\.note/);
    assert.equal(h.asked[0], CAPABILITY_WORDS, 'the capability question comes first and uses the registered default, which reads as the workflow always said it');
    assert.ok(h.asked.length > 1 && h.asked.slice(1).every(words => words === COMPONENT_WORDS), 'the parts that follow are asked the component question');
    const detailTask = h.requests.filter(request => request.role === 'designer').map(request => JSON.parse(request.task)).find(task => task.mode === 'detail');
    assert.deepEqual(detailTask.proposal.operations[1].effects, { capabilities: ['goals.progress.record'] }, 'the full design is told the settled capability');
    assert.ok(detailTask.capabilities.some((entry: { id: string }) => entry.id === 'goals.progress.record'), 'and sees it in full');
    assert.equal(build.candidates.find(item => item.id === 'quick')!.preview.contract.operations[1]!.effects.capabilities![0], 'goals.note', 'the stored proposal stays as the designer wrote it');
  } finally { await workflow.close(); }
});

test('when Jev cannot pick a capability, the designer\'s choice stands and the build goes on', async () => {
  const h = harness([proposalsUsing('goals.note'), detailUsing('快记', 'goals.note')], { jev: new Error('Jev 不在线') });
  h.ports.catalog = async () => GOALS_CATALOG;
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个周报，给目标写本周进展');
    let build = await until(workflow, created.id, value => value.phase === 'choosing' || value.phase === 'failed');
    await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed' || !!value.pendingPart);
    const pick = build.steps.find(step => step.action === 'place' && step.agent === 'design');
    assert.equal(pick?.selection?.source, 'rule'); assert.equal(pick?.selection?.choice, 'goals.note');
    assert.match(pick?.detail ?? '', /沿用主线设计的选择/);
  } finally { await workflow.close(); }
});

/** The detailed design with two more queries, each shown by its own part: four operations in all. */

test('operations are written side by side after the one that writes the data; each parallel run may write only its own files', async () => {
  const h = harness([PROPOSALS, detailWithFour('快记')]);
  const base = h.ports.agent, order: string[] = [];
  let running = 0, most = 0;
  h.ports.agent = async (build, purpose) => { const agent = await base(build, purpose); return { ...agent, async run(request) {
    if (request.role !== 'coder') return agent.run(request);
    running++; most = Math.max(most, running); order.push(request.operationIds![0]!);
    try { await new Promise(resolve => setTimeout(resolve, 30)); return await agent.run(request); } finally { running--; }
  } }; };
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个笔记插件');
    let build = await until(workflow, created.id, value => value.phase === 'choosing');
    await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    assert.equal(build.phase, 'ready', build.error ?? '');
    assert.equal(order[0], 'notes.add', 'the data writer goes alone first');
    assert.equal(most, 3, 'the other three are written at once');
    const coder = h.requests.filter(request => request.role === 'coder');
    assert.equal(coder[0]!.writable, undefined, 'the first may also write a shared module');
    for (const request of coder.slice(1)) { const index = build.design!.contract.operations.findIndex(item => item.id === request.operationIds![0]); assert.deepEqual(request.writable, ['src/operations/' + index + '.ts', 'tests/operations/' + index + '.ts']); }
    assert.deepEqual([...build.connected].sort(), ['notes.add', 'notes.count', 'notes.latest', 'notes.list']);
  } finally { await workflow.close(); }
});

test('with parallel set to 1, operations are written one after another as before', async () => {
  const h = harness([PROPOSALS, detailWithFour('快记')]);
  h.ports.parallel = 1;
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个笔记插件');
    let build = await until(workflow, created.id, value => value.phase === 'choosing');
    await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    assert.equal(build.phase, 'ready', build.error ?? '');
    assert.deepEqual(h.requests.filter(request => request.role === 'coder').map(request => request.operationIds![0]), ['notes.list', 'notes.add', 'notes.count', 'notes.latest']);
    assert.ok(h.requests.filter(request => request.role === 'coder').every(request => request.writable === undefined));
  } finally { await workflow.close(); }
});

test('after the host restarts mid-build, continuing writes only what was not connected yet', async () => {
  const storage = memoryStorage(), h = harness([PROPOSALS, detailWithFour('快记')]);
  const base = h.ports.agent;
  let stuck = true;
  // One operation's code agent is still working when the host stops.
  h.ports.agent = async (build, purpose) => { const agent = await base(build, purpose); return { ...agent, async run(request) {
    if (stuck && request.operationIds?.[0] === 'notes.latest') await new Promise((_, reject) => request.signal?.addEventListener('abort', () => reject(new Error('stopped')), { once: true }));
    return agent.run(request);
  } }; };
  let workflow = new AgentBuilderWorkflow(storage, h.ports);
  const created = workflow.create('做一个笔记插件');
  let build = await until(workflow, created.id, value => value.phase === 'choosing');
  await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
  await until(workflow, created.id, value => value.connected.length === 3);
  await workflow.close();
  stuck = false;
  workflow = new AgentBuilderWorkflow(storage, h.ports);
  try {
    build = workflow.store.require(created.id);
    assert.equal(build.phase, 'paused'); assert.match(build.error ?? '', /宿主已重启/);
    const before = h.requests.filter(request => request.role === 'coder').length;
    await workflow.action(created.id, { action: 'resume', revision: build.revision });
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    assert.equal(build.phase, 'ready', build.error ?? '');
    assert.deepEqual(h.requests.filter(request => request.role === 'coder').slice(before).map(request => request.operationIds![0]), ['notes.latest'], 'only the unfinished operation is written again');
  } finally { await workflow.close(); }
});

test('with an image service each proposal gets one picture (never a second try); choosing does not wait for them; without one nothing changes', async () => {
  const h = harness([PROPOSALS, detail('快记')]);
  const draws: Array<{ key: string; prompt: string }> = [];
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  h.ports.mockups = { available: async () => true, async draw(request) { draws.push(request); await gate; return request.key.endsWith(':quick') ? { jobId: 'job-1', imageId: 'img-1' } : { reason: '服务返回 429' }; } };
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个笔记插件');
    let build = await until(workflow, created.id, value => value.phase === 'choosing' && value.candidates.every(item => item.mockup?.status === 'drawing'));
    assert.equal(draws.length, 2); assert.match(draws[0]!.prompt, /UI mockup/); assert.match(draws[0]!.prompt, /快记|笔记板/);
    const seen = build.revision;
    release();
    build = await until(workflow, created.id, value => value.candidates.every(item => item.mockup?.status !== 'drawing'));
    assert.deepEqual(build.candidates.map(item => item.mockup), [{ status: 'ready', jobId: 'job-1', imageId: 'img-1' }, { status: 'failed', reason: '服务返回 429' }]);
    assert.equal(draws.length, 2, 'a failed picture is not asked for again');
    // The person chose from the page they saw before the pictures arrived.
    await workflow.action(created.id, { action: 'choose', revision: seen, candidateId: 'quick' });
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    assert.equal(build.phase, 'ready', build.error ?? '');
  } finally { await workflow.close(); }

  const plain = harness([PROPOSALS]);
  let asked = 0;
  plain.ports.mockups = { available: async () => false, async draw() { asked++; return { reason: 'x' }; } };
  const other = new AgentBuilderWorkflow(memoryStorage(), plain.ports);
  try {
    const created = other.create('做一个笔记插件');
    const build = await until(other, created.id, value => value.phase === 'choosing');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(asked, 0); assert.ok(other.store.require(build.id).candidates.every(item => item.mockup === undefined), 'no image service: the proposals are as before');
  } finally { await other.close(); }
});

test('a fix for a failed acceptance case that breaks a check goes back for repair instead of ending the build', async () => {
  const h = harness([PROPOSALS, detail('快记')]);
  let runs = 0, broken = false;
  h.ports.browserAcceptance = async () => (++runs === 1
    ? { passed: false, cases: [{ id: 'add-note', passed: false, detail: 'Error: 验收等待超时' }], at: new Date().toISOString() }
    : { passed: true, cases: [{ id: 'add-note', passed: true, detail: 'ok' }], at: new Date().toISOString() });
  const base = h.ports.agent, check = h.ports.check;
  // The acceptance fix leaves a check failing; the repair run that follows mends it.
  h.ports.agent = async (build, purpose) => { const agent = await base(build, purpose); return { ...agent, async run(request) {
    if (request.promptVersion.startsWith('acceptance/')) broken = true; else if (request.promptVersion.startsWith('repair/')) broken = false;
    return agent.run(request);
  } }; };
  h.ports.check = async (build, ids, signal) => broken ? { passed: false, gates: [{ id: 'G5', passed: false, detail: 'Undeclared or unapproved storage: read' }] } : check(build, ids, signal);
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个笔记插件');
    let build = await until(workflow, created.id, value => value.phase === 'choosing');
    await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    assert.equal(build.phase, 'ready', build.error ?? '');
    const repair = h.requests.filter(request => request.role === 'coder' && request.promptVersion.startsWith('repair/'));
    assert.equal(repair.length, 1); assert.match(JSON.parse(repair[0]!.task).failure.gates[0].detail, /storage: read/);
  } finally { await workflow.close(); }
});

test('code that needs a capability the contract does not declare goes back to the designer to declare it, then the build finishes', async () => {
  const withBoth = JSON.parse(detailUsing('快记', 'goals.progress.record')); withBoth.design.operations[1].effects.capabilities = ['goals.progress.record', 'goals.list'];
  const h = harness([proposalsUsing('goals.progress.record'), detailUsing('快记', 'goals.progress.record'), JSON.stringify(withBoth)], { jev: 'goals.progress.record' });
  h.ports.catalog = async () => GOALS_CATALOG;
  const check = h.ports.check;
  h.ports.check = async (build, ids, signal) => {
    const add = build.design!.contract.operations.find(item => item.id === 'notes.add')!;
    if (ids.includes('notes.add') && !add.effects.capabilities?.includes('goals.list')) return { passed: false, gates: [{ id: 'G5', passed: false, detail: 'Undeclared or unapproved capabilities: goals.list' }] };
    return check(build, ids, signal);
  };
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个周报，给目标写本周进展');
    let build = await until(workflow, created.id, value => value.phase === 'choosing');
    await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    assert.equal(build.phase, 'ready', build.error ?? '');
    assert.deepEqual(build.design!.contract.operations[1]!.effects.capabilities, ['goals.list', 'goals.progress.record']);
    const revise = h.requests.filter(request => request.role === 'designer').map(request => JSON.parse(request.task)).find(task => task.mode === 'revise');
    assert.match(revise?.request ?? '', /notes\.add 的代码需要调用能力 goals\.list/);
    assert.ok(build.steps.some(step => step.agent === 'host' && /合同里没有声明/.test(step.label)));
  } finally { await workflow.close(); }
});

test('a query reading another plugin runs once on real data before ready; a real error goes to the code agent and is tried again', async () => {
  const reading = JSON.parse(detail('快记')); reading.design.operations[0].effects.capabilities = ['goals.list']; reading.design.operations[0].description = '列出目标';
  const h = harness([PROPOSALS, JSON.stringify(reading)]);
  h.ports.catalog = async () => GOALS_CATALOG;
  let real = 0;
  h.ports.call = async (_build, operationId) => { if (operationId === 'notes.list' && ++real === 1) throw new Error('此对象尚未提供可读取的上下文'); return []; };
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个笔记插件');
    let build = await until(workflow, created.id, value => value.phase === 'choosing');
    await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    assert.equal(build.phase, 'ready', build.error ?? '');
    assert.equal(real, 2, 'tried on real data, then again after the fix');
    const fix = h.requests.filter(request => request.role === 'coder').map(request => JSON.parse(request.task)).find(task => task.failure?.gates?.[0]?.id === 'G7');
    assert.match(fix.failure.gates[0].detail, /真实数据读取时出错：此对象尚未提供可读取的上下文/);
    assert.ok(build.steps.some(step => step.label === '已按真实数据修正'));
  } finally { await workflow.close(); }
});

test('a dropped connection during coding is asked again and does not use up a repair round', async () => {
  const h = harness([PROPOSALS, detail('快记')]);
  const base = h.ports.agent;
  let dropped = 0;
  h.ports.agent = async (build, purpose) => { const agent = await base(build, purpose); return { ...agent, async run(request) {
    if (request.role === 'coder' && dropped++ === 0) throw new TypeError('fetch failed');
    return agent.run(request);
  } }; };
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个笔记插件');
    let build = await until(workflow, created.id, value => value.phase === 'choosing');
    await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed', 20_000);
    assert.equal(build.phase, 'ready', build.error ?? '');
    assert.ok(build.steps.some(step => step.agent === 'code' && /网络中断，重新请求/.test(step.label)));
    assert.ok(!build.steps.some(step => /这一轮没有完成/.test(step.label)), 'the dropped run is not a failed round');
    assert.ok(!build.steps.some(step => /修正「/.test(step.label)), 'no repair round was spent on it');
  } finally { await workflow.close(); }
});

test('a model that stays unreachable stops the build with a reason, without spending repair rounds', async () => {
  // Real outage (W8 round 7): six minutes of "fetch failed" and one "could not be resolved" used up three repair rounds.
  const h = harness([PROPOSALS, detail('快记')]);
  const base = h.ports.agent;
  h.ports.agent = async (build, purpose) => { const agent = await base(build, purpose); return { ...agent, async run(request) {
    if (request.role === 'coder') throw new Error('That host could not be resolved; nothing was sent.');
    return agent.run(request);
  } }; };
  setModelRetryWaits([5, 5, 5]);
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个笔记插件');
    let build = await until(workflow, created.id, value => value.phase === 'choosing');
    await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, created.id, value => value.phase === 'failed' || value.phase === 'ready', 15_000);
    assert.equal(build.phase, 'failed');
    assert.match(build.error ?? '', /连接模型持续中断.*点「继续」/);
    assert.equal(build.steps.filter(step => /网络中断，重新请求/.test(step.label)).length, 3);
    assert.ok(!build.steps.some(step => /修正「|这一轮没有完成/.test(step.label)), 'no repair round was spent on the outage');
  } finally { setModelRetryWaits([5_000, 15_000, 30_000]); await workflow.close(); }
});

test('a dropped connection to the model is asked again rather than failing the design', async () => {
  const h = harness([PROPOSALS, detail('快记')]);
  const base = h.ports.agent;
  let dropped = 0;
  h.ports.agent = async (build, purpose) => { const agent = await base(build, purpose); return { ...agent, async run(request) {
    if (request.role === 'designer' && dropped++ === 1) throw new TypeError('fetch failed');
    return agent.run(request);
  } }; };
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('做一个笔记插件');
    let build = await until(workflow, created.id, value => value.phase === 'choosing');
    await workflow.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed', 15_000);
    assert.equal(build.phase, 'ready', build.error ?? '');
    assert.ok(build.steps.some(step => /网络中断，重新请求/.test(step.label)));
  } finally { await workflow.close(); }
});

for (const structural of [true, false]) test('a failed visual suggestion keeps a working version only when structure was sound: ' + structural, async () => {
  const h = harness([PROPOSALS, experience(), detail('阅读'), composition(), JSON.stringify({ issues: [finding()] }), composition('tight')]);
  h.ports.presentation = true; h.ports.selectionAvailable = () => false; h.ports.visionAvailable = () => true;
  h.ports.inspectPresentation = async () => ({ structural, issues: structural ? [] : ['主操作被遮挡'], images: [{ label: 'sample', bytes: new Uint8Array([1]) }] });
  let acceptances = 0;
  h.ports.browserAcceptance = async () => ({ passed: ++acceptances === 1, cases: [{ id: 'add-note', passed: acceptances === 1, detail: '交互结果' }], at: '' });
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const { id } = workflow.create('阅读'); let build = await until(workflow, id, value => value.phase === 'choosing');
    await workflow.action(id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, id, value => ['ready', 'failed'].includes(value.phase));
    assert.equal(build.phase, structural ? 'ready' : 'failed');
    if (structural) {
      assert.equal(build.browserResult?.passed, true);
      assert.equal((build.design!.presentation!.pages[0]!.layout as {gap:string}).gap, 'roomy');
      assert.ok(build.visualResult?.issues.some(issue => issue.includes('保留通过验收')));
    } else assert.match(build.error ?? '', /交互验收未通过/);
    assert.equal(acceptances, 2);
  } finally { await workflow.close(); }
});

test('whole-page design survives Jev failure; visual revision and undo keep the checked backend and release the exact presentation', async () => {
  const h = harness([PROPOSALS, experience(), detail('阅读'), composition(), composition('tight')], { jev: new Error('offline') });
  h.ports.presentation = true;
  // Capability selection is irrelevant to this local-only design.
  h.ports.inspectPresentation = async () => ({ structural: true, issues: [], images: [] });
  let prepared = 0, checked = 0;
  const prepare = h.ports.prepareBuild, check = h.ports.check;
  h.ports.prepareBuild = async (...args) => { prepared++; return prepare(...args); };
  h.ports.check = async (...args) => { checked++; return check(...args); };
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const { id } = workflow.create('阅读摘记'); let build = await until(workflow, id, b => b.phase === 'choosing');
    await workflow.action(id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, id, b => ['ready', 'failed'].includes(b.phase)); assert.equal(build.phase, 'ready', build.error ?? '');
    assert.equal(build.nodes.find(n => n.id === 'editor')?.kind, 'sheet');
    assert.equal(build.steps.find(s => s.target === 'editor' && s.action === 'place')?.selection?.source, 'design');
    assert.equal(build.visualResult?.status, 'unavailable');
    assert.equal(build.visualResult?.structural, true);
    const original = structuredClone(build), counts = [prepared, checked, h.requests.filter(r => r.role === 'coder').length];
    await workflow.action(id, { action: 'publish', revision: build.revision }, publicationAuthority);
    await workflow.action(id, { action: 'visual', revision: workflow.store.require(id).revision, message: '收紧间距' });
    build = await until(workflow, id, b => ['ready', 'failed'].includes(b.phase)); assert.equal(build.phase, 'ready', build.error ?? '');
    assert.deepEqual([prepared, checked, h.requests.filter(r => r.role === 'coder').length], counts, 'no new backend directory, build or coder');
    assert.deepEqual(build.design!.contract, original.design!.contract);
    assert.deepEqual(build.connected, original.connected);
    assert.notDeepEqual(build.design!.presentation, original.design!.presentation);
    await workflow.action(id, { action: 'publish', revision: build.revision }, publicationAuthority);
    assert.deepEqual(workflow.store.versions(id)[0]!.design.presentation, build.design!.presentation);
    await workflow.action(id, { action: 'undo', revision: workflow.store.require(id).revision });
    assert.deepEqual(workflow.store.require(id).design!.presentation, original.design!.presentation);
    assert.deepEqual([prepared, checked, h.requests.filter(r => r.role === 'coder').length], counts);
    await workflow.action(id, { action: 'visual', message: '本次模拟模型没有给出可用结果' });
    const failed = await until(workflow, id, value => value.phase === 'failed');
    assert.ok(failed.error);
    await workflow.action(id, { action: 'undo', revision: failed.revision });
    assert.equal(workflow.store.require(id).phase, 'ready');
    assert.equal(workflow.store.require(id).error, null);
    assert.deepEqual(workflow.store.require(id).design!.presentation, original.design!.presentation);
  } finally { await workflow.close(); }
});

test('visual model review has one repair and one confirmation; a stale cancelled visual result cannot commit', async () => {
  const h = harness([PROPOSALS, experience(), detail('阅读'), composition(), JSON.stringify({ issues: [finding('增大间距', 'synthetic-1'), { ...finding('需要键盘操作证据', 'synthetic-1'), scope: 'unverified' }] }), '{}', composition('normal'), JSON.stringify({ issues: [] }), composition('tight')]);
  h.ports.presentation = true; h.ports.selectionAvailable = () => false; h.ports.visionAvailable = () => true;
  h.ports.skill = builderSkill;
  const inspectedBuilds: AgentBuild[] = [];
  h.ports.inspectPresentation = async build => { inspectedBuilds.push(structuredClone(build)); return { structural: true, issues: [], images: [{ label: 'synthetic-' + inspectedBuilds.length, bytes: new Uint8Array([inspectedBuilds.length]) }] }; };
  const storage = memoryStorage(), workflow = new AgentBuilderWorkflow(storage, h.ports);
  try {
    const { id } = workflow.create('阅读'); let build = await until(workflow, id, b => b.phase === 'choosing');
    await workflow.action(id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, id, b => ['ready', 'failed'].includes(b.phase)); assert.equal(build.phase, 'ready', build.error ?? '');
    assert.equal(inspectedBuilds.length, 2); assert.equal(build.visualResult?.status, 'reviewed');
    assert.ok(build.visualResult?.issues.some(issue => issue.includes('需要键盘操作证据')), 'deferred observations survive the confirmation review');
    const reviews = h.requests.filter(request => request.promptVersion.startsWith('ui-review/')); assert.equal(reviews.length, 2);
    for (const [index, request] of reviews.entries()) {
      const task = JSON.parse(request.task), inspected = inspectedBuilds[index]!;
      assert.deepEqual(task.rendered, inspected.nodes.map(node => ({ ...node, detail: node.id === 'notes' })), 'review uses actual nodes with explicit detail state, including false');
      assert.deepEqual(task.parts.map(({ id, purpose, props, read, submit }: any) => ({ id, purpose, props, read, submit })), inspected.design!.parts.map(({ id, purpose, props, read, submit }) => ({ id, purpose, props, read, submit })), 'field roles and bindings remain available to distinguish summaries from full text');
      assert.ok(task.parts.every((part: any) => Array.isArray(part.choices) && part.choices.length), 'review changes must use current legal choices');
      assert.deepEqual(task.parts.find((part: any) => part.id === 'notes').readOutput, inspected.design!.contract.operations.find(operation => operation.id === 'notes.list')!.output, 'review can distinguish the actual data returned from display labels');
      assert.deepEqual(task.screenshots, ['synthetic-' + (index + 1)]);
      assert.match(task.vocabulary.controls.recordActions, /先选中被点击的记录/);
      assert.match(task.vocabulary.controls.overlayLabels, /editor.title=写一条摘记/);
      assert.match(task.vocabulary.controls.feedback, /减少动效时也清除/);
      assert.match(request.instruction, /静态图不能判断/);
      assert.equal(request.skills?.[0]?.id, 'molis-plugin-dev.review');
    }
    for (const request of h.requests) {
      const stage = request.role === 'coder' ? 'code' : request.promptVersion.startsWith('ui-review/') ? 'review' : JSON.parse(request.task).mode === 'compose' ? 'ui' : JSON.parse(request.task).mode === 'experience' ? 'experience' : 'design';
      assert.equal(request.skills?.[0]?.id, 'molis-plugin-dev.' + stage, 'every generation and review stage mounts its own standard');
      if (stage !== 'code') assert.match(request.skills![0]!.body, /生成插件：体验与审美标准/);
      if (stage === 'ui' || stage === 'review') assert.equal(JSON.parse(request.task).brief, build.brief, 'original user intent reaches every visual task');
    }
    const corrections = h.requests.filter(request => request.promptVersion.startsWith('ui/') && JSON.parse(request.task).reviewSuggestions);
    assert.equal(corrections.length, 2, 'one visual correction, including its JSON validation retry');
    for (const request of corrections) {
      assert.deepEqual(request.images, reviews[0]!.images, 'correction and JSON retry see the same screenshots as the review');
      assert.deepEqual(JSON.parse(request.task).reviewSuggestions, ['synthetic-1 · home/notes：正文排列过密 → 难以连续阅读 → 增大间距']);
      assert.doesNotMatch(JSON.parse(request.task).request, /正文过密/, 'model suggestions are not promoted to user instructions');
    }
    const original = structuredClone(build.design);
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
    const agent = h.ports.agent;
    h.ports.agent = async (...args) => { const inner = await agent(...args); return { ...inner, async run(request) { entered(); await held; return { id: 'late', role: 'designer', promptVersion: request.promptVersion, contractRevision: request.contractRevision, instruction: '', input: '', output: composition('tight'), configuredModel: '', reportedModels: [], phase: 'completed', startedAt: '', activity: [], usage: [] } as BuilderAgentRecord; } }; };
    await workflow.action(id, { action: 'visual', revision: build.revision, message: '调整密度' }); await started;
    const pausing = workflow.pause(id); release(); await pausing;
    assert.deepEqual(workflow.store.require(id).design, original);
    assert.equal(workflow.store.require(id).phase, 'paused');
    assert.equal(workflow.store.require(id).pendingVisual, '调整密度');
    await workflow.close();
    h.ports.agent = agent; h.ports.visionAvailable = () => false;
    const beforeRestart = h.requests.filter(request => request.role === 'coder').length;
    const beforeResume = h.requests.length;
    const resumed = new AgentBuilderWorkflow(storage, h.ports);
    try {
      const paused = resumed.store.require(id);
      assert.deepEqual(paused.design, original);
      await resumed.action(id, { action: 'resume', revision: paused.revision });
      const restored = await until(resumed, id, value => ['ready', 'failed'].includes(value.phase));
      assert.equal(restored.phase, 'ready', restored.error ?? '');
      assert.equal(restored.pendingVisual, undefined);
      assert.equal(h.requests.filter(request => request.role === 'coder').length, beforeRestart);
      assert.ok(h.requests.slice(beforeResume).every(request => !request.images), 'a model without vision receives no image requests');
    } finally { await resumed.close(); }
  } finally { await workflow.close(); }
});

test('experience planning reshapes parts before detail and freeze, preserving selected operations and passing real content downstream', async () => {
  const plan = JSON.parse(experience()); plan.pages[0].parts = plan.pages[0].parts.filter((part: any) => part.id !== 'title');
  plan.pages[0].parts[0].id = 'capture'; plan.summary = '从内容开始，录入与浏览相邻';
  plan.scenarios[0].content = '先读完整段落。\n\n结尾提出一个可继续思考的问题。';
  const full = JSON.parse(detail('快记')); full.design.pages[0].parts = full.design.pages[0].parts.filter((part: any) => part.id !== 'title');
  full.design.pages[0].parts[0].id = 'capture'; full.design.acceptance[0].steps = ['fill capture.text = ' + plan.scenarios[0].content, 'submit capture', 'expect notes 结尾提出一个可继续思考的问题。'];
  const layout = JSON.parse(composition()); layout.presentation.pages[0].layout.children = [{ part: 'notes' }, { part: 'capture' }];
  layout.presentation.parts.capture = layout.presentation.parts.editor; delete layout.presentation.parts.editor;
  const h = harness([PROPOSALS, JSON.stringify(plan), JSON.stringify(full), JSON.stringify(layout)]);
  h.ports.presentation = true; h.ports.skill = builderSkill; h.ports.selectionAvailable = () => false;
  let preparations = 0;
  h.ports.prepareBuild = async (_before, design) => {
    preparations++;
    assert.deepEqual(h.requests.map(request => JSON.parse(request.task).mode), ['propose', 'experience', 'detail']);
    assert.deepEqual(design.parts.map(part => part.id), ['capture', 'notes']);
    assert.equal(h.implemented.size, 0, 'no code is written against the earlier sketch');
    return '/tmp/molis-build-fixture';
  };
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const { id } = workflow.create('完整阅读并记录问题'); let build = await until(workflow, id, value => value.phase === 'choosing');
    const original = structuredClone(build.candidates[0]!);
    const planned = acceptExperience(JSON.stringify(plan), original);
    assert.deepEqual(planned.proposal.preview.contract.operations, original.preview.contract.operations);
    assert.deepEqual(planned.proposal.effects, original.effects);
    for (const content of [{ title: '读书摘记', body: '首段。\n\n末段。' }, [{ amount: 120 }, { amount: 35 }], []]) {
      const structured = structuredClone(plan); structured.scenarios[0].content = content;
      assert.deepEqual(acceptExperience(JSON.stringify(structured), original).experience.scenarios[0]!.content, content, 'structured and empty-state example data remain intact');
    }
    for (const uses of ['', null]) {
      const withHeading = structuredClone(plan); withHeading.pages[0].parts.unshift({ id: 'heading', intent: 'heading', purpose: '页面说明', uses });
      assert.equal(acceptExperience(JSON.stringify(withHeading), original).sketch.pages[0]!.parts[0]!.uses, undefined, 'an empty optional use is not an invented operation');
    }
    const grouped = structuredClone(plan); grouped.pages[0].parts = [{ id: 'workspace', intent: 'collection', purpose: '浏览并就地录入', uses: ['notes.list', 'notes.add'] }];
    assert.deepEqual(acceptExperience(JSON.stringify(grouped), original).sketch.pages[0]!.parts[0]!.uses, ['notes.list', 'notes.add'], 'experience groups reach detail without prematurely forcing one operation per runtime part');
    const invented = structuredClone(plan); invented.pages[0].parts[0].uses = 'network.send';
    assert.throws(() => acceptExperience(JSON.stringify(invented), original), /不存在的操作/);
    const dropped = structuredClone(plan); dropped.pages[0].parts.shift();
    assert.throws(() => acceptExperience(JSON.stringify(dropped), original), /不能丢掉已选功能/);
    await workflow.action(id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, id, value => ['ready', 'failed'].includes(value.phase)); assert.equal(build.phase, 'ready', build.error ?? '');
    assert.equal(preparations, 1); assert.deepEqual(build.candidates[0], original, 'the user-selected proposal is not overwritten');
    const detailTask = JSON.parse(h.requests.find(request => JSON.parse(request.task).mode === 'detail')!.task);
    assert.deepEqual(detailTask.proposal.pages[0].parts.map((part: any) => part.id), ['capture', 'notes']);
    assert.deepEqual(detailTask.experience.scenarios, plan.scenarios);
    const uiTask = JSON.parse(h.requests.find(request => JSON.parse(request.task).mode === 'compose')!.task);
    assert.deepEqual(uiTask.experience, build.design!.experience);
    assert.equal(uiTask.experience.scenarios[0].content, plan.scenarios[0].content);
    assert.equal(build.design!.acceptance[0]!.steps[0]!.action, 'fill');
    assert.equal(h.requests.find(request => JSON.parse(request.task).mode === 'experience')!.skills?.[0]?.id, 'molis-plugin-dev.experience');
    assert.equal(h.requests.filter(request => JSON.parse(request.task).mode === 'experience').length, 1);
  } finally { await workflow.close(); }
});

test('an impossible partial query example returns to the designer before any build preparation or code', async () => {
  const bad = JSON.parse(detail('快记')); bad.design.operations[0].examples = [{ input: {}, includes: { text: 'not stored' } }];
  const h = harness([PROPOSALS, JSON.stringify(bad), detail('快记')]); let prepared = 0;
  h.ports.prepareBuild = async () => { prepared++; assert.equal(h.requests.filter(request => request.role === 'designer').length, 3); return '/tmp/molis-build-fixture'; };
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const { id } = workflow.create('快记'); let build = await until(workflow, id, value => value.phase === 'choosing');
    await workflow.action(id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, id, value => ['ready', 'failed'].includes(value.phase)); assert.equal(build.phase, 'ready', build.error ?? '');
    const repair = JSON.parse(h.requests[2]!.task);
    assert.match(repair.repair.validationError, /空存储/);
    assert.equal(prepared, 1); assert.equal(h.requests.filter(request => request.promptVersion.startsWith('repair/')).length, 0);
    assert.deepEqual(build.design!.contract.operations[0]!.examples, [{ input: {}, output: [] }]);
  } finally { await workflow.close(); }
});

test('unsupported, unlocated and uncertain review findings remain visible without triggering generation', async () => {
  const issues = [
    { ...finding(), scope: 'host', change: '调整宿主动画' },
    { ...finding(), scope: 'unverified', change: '需要观察键盘路径' },
    { ...finding(), property: 'appearance.hideButtons' },
    { ...finding(), screenshot: 'not-captured' },
    { ...finding(), partId: 'not-a-part' },
  ];
  const h = harness([PROPOSALS, experience(), detail('阅读'), composition(), JSON.stringify({ issues })]);
  h.ports.presentation = true; h.ports.selectionAvailable = () => false; h.ports.visionAvailable = () => true;
  let inspections = 0;
  h.ports.inspectPresentation = async () => { inspections++; return { structural: true, issues: [], images: [{ label: 'sample', bytes: new Uint8Array([1]) }] }; };
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const { id } = workflow.create('阅读'); let build = await until(workflow, id, value => value.phase === 'choosing');
    await workflow.action(id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    build = await until(workflow, id, value => ['ready', 'failed'].includes(value.phase)); assert.equal(build.phase, 'ready', build.error ?? '');
    assert.equal(inspections, 1); assert.equal(build.visualResult?.status, 'reviewed');
    assert.equal(build.visualResult?.issues.length, 5); assert.ok(build.visualResult!.issues.every(issue => issue.includes('未自动修改')));
    assert.equal(h.requests.filter(request => JSON.parse(request.task).mode === 'compose').length, 1);
  } finally { await workflow.close(); }
});

test('a cancelled experience answer cannot freeze a design or launch code', async () => {
  const h = harness([PROPOSALS, experience()]); h.ports.presentation = true;
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
  const agent = h.ports.agent;
  h.ports.agent = async (...args) => { const inner = await agent(...args); return { ...inner, async run(request) {
    if (JSON.parse(request.task).mode === 'experience') { entered(); await held; }
    return inner.run(request);
  } }; };
  h.ports.prepareBuild = async () => { throw new Error('must not prepare a cancelled design'); };
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const { id } = workflow.create('快记'); const build = await until(workflow, id, value => value.phase === 'choosing');
    await workflow.action(id, { action: 'choose', revision: build.revision, candidateId: 'quick' }); await started;
    const pausing = workflow.pause(id); release(); await pausing;
    assert.equal(workflow.store.require(id).phase, 'paused'); assert.equal(workflow.store.require(id).design, null);
    assert.equal(h.requests.filter(request => request.role === 'coder').length, 0);
  } finally { release(); await workflow.close(); }
});

test('a missing enum choice in acceptance goes to design, preserving the implemented operations', async () => {
  const full = JSON.parse(detail('待办'));
  full.design.operations[0].input = { 'status?': 'pending|done' };
  full.design.pages[0].parts.find((part: any) => part.id === 'notes').read = { op: 'notes.list', input: { status: 'form' } };
  full.design.acceptance[0].steps.splice(2, 0, 'fill notes.status = 待办');
  const fixed = structuredClone(full); fixed.design.acceptance[0].steps[2] = 'fill notes.status = pending';
  const h = harness([PROPOSALS, JSON.stringify(full), JSON.stringify(fixed)]); let rounds = 0;
  h.ports.browserAcceptance = async () => ({ passed: ++rounds > 1, cases: [{ id: 'add-note', passed: rounds > 1, detail: rounds === 1 ? JSON.stringify({ step: 3, action: 'fill', componentId: 'notes', reason: '「status」没有「待办」这个选项（可选：全部、pending、done）', visible: 'pending done' }) : 'ok' }], at: '' });
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const { id } = workflow.create('待办'); let state = await until(workflow, id, value => value.phase === 'choosing');
    await workflow.action(id, { action: 'choose', revision: state.revision, candidateId: 'quick' });
    state = await until(workflow, id, value => ['ready', 'failed'].includes(value.phase)); assert.equal(state.phase, 'ready', state.error ?? '');
    assert.equal(rounds, 2); assert.equal(h.requests.filter(request => request.role === 'coder').length, 2, 'the same working backend is reused');
    const revision = h.requests.find(request => JSON.parse(request.task).mode === 'revise')!;
    assert.match(JSON.parse(revision.task).request, /枚举不一致/);
    assert.deepEqual(state.design!.acceptance[0]!.steps[2], { action: 'fill', componentId: 'notes', field: 'status', value: 'pending' });
  } finally { await workflow.close(); }
});

test('the two questions the studio asks Jev are the registered defaults word for word, and what the host gives for them is what is asked', async () => {
  assert.equal(BUILDER_CHOOSE_CAPABILITY.body, CAPABILITY_WORDS);
  assert.equal(BUILDER_CHOOSE_COMPONENT.body, COMPONENT_WORDS);
  assert.deepEqual([BUILDER_CHOOSE_CAPABILITY.owner_id, BUILDER_CHOOSE_CAPABILITY.prompt_id, BUILDER_CHOOSE_COMPONENT.owner_id, BUILDER_CHOOSE_COMPONENT.prompt_id],
    ['io.molis.work.plugin-builder', 'choose.capability', 'io.molis.work.plugin-builder', 'choose.component']);
  const edited = (prompt: { prompt_id: string }) => '用户改过：' + prompt.prompt_id;
  // The capability question, settled before the full design.
  const capability = harness([proposalsUsing('goals.note'), detailUsing('快记', 'goals.progress.record')], { jev: 'goals.progress.record' });
  capability.ports.catalog = async () => GOALS_CATALOG;
  capability.ports.instruction = edited;
  const first = new AgentBuilderWorkflow(memoryStorage(), capability.ports);
  try {
    const created = first.create('做一个周报，给目标写本周进展');
    const build = await until(first, created.id, value => value.phase === 'choosing' || value.phase === 'failed');
    await first.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'quick' });
    const ready = await until(first, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    assert.equal(ready.phase, 'ready', ready.error ?? '');
    assert.ok(capability.asked.includes('用户改过：choose.capability'), capability.asked.join(' | '));
    assert.ok(!capability.asked.includes(CAPABILITY_WORDS), 'the shipped sentence is not asked once the host gives the person\'s');
  } finally { await first.close(); }
  // The component question, for each part with more than one legal component.
  const component = harness(['<think>先想想用户要什么</think>{"candidates":[{"id":"quick",', '<think>修正</think>\n' + PROPOSALS, detail('笔记板')]);
  component.ports.instruction = edited;
  const second = new AgentBuilderWorkflow(memoryStorage(), component.ports);
  try {
    const created = second.create('做一个随手记笔记的插件');
    let build = await until(second, created.id, value => value.phase === 'choosing' || value.phase === 'failed');
    build = await second.action(created.id, { action: 'choose', revision: build.revision, candidateId: 'board' }) as AgentBuild;
    build = await until(second, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    assert.equal(build.phase, 'ready', build.error ?? '');
    assert.deepEqual(component.asked, ['用户改过：choose.component', '用户改过：choose.component']);
  } finally { await second.close(); }
});

test('the host reads the studio\'s two questions from the register: the default until the person edits one, their text after, and each read is a recorded use', () => {
  const home = mkdtempSync(join(tmpdir(), 'builder-choice-'));
  try {
    const definitions = agentDefinitionsFor(home, builtinRegistrations);
    const instruction = builderInstructions(home);
    const keys = ['io.molis.work.plugin-builder/choose.capability', 'io.molis.work.plugin-builder/choose.component'];
    for (const key of keys) { const view = definitions.prompt(key); assert.equal(view.kind, 'instruction'); assert.equal(view.source.title, '插件创作工作台'); }
    assert.equal(instruction(BUILDER_CHOOSE_CAPABILITY), CAPABILITY_WORDS);
    assert.equal(definitions.uses(keys[0]!)[0]?.caller, 'plugin-builder', 'the question that was read is a recorded use');
    definitions.save(keys[1]!, '只看布局。', null, 'web-user');
    assert.equal(instruction(BUILDER_CHOOSE_COMPONENT), '只看布局。');
    assert.equal(definitions.uses(keys[1]!)[0]?.user_revision, 1, 'and the use says it ran the person\'s version');
    assert.equal(instruction(BUILDER_CHOOSE_CAPABILITY), CAPABILITY_WORDS, 'the other question is still the default');
  } finally { rmSync(home, { recursive: true, force: true }); }
});

/**
 * The workflow tests give the workflow its ports by hand and the register test calls `builderInstructions` directly, so
 * neither sees whether the studio the host builds hands that reader to the workflow. This runs the real surface
 * (`handleAgentStudioHttp`): only the models are stand-ins, and the person's edit is made in the register first.
 */
test('through the studio surface: the studio asks Jev the question the person saved in 设置 › 提示词, not the shipped one', { timeout: 120_000 }, async () => {
  const home = mkdtempSync(join(tmpdir(), 'builder-surface-')), databasePath = join(home, 'project.db');
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath), fixture = agentStudioFixture(0), asked: string[] = [];
  const edited = '只看这一页的版面和相邻的零件，不管数据。';
  const saved = agentDefinitionsFor(home, builtinRegistrations).save('io.molis.work.plugin-builder/choose.component', edited, null, 'web-user');
  assert.deepEqual([saved.effective, saved.body], ['user', edited], 'the person\'s edit is in the register');
  // The code Agent is held idle until the build is stopped (it may start after that, so an already aborted signal ends it at once):
  // nothing is written or checked, and this ends as soon as the first question has been put.
  const idleCoder = { close: async () => undefined, records: async () => [], run: (request: BuilderAgentRequest) => new Promise<BuilderAgentRecord>((_, reject) => {
    const stopped = () => reject(request.signal?.reason ?? new Error('stopped'));
    if (!request.signal || request.signal.aborted) stopped(); else request.signal.addEventListener('abort', stopped, { once: true });
  }) };
  const options = { store, projectId: DEMO_PROJECT_ID, homeDirectory: home, models: fixture.models, generate: fixture.generate,
    agents: async (build: AgentBuild, purpose: 'design' | 'code') => purpose === 'code' ? idleCoder : fixture.agents(build),
    choice: { selectionAvailable: () => true, async choose(question: { instructions: string; candidates: readonly { key: string }[] }) { asked.push(question.instructions); return fixture.choice.choose(question); } } };
  const server = createServer((request, response) => {
    void handleAgentStudioHttp(request, response, new URL(request.url ?? '/', 'http://localhost'), options, 'control-token').then(handled => { if (!handled) { response.writeHead(404); response.end(); } });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/plugin-builder/studio';
  const send = async <T>(method: string, path: string, body?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.ok(response.ok, method + ' ' + path + ' → ' + response.status + ' ' + await response.clone().text());
    return await response.json() as T;
  };
  const read = async (id: string) => (await send<{ build: AgentBuild }>('GET', '/builds/' + id)).build;
  const until = async (id: string, done: (build: AgentBuild) => boolean) => {
    for (let waited = 0; waited < 60_000; waited += 25) { const build = await read(id); if (done(build) || build.phase === 'failed') return build; await new Promise(resolve => setTimeout(resolve, 25)); }
    throw new Error('the studio did not reach the state in time');
  };
  try {
    const created = (await send<{ build: AgentBuild }>('POST', '/builds', { brief: '做一个随手记笔记的插件' })).build;
    let build = await until(created.id, value => value.phase === 'choosing');
    assert.equal(build.phase, 'choosing', build.error ?? '');
    await send('POST', '/builds/' + created.id + '/action', { action: 'choose', revision: build.revision, candidateId: 'board' });
    await until(created.id, () => asked.length > 0);
    assert.ok(asked.length > 0, 'the studio put a question to Jev');
    assert.equal(asked[0], edited, 'it asked the person\'s text, which only the studio\'s ports can bring from the register');
    assert.ok(!asked.includes(COMPONENT_WORDS), 'and not the shipped sentence');
  } finally {
    await releaseAgentStudio(store, DEMO_PROJECT_ID); await releaseInstalledPlugins(store, DEMO_PROJECT_ID);
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close(); rmSync(home, { recursive: true, force: true });
  }
});

// W2-18-BUILDER-LATE-01: a reset belonging to an older job cannot adopt or connect into its replacement.
test('W2-18-BUILDER-LATE-01: real Host sandbox cleanup cannot delete the resumed build preview', { timeout: 180_000, skip: process.platform !== 'darwin' }, async t => {
  const home = mkdtempSync(join(tmpdir(), 'builder-reset-http-')), file = join(home, 'project.db'); seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), options = { store, projectId: DEMO_PROJECT_ID, homeDirectory: home, routePrefix: '/projects/' + DEMO_PROJECT_ID, ...agentStudioFixture(0) };
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (studioFrameAsset(response, url.pathname)) return;
    void pluginPagesFor(home).bind(request, url).then(release => {
      if (release) response.once('close', release);
      if (url.pathname.startsWith(options.routePrefix + '/')) url.pathname = url.pathname.slice(options.routePrefix.length);
      return handleAgentStudioHttp(request, response, url, options, 'control-token');
    }).then(handled => { if (!handled) { response.writeHead(404); response.end(); } }).catch(error => sendLocalWebJson(response, 403, { error: String(error.message) }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object'); const origin = `http://127.0.0.1:${address.port}/api/plugin-builder/studio`;
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), removed = Promise.withResolvers<void>(); let arm = false, heldPath = '', removal: Promise<void> | undefined;
  const remove = fs.rm;
  const mock = t.mock.method(fs, 'rm', async (path: Parameters<typeof fs.rm>[0], settings?: Parameters<typeof fs.rm>[1]) => {
    const name = String(path);
    if (arm && name.startsWith(join(tmpdir(), 'molis-plugin-sandbox-'))) {
      arm = false; heldPath = name; entered.resolve();
      removal = release.promise.then(() => remove(path, settings)).finally(() => removed.resolve());
    }
    return name === heldPath ? removal! : remove(path, settings);
  });
  const send = async <Output>(path: string, body?: object): Promise<Output> => {
    const response = await fetch(origin + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-molis-work-control-token': 'control-token' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, path === '/builds' && body ? 201 : 200, await response.clone().text()); return response.json() as Promise<Output>;
  };
  const read = async (id: string) => (await send<{ build: AgentBuild }>('/builds/' + id)).build;
  const reached = async (id: string, phase: AgentBuild['phase']) => {
    const deadline = Date.now() + 60_000;
    for (;;) { const build = await read(id); if (build.phase === phase) return build; assert.notEqual(build.phase, 'failed', build.error); if (Date.now() > deadline) assert.fail('real studio phase timeout: ' + phase); await new Promise(resolve => setTimeout(resolve, 25)); }
  };
  try {
    const created = (await send<{ build: AgentBuild }>('/builds', { brief: '做一个随手记笔记的插件' })).build;
    const choice = await reached(created.id, 'choosing');
    await send('/builds/' + created.id + '/action', { action: 'choose', revision: choice.revision, candidateId: 'board' });
    const ready = await reached(created.id, 'ready');
    await send('/builds/' + ready.id + '/call', { componentId: 'editor', binding: 'submit', payload: { form: { text: 'Old preview record' } } });
    arm = true;
    await send('/builds/' + ready.id + '/action', { action: 'revise', revision: ready.revision, message: '保留这两个笔记操作，重新确认完整设计。' });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([entered.promise, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('real Host reset did not reach old sandbox cleanup')), 30_000); })]); } finally { clearTimeout(timeout); }
    assert.ok(heldPath, 'the paused operation is the real old SandboxRunner cleanup');
    const pause = send('/builds/' + ready.id + '/action', { action: 'pause' });
    const paused = await reached(ready.id, 'paused');
    await send('/builds/' + ready.id + '/action', { action: 'resume', revision: paused.revision });
    await reached(ready.id, 'ready');
    await send('/builds/' + ready.id + '/call', { componentId: 'editor', binding: 'submit', payload: { form: { text: 'New preview must remain' } } });
    const preview = await send<{ value: unknown }>('/builds/' + ready.id + '/call', { componentId: 'notes', binding: 'read', payload: {} });
    assert.match(JSON.stringify(preview.value), /New preview must remain/);
    const resumed = await read(ready.id);
    release.resolve(); await removed.promise; await pause;
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(await read(ready.id), resumed, 'the old reset cannot replace the current ready build');
    assert.deepEqual(await send('/builds/' + ready.id + '/call', { componentId: 'notes', binding: 'read', payload: {} }), preview, 'the real preview storage remains after old cleanup finishes');
  } finally {
    arm = false; release.resolve(); mock.mock.restore();
    await releaseAgentStudio(store, DEMO_PROJECT_ID); await releaseInstalledPlugins(store, DEMO_PROJECT_ID);
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); rmSync(home, { recursive: true, force: true });
  }
});

for (const stage of ["adopt", "connect"] as const) test(`a late ${stage} reset cannot change a newer ready build`, { timeout: 20_000 }, async () => {
  const h = harness([PROPOSALS, detail('Old detail'), detail('New detail')]);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); let resets = 0;
  const chosenReset = stage === 'adopt' ? 1 : 2;
  // This port deliberately ignores the optional checker: the workflow must still check after awaiting it.
  h.ports.resetPreview = async () => { if (++resets === chosenReset) { entered.resolve(); await release.promise; } };
  const workflow = new AgentBuilderWorkflow(memoryStorage(), h.ports);
  try {
    const created = workflow.create('A note keeper'), proposed = await until(workflow, created.id, value => value.phase === 'choosing');
    await workflow.action(created.id, { action: 'choose', revision: proposed.revision, candidateId: proposed.candidates[0]!.id });
    await entered.promise;
    const paused = workflow.pause(created.id);
    const current = await until(workflow, created.id, value => value.phase === 'paused');
    await workflow.action(created.id, { action: 'resume', revision: current.revision });
    const ready = await until(workflow, created.id, value => value.phase === 'ready' || value.phase === 'failed');
    assert.equal(ready.phase, 'ready', ready.error ?? ''); const snapshot = structuredClone(ready);
    release.resolve(); await paused;
    assert.deepEqual(workflow.store.require(created.id), snapshot, 'old token changes neither revision, steps, code/contract nor connected list');
  } finally { release.resolve(); await workflow.close(); }
});


test('SCOPE-1 UI-1 Home checks use the actual target, then physical signed download/import/pin reaches a working Home plugin', { skip: process.platform !== 'darwin', timeout: 240_000 }, async t => {
  const cleanups: Array<() => Promise<unknown>> = []; t.after(async () => { for (const close of cleanups) await close(); });
  const f = await serveHomeRuntime(t, { completeText: null }), project = await f.project('Signed publishing');
  const store = await f.host.withProject(project.reference, runtime => runtime.store), directory = join(f.home, 'browser-test');
  const browser = await openStudioChrome(directory); assert.ok(browser, 'dedicated browser is required'); cleanups.push(() => browser.close());
  const fixture = agentStudioFixture(0), actions = new ActionService(), seen: Array<string | null> = [];
  const probe = (scope: 'project' | 'home'): ActionDefinition => ({ capability_id: 'scope.read', version: 1, operation: 'query',
    action: { title: 'Scope read', description: 'Observe trusted scope', kind: 'query', scope, audiences: ['user', 'plugin'], permissions: [], subject_kinds: [],
      input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false }, output_schema: { type: 'string' }, execution: { cost: 'none' } } });
  const projectProbe = probe('project');
  actions.registerProvider({ provider: { provider_id: 't149-project', title: 'Project only', kind: 'system', project_id: project.project_id }, definitions: [projectProbe],
    handlers: [{ ...projectProbe, handle(caller) { seen.push(caller.project_id ?? null); return 'observed'; } }] });
  let modelCalls = 0, enabledProjectPlugins = 0;
  const options = { store, projectId: project.project_id, homeDirectory: f.home, routePrefix: '/projects/' + project.project_id,
    ...fixture, actorId: LOCAL_PERSON_ACTOR_ID, actions: { registry: actions, client: actions, project_id: project.project_id },
    homeActions: { registry: f.host.actionRegistry(), client: f.host.homeActionClient(), inspect: f.host.inspectActions.bind(f.host), project_id: null },
    enablePlugin: async () => { enabledProjectPlugins++; throw new Error('A Home check cannot enable a project plugin'); },
    agents: async (build: AgentBuild) => { const agent = fixture.agents(build); return { ...agent, async run(request: BuilderAgentRequest) {
      modelCalls++; const record = await agent.run(request);
      if (request.role === 'designer') { const answer = JSON.parse(record.output);
        if (answer.design) { answer.design.operations = answer.design.operations.filter((operation: { id: string }) => operation.id !== 'notes.expand');
          answer.design.operations.find((operation: { id: string }) => operation.id === 'notes.list').effects.capabilities = ['scope.read'];
          answer.design.pages[0].parts = answer.design.pages[0].parts.filter((part: { id: string }) => part.id !== 'expand');
          answer.design.acceptance = answer.design.acceptance.filter((item: { id: string }) => item.id !== 'expand'); record.output = JSON.stringify(answer); }
      } else if (request.operationIds?.includes('notes.list')) { const task = JSON.parse(request.task), file = join(build.directory!, task.implementation);
        await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace('  const rows =', "  await sdk.capability.call('scope.read', {});\n  const rows =")); }
      return record;
    } }; } };
  const mutations = new Map<string, LocalMutationState>();
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (studioFrameAsset(response, url.pathname)) return;
    if (url.pathname === '/__t149_studio') { response.writeHead(200, { 'content-type': 'text/html' }); response.end(isolatedStudioHarness(f.home, project.project_id, f.token)); return; }
    if (!authorizeLocalWebRequest(request, response, url, f.token, mutations)) return;
    void pluginPagesFor(f.home).bind(request, url).then(release => { if (release) response.once('close', release);
      const local = new URL(url); if (local.pathname.startsWith(options.routePrefix + '/')) local.pathname = local.pathname.slice(options.routePrefix.length);
      return handleAgentStudioHttp(request, response, local, options, f.token);
    }).then(handled => { if (!handled) sendLocalWebJson(response, 404, { error: 'not found' }); }).catch(error => sendLocalWebJson(response, 400, { error: String(error) }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(async () => { await releaseAgentStudio(store, project.project_id); await releaseInstalledPlugins(store, project.project_id);
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); });
  const origin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port, raw = await browser.page(), page = await framedStudioPage(t, browser, raw);
  await raw.command('Page.navigate', { url: origin + '/__t149_studio' });
  await page.wait(`document.querySelector('[data-as-model] option[value^="fixture"]')`);
  await page.evaluate(`(()=>{const select=document.querySelector('[data-as-model]');select.value=[...select.options].find(option=>option.value.startsWith('fixture')).value;select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await page.fill('[data-as-input]', '创建一个可以保存并阅读笔记的插件'); await page.click('.as-send');
  await page.wait(`document.querySelector('[data-as-choose="board"]')`); await page.click('[data-as-choose="board"]');
  await page.wait(`document.querySelector('[data-as-phase]')?.dataset.phase==='ready'`, { timeoutMs: 100_000 });
  assert.ok(seen.includes(project.project_id)); const before = modelCalls;
  const buildId = await page.evaluate<string>(`document.querySelector('[data-as-builds]').value`), info = async () => await (await fetch(origin + options.routePrefix + '/api/plugin-builder/studio/builds/' + buildId)).json() as { build: AgentBuild; versions: AgentRelease[] };
  await page.click('[data-as-scope="home"]'); await page.wait(`!!document.querySelector('[data-as-action="recheck"]')`);
  assert.equal((await info()).build.browserResult, undefined); assert.deepEqual((await info()).build.checks, {});
  await page.click('[data-as-action="recheck"]');
  await page.wait(`document.querySelector('[data-as-phase]')?.dataset.phase==='failed'`);
  assert.match((await info()).build.error ?? '', /目标范围.*scope.read/);
  assert.equal((await info()).versions.length, 0); assert.equal(enabledProjectPlugins, 0); assert.equal(modelCalls, before);
  assert.equal(await fs.stat(join(f.home, 'config', 'plugin-publisher.json')).then(() => true, () => false), false);
  const homeProbe = probe('home');
  f.host.actionRegistry().registerProvider({ provider: { provider_id: 't149-home', title: 'Home read', kind: 'system' }, definitions: [homeProbe],
    handlers: [{ ...homeProbe, handle(caller) { seen.push(caller.project_id ?? null); return 'observed'; } }] });
  seen.length = 0; await page.click('[data-as-action="recheck"]');
  await page.wait(`document.querySelector('[data-as-phase]')?.dataset.phase==='ready'`, { timeoutMs: 60_000 });
  assert.ok(seen.length); assert.ok(seen.every(id => id === null), 'Home checks and live preview calls carry the trusted null project identity');
  assert.equal(modelCalls, before, 'scope checks never call a model');
  await page.click('[data-as-action="publish"]'); await page.wait(`!!document.querySelector('[data-as-download]')`);
  const downloaded = join(directory, 'downloads'); await fs.mkdir(downloaded);
  await browser.command('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloaded, eventsEnabled: true });
  const completed = browser.event('Browser.downloadProgress', params => params.state === 'completed');
  await page.click('[data-as-download]'); await completed;
  const files = await fs.readdir(downloaded); assert.equal(files.length, 1);
  const file = join(downloaded, files[0]!), bundle = verifyPluginPackageSignature(JSON.parse(await fs.readFile(file, 'utf8'))).bundle;
  assert.equal(bundle.payload.manifest.runtime?.scope, 'home'); const pluginId = bundle.payload.manifest.plugin_id;
  assert.deepEqual(new HomeConsentLedger(f.home).publishers(), []);
  await raw.command('Page.navigate', { url: f.origin + '/projects/' + project.project_id + '/settings/plugins' });
  await raw.wait(`!!document.querySelector('[data-plugin-trust-pick]')`);
  const select = async () => { const doc = await raw.command<{ root: { nodeId: number } }>('DOM.getDocument');
    const input = await raw.command<{ nodeId: number }>('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '[data-plugin-trust-pick]' });
    await raw.command('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [file] }); await raw.wait(`document.querySelector('[data-plugin-trust-preview]')?.hidden===false`); };
  await select(); const shown = await raw.evaluate<string>(`document.querySelector('[data-plugin-trust-preview]').innerText`);
  assert.ok(shown.includes(bundle.payload.manifest.publisher.signature)); assert.match(shown, /个人|Home/);
  await raw.click('[data-plugin-trust-preview] .mw-btn--secondary'); await raw.wait(`document.querySelector('[data-plugin-trust-preview]').hidden`);
  assert.deepEqual(new HomeConsentLedger(f.home).publishers(), []); assert.equal(f.host.homePlugins!.installation(pluginId), undefined);
  await select(); await raw.fill('[data-plugin-trust-preview] input', 'My local publisher'); await raw.click('[data-plugin-trust-preview] .mw-btn--primary');
  await raw.wait(`document.querySelector('[data-plugin-trust-preview]').hidden`);
  assert.equal(f.host.homePlugins!.installation(pluginId)!.execution, 'sandbox');
  await raw.command('Page.navigate', { url: f.origin + '/plugins/' + pluginId + '?frame=workbench' });
  const installed = await framedStudioPage(t, browser, raw);
  await installed.wait(`!!document.querySelector('[data-pc-open="editor"]')`); await installed.click('[data-pc-open="editor"]');
  await installed.fill('[data-component-id="editor"] [data-field]', 'Saved through the signed Home plugin');
  await installed.click('[data-component-id="editor"] [type=submit]');
  await installed.wait(`document.querySelector('[data-component-id="notes"]')?.innerText.includes('Saved through the signed Home plugin')`);
  await raw.command('Page.reload');
  await installed.wait(`document.querySelector('[data-component-id="notes"]')?.innerText.includes('Saved through the signed Home plugin')`);
});

import { randomUUID } from 'node:crypto';
import type { PluginPrivateStorage } from '@molis-ai/molis-work-contracts/platform/plugin';
import { pluginComponentChoices, resolvePluginComponentCall } from '@molis-ai/molis-work-design-system';
import type { SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { BuilderAgentRequest, BuilderAgentRecord } from '@molis-ai/molis-work-contracts/services/agent-host';
import type { BuildManifest, BuildCheckResult } from '@molis-ai/molis-work-contracts/platform/plugin-builder';
import { AgentBuilderStore } from './agent-store.js';
import { BUILDER_PROMPTS } from './agent-prompts.js';
import { contractEffects, validateAgentDesign } from './agent-validation.js';
import { parseModelJson } from './validation.js';
import { expandDesign, normalizeProposal } from './agent-authoring.js';
import type { AgentBuild, AgentDesign, AgentBuildSnapshot, AgentBuildStep, AgentProposal, AgentRelease } from './agent-model.js';

export interface AgentBuilderPorts {
  projectId: string;
  catalog(): Promise<Array<{ id: string; description: string; input?: unknown; output?: unknown }>>;
  resources?: readonly string[];
  models(): Promise<readonly { provider_id: string; model_id: string; label: string }[]>;
  agent(build: AgentBuild, purpose: 'design' | 'code'): Promise<{ run(request: BuilderAgentRequest): Promise<BuilderAgentRecord>; close(): Promise<void>; records(): Promise<BuilderAgentRecord[]> }>;
  validateContract(contract: unknown): void;
  prepareBuild(previous: AgentBuild, design: AgentDesign, manifest: BuildManifest): Promise<string>;
  check(build: AgentBuild, operationIds: string[], signal: AbortSignal): Promise<BuildCheckResult>;
  call(build: AgentBuild, operationId: string, input: SandboxJson): Promise<SandboxJson>;
  resetPreview(buildId: string): Promise<void>;
  choose?(question: { key: string; instructions: string; state: string; candidates: readonly { key: string; description: string }[] }): Promise<{ choice: string | null; model: string; elapsedMs: number; confidence: number | null }>;
  selectionAvailable?(): boolean;
  browserAcceptance(build: AgentBuild, signal: AbortSignal): Promise<NonNullable<AgentBuild['browserResult']>>;
  /** Shared source modules already in the build (src/*.ts other than the operation files and the entry). */
  sources?(build: AgentBuild): Promise<string[]>;
  publish(build: AgentBuild, manifest: BuildManifest, bundlePath: string, version: number): Promise<{ directory: string; bundlePath: string; packagePath: string }>;
  installations(): Promise<unknown[]>;
  lifecycle(action: 'install' | 'upgrade' | 'rollback' | 'disable' | 'enable' | 'uninstall', release: AgentRelease, grants?: unknown): Promise<void>;
}
const snapshot = (build: AgentBuild): AgentBuildSnapshot => ({ design: build.design, nodes: build.nodes, connected: build.connected, ...(build.directory ? { directory: build.directory } : {}), ...(build.designSource ? { designSource: build.designSource } : {}) });
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const PENDING_CASE = '前置用例失败，尚未执行';
/** Nodes follow the design's part order however they were placed: parts kept from the previous design are placed before new ones. */
export function inDesignOrder<T extends { id: string }>(design: { parts: readonly { id: string }[] } | null | undefined, nodes: readonly T[]): T[] {
  const order = (id: string) => design?.parts.findIndex(part => part.id === id) ?? 0;
  return [...nodes].sort((a, b) => order(a.id) - order(b.id));
}
/** A person-readable reason from a failed case's detail (plain text or the runner's JSON diagnosis). */
export function failureReason(detail: string): string {
  try { const info = JSON.parse(detail) as { step?: number; reason?: string; visible?: string }; return (info.step ? '第 ' + info.step + ' 步' : '') + (info.reason ?? '') + (info.visible ? '（界面显示：' + info.visible.slice(0, 80) + '）' : ''); }
  catch { return detail; }
}
/** Reads the runner's diagnosis of a failed step: expected texts present in the part's data but not on screen. */
/**
 * Failures the code agent cannot fix. `display`: the part's own data has the expected text, the part does not show
 * it. `wiring`: the part reads nothing, so what it should show can only arrive through the design (a prefilled field
 * or a shown command result).
 */
function displayProblem(test: AgentDesign['acceptance'][number], detail: string, parts: AgentDesign['parts']): { type: 'display' | 'wiring' | 'form'; componentId: string; expected: string[]; visible: string; reason?: string } | null {
  let info: { step?: number; componentId?: string; visible?: string; data?: string; reason?: string };
  try { info = JSON.parse(detail); } catch { return null; }
  const step = info.step ? test.steps[info.step - 1] : undefined;
  // A required field left empty: either another part should have carried it, or the case forgot to fill it.
  if (step?.action === 'submit' && info.componentId && /必填字段是空的/.test(info.reason ?? '')) return { type: 'form', componentId: info.componentId, expected: [], visible: info.visible ?? '', reason: (info.reason ?? '').replace(/^Error:\s*/, '') };
  const expected = step?.action === 'expect' ? [step.text] : step?.action === 'expectOrder' ? step.texts : step?.action === 'expectValue' ? [String(step.value)] : [];
  const flat = (value: string) => value.replace(/\s+/g, ' ');
  if (!expected.length || !info.componentId || typeof info.visible !== 'string') return null;
  const part = parts.find(item => item.id === info.componentId);
  if (part && !part.read) return { type: 'wiring', componentId: info.componentId, expected, visible: info.visible };
  const labels = (part?.props.columns ?? []).map(column => column.label).filter(Boolean);
  if (labels.some(label => expected.some(text => text !== label && flat(text).includes(label)))) return { type: 'display', componentId: info.componentId, expected, visible: info.visible };
  if (!info.data) return null;
  const inData = expected.every(text => flat(info.data!).includes(flat(text))), onScreen = expected.every(text => flat(info.visible!).includes(flat(text)));
  return inData && !onScreen ? { type: 'display', componentId: info.componentId, expected, visible: info.visible } : null;
}
/** Runtime and model errors in words the person can act on; the original stays in the collaboration record. */
export function humanize(text: string): string {
  if (/too many tool turns/i.test(text)) return '代码 Agent 这一轮用完了可用的操作次数，写好的文件都已保留；继续后会从检查结果接着修正';
  if (/验收等待超时/.test(text)) return '界面上等了 20 秒仍没有出现预期的结果';
  if (/timed? ?out|超时/i.test(text) && !/[\u4e00-\u9fa5]/.test(text)) return '等待模型或工具超时，写好的内容都已保留，可以继续';
  if (/credential|api key|401|403/i.test(text) && !/[\u4e00-\u9fa5]/.test(text)) return '模型服务拒绝了请求，请检查模型设置里的密钥和额度';
  return text.replace(/^Error:\s*/, '').replace(/\n\s+at [\s\S]*$/, '');
}
type ProposeOutcome = { kind: 'questions'; questions: string[]; summary: string } | { kind: 'proposals'; proposals: AgentProposal[]; summary: string; dropped: string[] };
/** The whole build record is rewritten on every change, so its history must stay bounded. */
const MAX_STEPS = 200, MAX_RUNS = 100;
const ACTIVITY = new Set(['file', 'tool', 'check']);
/** Drops the oldest code-agent tool activity first, then the oldest settled step; open work is never dropped. */
function pruneSteps(steps: AgentBuildStep[]) {
  while (steps.length > MAX_STEPS) {
    let index = steps.findIndex(item => item.agent === 'code' && ACTIVITY.has(item.action));
    if (index < 0) index = steps.findIndex(item => !['queued', 'active', 'waiting'].includes(item.status));
    if (index < 0) return;
    steps.splice(index, 1);
  }
}

/** Durable host-driven state machine. Browser views subscribe; no browser tick starts work. */
export class AgentBuilderWorkflow {
  readonly store: AgentBuilderStore;
  private readonly jobs = new Map<string, { abort: AbortController; done: Promise<void> }>();
  private readonly listeners = new Set<(build: AgentBuild) => void>();
  private closed = false;
  constructor(storage: PluginPrivateStorage, private readonly ports: AgentBuilderPorts) { this.store = new AgentBuilderStore(storage); }
  async initialize() {
    for (const build of this.store.list()) if (build.active) {
      const stage = build.active.stage;
      this.change(build.id, value => { value.active = null; value.phase = 'paused'; value.error = '宿主已重启，保留已有文件，继续时先重新检查'; for (const step of value.steps) if (step.status === 'active') step.status = 'cancelled'; });
      // Recovered build jobs continue from persisted files. Design is safe to retry with a new session.
      this.launch(build.id, stage);
    }
  }
  subscribe(listener: (build: AgentBuild) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private change(id: string, mutate: (build: AgentBuild) => void) {
    const build = this.store.update(id, this.store.require(id).revision, mutate);
    for (const listener of this.listeners) try { listener(build); } catch { /* view disconnects do not stop execution */ }
    return build;
  }
  private step(id: string, step: Omit<AgentBuildStep, 'at'>) { this.change(id, build => { const existing = build.steps.findIndex(item => item.id === step.id); const next = { ...step, at: new Date().toISOString() }; if (existing < 0) build.steps.push(next); else build.steps[existing] = next; pruneSteps(build.steps); }); }
  private current(id: string, token: string) { if (this.closed || this.store.require(id).active?.token !== token) throw new Error('旧构建结果已作废'); }
  async state() { return { builds: this.store.list(), releases: this.store.releases(), installations: await this.ports.installations(), models: await this.ports.models(), selectionAvailable: Boolean(this.ports.choose && this.ports.selectionAvailable?.()), runtimeAvailable: true }; }
  create(brief: string) { const build = this.store.create(brief); this.launch(build.id, 'design'); return this.store.require(build.id); }
  private launch(id: string, stage: NonNullable<AgentBuild['active']>['stage']) {
    if (this.closed || this.jobs.has(id)) throw new Error('此草稿已有执行中的工作');
    const abort = new AbortController(), token = randomUUID(), signal = abort.signal;
    this.change(id, build => { build.phase = stage === 'build' ? 'building' : 'designing'; build.error = null; build.active = { token, stage, contractRevision: build.design?.contract.revision }; });
    // Detail and revision end in a frozen design, and the same job goes straight on to build it.
    const work = stage === 'design' ? () => this.propose(id, token, signal)
      : stage === 'detail' ? async () => { await this.detail(id, token, signal); await this.build(id, token, signal); }
      : stage === 'revise' ? async () => { await this.revise(id, token, signal); await this.build(id, token, signal); }
      : () => this.build(id, token, signal);
    const done = Promise.resolve().then(work).catch(error => {
      if (this.store.require(id).active?.token === token) this.change(id, build => { build.active = null; build.phase = abort.signal.aborted ? 'paused' : 'failed'; build.error = humanize(message(error)); for (const step of build.steps) if (step.status === 'active') { step.status = abort.signal.aborted ? 'cancelled' : 'failed'; step.detail = message(error); } });
    }).finally(() => { if (this.jobs.get(id)?.abort === abort) this.jobs.delete(id); });
    this.jobs.set(id, { abort, done });
  }
  private async withAgent<T>(id: string, purpose: 'design' | 'code', action: (agent: Awaited<ReturnType<AgentBuilderPorts['agent']>>) => Promise<T>) {
    const agent = await this.ports.agent(this.store.require(id), purpose); try { return await action(agent); } finally { await agent.close(); }
  }
  private record(id: string, record: BuilderAgentRecord) { this.change(id, build => { build.runs.push({ id: record.id, role: record.role, phase: record.phase, configuredModel: record.configuredModel, reportedModels: record.reportedModels, promptVersion: record.promptVersion, ...(record.error ? { error: record.error } : {}) }); if (build.runs.length > MAX_RUNS) build.runs.splice(0, build.runs.length - MAX_RUNS); }); }
  /**
   * One designer answer with the host's repair loop: a rejected answer goes back to the same role with the exact reason,
   * at most twice in a row. Long structured answers are where models most often slip.
   */
  private async designer<T>(id: string, token: string, signal: AbortSignal, stepId: string, task: Record<string, unknown>, accept: (output: string) => T): Promise<T> {
    const prompt = BUILDER_PROMPTS.designer;
    let repair: { previousAnswer: string; validationError: string } | undefined;
    for (let attempt = 0; ; attempt++) {
      const current = this.store.require(id);
      const record = await this.withAgent(id, 'design', agent => agent.run({ role: 'designer', instruction: prompt.text, promptVersion: prompt.version,
        contractRevision: current.design?.contract.revision ?? 'draft', signal, task: JSON.stringify(repair ? { ...task, repair } : task) }));
      this.current(id, token); this.record(id, record);
      try { return accept(record.output); }
      catch (error) {
        // A designer answer takes seconds; a third repair costs little and saves the whole stage.
        if (attempt >= 3 || !record.output.trim()) throw error;
        repair = { previousAnswer: record.output.slice(0, 30_000), validationError: message(error) };
        this.step(id, { id: stepId + ':repair:' + attempt, agent: 'design', action: 'repair', label: '答案未通过宿主校验，交回主线设计修正（第 ' + (attempt + 1) + ' 次）', status: 'done', detail: message(error) });
      }
    }
  }
  private async designContext() {
    const catalog = await this.ports.catalog();
    return { catalog, ids: catalog.map(item => item.id), resources: [...(this.ports.resources ?? [])] };
  }
  /** Stage one: clarify once at most, then 2–3 product-level proposals the person compares on the canvas. */
  private async propose(id: string, token: string, signal: AbortSignal) {
    const initial = this.store.require(id), stepId = 'design:' + token, { catalog, ids } = await this.designContext();
    this.step(id, { id: stepId, agent: 'design', action: 'design', label: '理解需求并提出方案', status: 'active' });
    const outcome = await this.designer(id, token, signal, stepId, { mode: 'propose', brief: initial.brief, messages: initial.messages, clarificationAllowed: !initial.clarificationAnswered,
      capabilities: catalog, resources: this.ports.resources ?? [] }, (output): ProposeOutcome => {
      const value = parseModelJson(output) as Record<string, unknown>;
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('答案不是 JSON 对象');
      const summary = typeof value.summary === 'string' ? value.summary.slice(0, 2000) : '';
      if (Array.isArray(value.questions) && value.questions.length) {
        if (initial.clarificationAnswered || value.questions.length > 3 || value.questions.some(question => typeof question !== 'string' || !question.trim() || question.length > 1000))
          throw new Error('已经澄清过一次，这次必须直接给出方案，把仍不确定的地方写成假设放进 summary');
        return { kind: 'questions', questions: value.questions as string[], summary };
      }
      const list = Array.isArray(value.candidates) ? value.candidates : Array.isArray(value.proposals) ? value.proposals : null;
      if (!list || list.length < 2 || list.length > 3) throw new Error('初次要给 2–3 个在页面结构或关键行为上有实质差异的方案（candidates）');
      const dropped: string[] = [];
      const proposals = list.map((item, index) => normalizeProposal(item, index, 'io.molis.work.generated.' + id, dropped));
      if (new Set(proposals.map(item => item.id)).size !== proposals.length) throw new Error('方案标识重复');
      for (const proposal of proposals) for (const capability of proposal.effects.capabilities ?? [])
        if (!ids.includes(capability)) throw new Error(`方案 ${proposal.id} 用了能力目录里没有的「${capability}」；目录为空时只能用插件自己的存储`);
      return { kind: 'proposals', proposals, summary, dropped };
    });
    if (outcome.kind === 'questions') {
      this.change(id, build => { build.questions = outcome.questions; build.active = null; build.phase = 'clarifying'; if (outcome.summary) build.messages.push({ role: 'assistant', text: outcome.summary }); });
      this.step(id, { id: stepId, agent: 'design', action: 'design', label: '需要你回答 ' + outcome.questions.length + ' 个问题', status: 'waiting' });
      return;
    }
    this.change(id, build => { build.candidates = outcome.proposals; build.chosen = undefined; build.questions = []; build.phase = 'choosing'; build.active = null; build.notes = outcome.dropped.slice(0, 40);
      if (outcome.summary) build.messages.push({ role: 'assistant', text: outcome.summary }); });
    this.step(id, { id: stepId, agent: 'design', action: 'design', label: '提出 ' + outcome.proposals.length + ' 个方案', status: 'done', detail: outcome.proposals.map(item => item.title).join(' · ') });
  }
  /** What the model sees of a proposal: the product decision, not the host's expanded preview machinery. */
  private sketch(proposal: AgentProposal) {
    const { contract, parts } = proposal.preview;
    return { id: proposal.id, title: proposal.title, description: proposal.description, rationale: proposal.rationale, journey: proposal.journey,
      operations: contract.operations.map(({ id, kind, description, input, output }) => ({ id, kind, description, input, output })),
      pages: contract.pages.map(page => ({ id: page.id, title: page.title, parts: parts.filter(part => part.pageId === page.id).map(part => ({ id: part.id, intent: part.intent, purpose: part.purpose, uses: part.read?.operationId ?? part.submit?.operationId })) })) };
  }
  /** Expands and strictly validates one full design answer (detail or revision). */
  private acceptDesign(id: string, output: string, base: { id: string; title: string; description: string; rationale: string; journey: string[] }, ids: string[], resources: string[]) {
    const value = parseModelJson(output), dropped: string[] = [];
    const design = expandDesign(value, base, 'io.molis.work.generated.' + id, randomUUID(), dropped);
    const valid = validateAgentDesign(design, ids, resources, this.ports.validateContract);
    const source = value && typeof value === 'object' && !Array.isArray(value) && 'design' in value ? (value as { design: unknown }).design : value;
    // A change inside an operation that its contract cannot show (e.g. what the model is asked) still reaches the code.
    const rework: Record<string, string> = {};
    const listed = value && typeof value === 'object' && !Array.isArray(value) ? (value as { rework?: unknown }).rework : undefined;
    for (const item of Array.isArray(listed) ? listed : []) {
      const entry = item as { op?: unknown; operation?: unknown; why?: unknown; change?: unknown };
      const op = String(entry?.op ?? entry?.operation ?? ''), why = String(entry?.why ?? entry?.change ?? '').trim();
      if (!valid.contract.operations.some(operation => operation.id === op)) throw new Error('rework 引用了不存在的操作：' + op);
      if (!why || why.length > 600) throw new Error('rework 的 why 写清要在代码里做的改变（600 字以内）：' + op);
      rework[op] = why;
    }
    return { design: valid, dropped, source: JSON.stringify(source), rework };
  }
  /** Stage two: the chosen proposal in full: contract, parts and browser acceptance. Then the build starts. */
  private async detail(id: string, token: string, signal: AbortSignal) {
    const initial = this.store.require(id), proposal = initial.candidates.find(item => item.id === initial.chosen);
    if (!proposal) throw new Error('选中的方案已失效，请重新选择');
    const stepId = 'detail:' + token, { catalog, ids, resources } = await this.designContext();
    this.step(id, { id: stepId, agent: 'design', action: 'design', label: '细化「' + proposal.title + '」：功能合同、界面与验收', status: 'active' });
    const result = await this.designer(id, token, signal, stepId, { mode: 'detail', brief: initial.brief, messages: initial.messages, proposal: this.sketch(proposal), capabilities: catalog, resources },
      output => this.acceptDesign(id, output, proposal, ids, resources));
    await this.adopt(id, token, result, stepId, '主线已确定：' + result.design.contract.operations.length + ' 项功能、' + result.design.parts.length + ' 个界面零件、' + result.design.acceptance.length + ' 条验收');
  }
  /** A change request on a designed plugin: one revised design; what did not change keeps its parts and working code. */
  /** `hostRequest` is a revision the host asks for itself, e.g. after acceptance found a display problem. */
  private async revise(id: string, token: string, signal: AbortSignal, hostRequest?: string) {
    const initial = this.store.require(id), design = initial.design;
    if (!design) throw new Error('还没有确定的方案可以修改');
    const request = hostRequest ?? [...initial.messages].reverse().find(item => item.role === 'user')?.text ?? '';
    const stepId = 'revise:' + token + (hostRequest ? ':' + randomUUID().slice(0, 8) : ''), { catalog, ids, resources } = await this.designContext();
    this.step(id, { id: stepId, agent: 'design', action: 'design', label: hostRequest ? '按验收结果调整界面显示' : '按你的意见修订主线', status: 'active', detail: request.slice(0, 300) });
    const result = await this.designer(id, token, signal, stepId, { mode: 'revise', brief: initial.brief, request, messages: initial.messages,
      current: initial.designSource ? JSON.parse(initial.designSource) : { title: design.title, operations: design.contract.operations, parts: design.parts, acceptance: design.acceptance },
      capabilities: catalog, resources }, output => this.acceptDesign(id, output, design, ids, resources));
    const reworked = Object.keys(result.rework);
    await this.adopt(id, token, result, stepId, (hostRequest ? '已按验收调整界面显示；' : '') + describeRevision(design, result.design) + (reworked.length ? '；要改代码：' + reworked.map(item => '「' + operationName(result.design, item) + '」').join('、') : ''));
  }
  /** Freezes a design: a new build directory keeps unchanged operations' code; unchanged parts and wiring stay. */
  private async adopt(id: string, token: string, result: { design: AgentDesign; dropped: string[]; source: string; rework?: Record<string, string> }, stepId: string, summary: string) {
    const before = this.store.require(id), design = result.design;
    const manifest: BuildManifest = { version: 1, pluginId: design.contract.pluginId, revision: design.contract.revision, effects: contractEffects(design) };
    const directory = await this.ports.prepareBuild(before, design, manifest); this.current(id, token);
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const kept = before.design ? before.nodes.filter(node => { const { kind: _kind, ...plan } = node; const next = design.parts.find(part => part.id === node.id); return !!next && same(plan, next); }) : [];
    const rework = result.rework ?? {};
    const unchanged = before.design ? before.connected.filter(operationId => !rework[operationId] && same(before.design!.contract.operations.find(item => item.id === operationId), design.contract.operations.find(item => item.id === operationId))) : [];
    await this.resetPreview(id);
    this.change(id, value => {
      if (value.design) value.history.push(snapshot(value));
      if (value.history.length > 20) value.history.splice(0, value.history.length - 20);
      value.design = design; value.designSource = result.source; value.title = design.title; value.directory = directory; value.notes = result.dropped.slice(0, 40);
      value.nodes = kept; value.connected = unchanged; value.checks = {}; value.browserResult = undefined; value.pendingPart = undefined;
      if (Object.keys(rework).length) value.rework = rework; else delete value.rework;
      value.active = value.active ? { ...value.active, stage: 'build', contractRevision: design.contract.revision } : value.active; value.phase = 'building';
    });
    this.step(id, { id: stepId, agent: 'design', action: 'design', label: summary, status: 'done', ...(result.dropped.length ? { detail: '宿主整理：' + result.dropped.slice(0, 12).join('、') } : {}) });
  }
  async choose(id: string, revision: number, candidateId: string) {
    const build = this.store.require(id); if (build.revision !== revision || build.active) throw new Error('草稿已改变，请刷新');
    if (!build.candidates.some(item => item.id === candidateId)) throw new Error('方案已失效');
    this.change(id, value => { value.chosen = candidateId; });
    this.launch(id, 'detail'); return this.store.require(id);
  }

  private async check(id: string, operations: string[], signal: AbortSignal) {
    return this.ports.check(this.store.require(id), operations, signal);
  }
  private async build(id: string, token: string, signal: AbortSignal) {
    await Promise.all([this.assemble(id, token, signal), this.implement(id, token, signal)]);
    this.current(id, token); const build = this.store.require(id);
    if (build.pendingPart) { this.change(id, value => { value.active = null; value.phase = 'paused'; }); return; }
    const final = await this.check(id, build.design!.contract.operations.map(item => item.id), signal); this.current(id, token);
    this.change(id, value => { value.checks.global = final; }); if (!final.passed) throw new Error('发布前整体门禁失败：' + (final.gates.find(gate => !gate.passed)?.detail ?? ''));
    const result = await this.repairAcceptance(id, token, signal, await this.acceptance(id, token, signal, 0));
    if (!result.passed) {
      const failed = result.cases.find(item => !item.passed && item.detail !== PENDING_CASE), test = this.store.require(id).design!.acceptance.find(item => item.id === failed?.id);
      throw new Error('界面验收' + (test ? '「' + test.description + '」' : '') + '仍未通过：' + humanize(failureReason(failed?.detail ?? '')) + '。可以重新验收，或说明这条验收该怎么改');
    }
    this.change(id, value => { value.active = null; value.phase = 'ready'; value.error = null; });
  }
  private async assemble(id: string, token: string, signal: AbortSignal) {
    const design = this.store.require(id).design!;
    for (const part of design.parts) {
      signal.throwIfAborted(); this.current(id, token); if (this.store.require(id).nodes.some(node => node.id === part.id)) continue;
      const choices = pluginComponentChoices(part, design.contract), stepId = 'part:' + design.contract.revision + ':' + part.id;
      this.step(id, { id: stepId, agent: 'ui', action: 'select', label: '选择「' + part.purpose + '」的组件', target: part.id, status: 'active' });
      let selection: NonNullable<AgentBuildStep['selection']> = { source: 'rule', candidates: choices.map(choice => choice.kind), choice: choices[0]!.kind };
      if (choices.length > 1 && this.ports.choose && this.ports.selectionAvailable?.()) {
        try {
          const answer = await this.ports.choose({ key: 'builder-' + randomUUID(), instructions: '只从合法候选中选最适合当前用户旅程的一个组件，不改变属性或合同。', state: JSON.stringify({ title: design.title, journey: design.journey, part }), candidates: choices.map(choice => ({ key: choice.kind, description: choice.description })) });
          signal.throwIfAborted(); this.current(id, token);
          if (!answer.choice || !choices.some(choice => choice.kind === answer.choice)) throw new Error('Jev 没有返回合法组件');
          selection = { source: 'jev', candidates: choices.map(choice => choice.kind), choice: answer.choice, model: answer.model, elapsedMs: answer.elapsedMs, confidence: answer.confidence };
        } catch (error) {
          signal.throwIfAborted(); this.current(id, token); this.change(id, value => { value.pendingPart = { id: part.id, candidates: choices.map(choice => choice.kind), reason: message(error) }; });
          this.step(id, { id: stepId, agent: 'ui', action: 'select', label: '等待选择界面组件', target: part.id, status: 'waiting', detail: message(error) }); return;
        }
      }
      this.current(id, token); this.change(id, value => { value.nodes = inDesignOrder(value.design, [...value.nodes, { ...part, kind: selection.choice as typeof choices[number]['kind'] }]); });
      this.step(id, { id: stepId, agent: 'ui', action: 'place', label: '放入「' + choices.find(choice => choice.kind === selection.choice)!.name + '」', target: part.id, status: 'done', selection });
    }
  }
  private async implement(id: string, token: string, signal: AbortSignal) {
    const initial = this.store.require(id);
    await this.withAgent(id, 'code', async agent => {
      for (const [index, operation] of initial.design!.contract.operations.entries()) {
        signal.throwIfAborted(); this.current(id, token);
        if (this.store.require(id).connected.includes(operation.id)) continue;
        const stepId = 'code:' + initial.design!.contract.revision + ':' + operation.id;
        this.step(id, { id: stepId, agent: 'code', action: 'implement', label: '实现「' + (operation.description || operation.id) + '」', operationId: operation.id, status: 'active' });
        const change = this.store.require(id).rework?.[operation.id];
        let result = await this.check(id, [operation.id], signal);
        // A reworked operation still passes its unchanged checks, so it always gets one run with the change to make.
        for (let attempt = 0; (!result.passed || (change !== undefined && attempt === 0)) && attempt < 4; attempt++) {
          const now = this.store.require(id), revising = initial.history.length > 0;
          const prompt = attempt ? BUILDER_PROMPTS.repair : revising || change ? BUILDER_PROMPTS.revise : BUILDER_PROMPTS.implement;
          // Everything the agent needs is in the task, so its limited turns go to writing and checking, not exploring.
          const siblings = now.design!.contract.operations.map((item, position) => ({ id: item.id, kind: item.kind, description: item.description, input: item.input, output: item.output,
            implementation: 'src/operations/' + position + '.ts', tests: 'tests/operations/' + position + '.ts', implemented: now.connected.includes(item.id) })).filter(item => item.id !== operation.id);
          const shared = await this.ports.sources?.(now) ?? [];
          await this.codeAttempt(agent, id, token, signal, prompt, [operation.id], stepId + ':run:' + attempt,
            { operation, implementation: 'src/operations/' + index + '.ts', tests: 'tests/operations/' + index + '.ts', siblings, shared, failure: result, attempt, maxRepairs: 3, ...(change ? { change } : {}) });
          result = await this.check(id, [operation.id], signal);
        }
        this.current(id, token); this.change(id, build => { build.checks[operation.id] = result; });
        this.step(id, { id: stepId, agent: 'code', action: 'verify', label: result.passed ? '「' + (operation.description || operation.id) + '」已接通' : '「' + (operation.description || operation.id) + '」仍未通过', operationId: operation.id, status: result.passed ? 'done' : 'failed', detail: JSON.stringify(result.gates) });
        if (!result.passed) throw new Error('操作 ' + operation.id + ' 已达到 3 轮修复上限；请修订需求后继续');
        await this.resetPreview(id); this.change(id, build => { build.connected.push(operation.id); if (build.rework) { delete build.rework[operation.id]; if (!Object.keys(build.rework).length) delete build.rework; } });
      }
    });
  }
  /** One code-agent run. A run that runs out of turns or fails still counts as an attempt; the host check decides what follows. */
  private async codeAttempt(agent: Awaited<ReturnType<AgentBuilderPorts['agent']>>, id: string, token: string, signal: AbortSignal,
    prompt: { version: string; text: string }, operationIds: string[], noteId: string, task: Record<string, unknown>) {
    let record: BuilderAgentRecord | undefined;
    try {
      record = await agent.run({ role: 'coder', instruction: prompt.text, promptVersion: prompt.version, contractRevision: this.store.require(id).design!.contract.revision, operationIds, signal,
        task: JSON.stringify(task), checks: (ids, checkSignal) => this.check(id, [...ids], checkSignal),
        onActivity: activity => { if (this.store.require(id).active?.token === token) this.step(id, { id: 'activity:' + randomUUID(), agent: 'code', action: activity.type, label: activity.name, operationId: operationIds[0], status: 'done', detail: activity.detail.slice(0, 12_000), ...(activity.path ? { target: activity.path } : {}) }); } });
    } catch (error) {
      signal.throwIfAborted(); this.current(id, token);
      record = (error as { record?: BuilderAgentRecord }).record;
      this.step(id, { id: noteId, agent: 'code', action: 'note', label: '这一轮没有完成，按检查结果继续修正', operationId: operationIds[0], status: 'done', detail: humanize(message(error)) });
    }
    this.current(id, token); if (record) this.record(id, record);
  }
  /** G7 in a real browser, on an empty preview; the preview is emptied again so the person starts clean. */
  private async acceptance(id: string, token: string, signal: AbortSignal, round: number) {
    await this.resetPreview(id);
    const stepId = 'browser:' + token + ':' + round;
    this.step(id, { id: stepId, agent: 'host', action: 'verify', label: round ? '重新在真实界面执行验收' : '在真实界面执行验收', status: 'active' });
    let result: NonNullable<AgentBuild['browserResult']>;
    try { result = await this.ports.browserAcceptance(this.store.require(id), signal); }
    catch (error) { signal.throwIfAborted(); result = { passed: false, cases: [{ id: '*', passed: false, detail: message(error) }], at: new Date().toISOString() }; }
    this.current(id, token); await this.resetPreview(id);
    this.change(id, value => { value.browserResult = result; });
    this.step(id, { id: stepId, agent: 'host', action: 'verify', label: result.passed ? '界面验收通过' : '界面验收未通过', status: result.passed ? 'done' : 'failed', detail: JSON.stringify(result.cases) });
    return result;
  }
  /**
   * A failed acceptance case goes back to the code agent with the operations its steps touch, at most twice; each
   * round re-runs the full gates and the whole acceptance. Contract and acceptance stay frozen.
   */
  private async repairAcceptance(id: string, token: string, signal: AbortSignal, result: NonNullable<AgentBuild['browserResult']>) {
    for (let round = 1; !result.passed && round <= 2; round++) {
      const design = this.store.require(id).design!, failed = result.cases.find(item => !item.passed && item.detail !== PENDING_CASE);
      const test = design.acceptance.find(item => item.id === failed?.id);
      if (!failed || !test) break;
      // Display problem: the part's data already has the expected text but the part does not show it. That is the
      // designer's configuration, not code; hand it back to the designer and re-place only what changed.
      const display = displayProblem(test, failed.detail, this.store.require(id).design!.parts);
      if (display) {
        const kind = this.store.require(id).nodes.find(node => node.id === display.componentId)?.kind;
        const request = display.type === 'form'
          ? '宿主在界面验收「' + test.description + '」中提交组件 ' + display.componentId + ' 时发现：' + display.reason + '。如果这个字段应该从其他组件带过来（prefill），确认来源命令的结果里有它（没有就加进那个命令的 output）；如果应该由用户填写，在验收里补上 fill 步骤。'
          : display.type === 'display'
          ? '宿主在界面验收「' + test.description + '」中发现：组件 ' + display.componentId + (kind ? '（现在显示为 ' + kind + '，显示 titleField、textField 和 columns 里的字段）' : '') + ' 读到的数据里已经有「' + display.expected.join('」「')
            + '」，但界面上没有显示出来（界面显示的是：' + display.visible.slice(0, 200) + '）。请只调整这个组件的显示设置（titleField、textField、columns 等），让这些内容显示出来（布尔或枚举字段用 columns 里的 values 写成人话，如 {"true": "已打卡", "false": "未打卡"}）；验收只写会显示的值，不要把列名和值连在一起写（组件可能是表格）；不要改操作。'
          : '宿主在界面验收「' + test.description + '」中发现：期望组件 ' + display.componentId + ' 显示「' + display.expected.join('」「') + '」，但它不读取任何操作，内容只能经由设计带过来（界面显示的是：' + display.visible.slice(0, 200)
            + '）。如果内容是另一个组件命令的结果或选中的记录，用 "prefill:组件.字段" 预填这个表单字段；如果是它自己命令的结果，在 submit 里写 "show": "字段" 显示出来；如果验收本身写错了组件，改正验收步骤，但它检查的行为不能变。不要改操作。';
        await this.revise(id, token, signal, request);
        await this.assemble(id, token, signal); this.current(id, token);
        if (this.store.require(id).pendingPart) return result;
        await this.implement(id, token, signal);
        const final = await this.check(id, this.store.require(id).design!.contract.operations.map(item => item.id), signal); this.current(id, token);
        this.change(id, value => { value.checks.global = final; });
        if (!final.passed) throw new Error('调整显示后，门禁没有通过：' + (final.gates.find(gate => !gate.passed)?.detail ?? ''));
        result = await this.acceptance(id, token, signal, round);
        continue;
      }
      const components = new Set(test.steps.flatMap(step => 'componentId' in step ? [step.componentId] : []));
      const operationIds = [...new Set(design.parts.filter(part => components.has(part.id)).flatMap(part => [part.read?.operationId, part.submit?.operationId]).filter((value): value is string => !!value))];
      if (!operationIds.length) break;
      const stepId = 'acceptance-repair:' + token + ':' + round;
      this.step(id, { id: stepId, agent: 'code', action: 'implement', label: '验收「' + test.description + '」未通过，代码 Agent 修正中', operationId: operationIds[0], status: 'active', detail: failed.detail });
      const operations = design.contract.operations.map((item, index) => ({ ...item, implementation: 'src/operations/' + index + '.ts', tests: 'tests/operations/' + index + '.ts' })).filter(item => operationIds.includes(item.id));
      const parts = design.parts.filter(part => components.has(part.id)).map(({ id: partId, intent, purpose, props, read, submit }) => ({ id: partId, intent, purpose, props, read, submit }));
      const shared = await this.ports.sources?.(this.store.require(id)) ?? [];
      await this.withAgent(id, 'code', agent => this.codeAttempt(agent, id, token, signal, BUILDER_PROMPTS.acceptance, operationIds, stepId + ':run',
        { operations, parts, shared, acceptanceFailure: { description: test.description, steps: test.steps, detail: failed.detail }, round }));
      const final = await this.check(id, design.contract.operations.map(item => item.id), signal); this.current(id, token);
      this.change(id, value => { value.checks.global = final; });
      this.step(id, { id: stepId, agent: 'code', action: 'implement', label: final.passed ? '已按验收修正，门禁重新通过' : '修正后门禁未通过', operationId: operationIds[0], status: final.passed ? 'done' : 'failed', detail: JSON.stringify(final.gates) });
      if (!final.passed) throw new Error('按验收修正后，门禁没有通过：' + (final.gates.find(gate => !gate.passed)?.detail ?? ''));
      result = await this.acceptance(id, token, signal, round);
    }
    return result;
  }
  async call(id: string, componentId: string, binding: 'read' | 'submit', payload: unknown) {
    const build = this.store.require(id), node = build.nodes.find(item => item.id === componentId); if (!node || !build.design) throw new Error('界面组件不存在');
    const call = resolvePluginComponentCall(node, binding, payload); if (!build.connected.includes(call.operationId)) throw new Error('这个操作尚未接通，输入已保留');
    return this.ports.call(build, call.operationId, call.input as SandboxJson);
  }
  private async resetPreview(id: string) { await this.ports.resetPreview(id); }
  async pause(id: string) { const job = this.jobs.get(id); if (job) { this.change(id, build => { build.active = null; build.phase = 'paused'; }); job.abort.abort(new Error('用户暂停构建')); await job.done; } return this.store.require(id); }
  async action(id: string, body: Record<string, unknown>) {
    if (body.action === 'pause' || body.action === 'stop') return this.pause(id);
    const build = this.store.require(id); if (body.revision !== build.revision || build.active) throw new Error('草稿已更新或正在构建，请先暂停并刷新');
    if (body.action === 'choose') return this.choose(id, build.revision, String(body.candidateId));
    if (body.action === 'resume') { this.launch(id, build.design ? 'build' : build.chosen && build.candidates.length ? 'detail' : 'design'); return this.store.require(id); }
    if (body.action === 'message' || body.action === 'revise') {
      if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 48_000) throw new Error('请输入具体修改意见');
      this.change(id, value => { value.messages.push({ role: 'user', text: body.message as string }); value.clarificationAnswered ||= !!value.questions.length; value.questions = []; });
      this.launch(id, build.design ? 'revise' : 'design'); return this.store.require(id);
    }
    if (body.action === 'part') {
      const pending = build.pendingPart, part = build.design?.parts.find(item => item.id === pending?.id);
      if (!pending || !part || !pending.candidates.includes(String(body.kind))) throw new Error('组件选择已失效');
      this.change(id, value => { value.nodes = inDesignOrder(value.design, [...value.nodes, { ...part, kind: body.kind as AgentBuild['nodes'][number]['kind'] }]); value.pendingPart = undefined; });
      this.step(id, { id: 'part:' + build.design!.contract.revision + ':' + part.id, agent: 'ui', action: 'place', label: '使用你选择的组件', target: part.id, status: 'done', selection: { source: 'user', candidates: pending.candidates, choice: String(body.kind) } }); this.launch(id, 'build'); return this.store.require(id);
    }
    if (body.action === 'undo') { const previous = build.history.at(-1); if (!previous) throw new Error('没有可撤销的合同修订'); await this.resetPreview(id); this.change(id, value => { value.history.pop(); Object.assign(value, previous); value.connected = []; value.checks = {}; value.browserResult = undefined; value.phase = 'paused'; }); this.launch(id, 'build'); return this.store.require(id); }
    if (body.action === 'remove') { this.store.remove(id, build.revision); await this.resetPreview(id); return null; }
    if (body.action === 'publish') {
      if (build.phase !== 'ready' || !build.browserResult?.passed || !build.checks.global?.passed || !build.design) throw new Error('全部功能和浏览器验收通过后才能发布');
      const latest = this.store.versions(id)[0];
      if (latest && latest.design.contract.revision === build.design.contract.revision && JSON.stringify(latest.nodes) === JSON.stringify(build.nodes)) throw new Error('v' + latest.version + ' 已经是当前这一版，没有新的改动可以发布');
      const version = (this.store.versions(id)[0]?.version ?? 0) + 1, manifest: BuildManifest = { version: 1, pluginId: build.design.contract.pluginId, revision: build.design.contract.revision, effects: contractEffects(build.design) };
      const artifact = await this.ports.publish(build, manifest, build.checks.global.bundlePath!, version);
      const release: AgentRelease = { buildId: id, pluginId: build.design.contract.pluginId, version, design: build.design, nodes: build.nodes, manifest, permissions: manifest.effects, publishedAt: new Date().toISOString(), ...artifact }; this.store.release(release); return release;
    }
    if (['install', 'upgrade', 'rollback', 'disable', 'enable', 'uninstall'].includes(String(body.action))) { const release = this.store.versions(id).find(item => item.version === body.version); if (!release) throw new Error('发布版本不存在'); await this.ports.lifecycle(body.action as Parameters<AgentBuilderPorts['lifecycle']>[0], release, body.grants); return this.store.require(id); }
    throw new Error('未知构建操作');
  }
  async close() { this.closed = true; for (const job of this.jobs.values()) job.abort.abort(new Error('Host closing')); await Promise.all([...this.jobs.values()].map(job => job.done)); await Promise.all(this.store.list().map(build => this.resetPreview(build.id))); this.listeners.clear(); }
}

/** What a revision changed, in the person's words. */
/** What a person calls a function: its description, else its id. */
function operationName(design: AgentDesign, id: string, fallback?: AgentDesign): string {
  const find = (value?: AgentDesign) => value?.contract.operations.find(item => item.id === id)?.description;
  return find(design) || find(fallback) || id;
}
function describeRevision(before: AgentDesign, after: AgentDesign): string {
  const ops = (design: AgentDesign) => new Map(design.contract.operations.map(item => [item.id, JSON.stringify(item)]));
  const [a, b] = [ops(before), ops(after)], changes: string[] = [];
  const added = [...b.keys()].filter(key => !a.has(key)), removed = [...a.keys()].filter(key => !b.has(key)), changed = [...b.keys()].filter(key => a.has(key) && a.get(key) !== b.get(key));
  const named = (ids: string[]) => ids.map(id => '「' + operationName(after, id, before) + '」').join('、');
  if (added.length) changes.push('新增功能 ' + named(added));
  if (removed.length) changes.push('移除功能 ' + named(removed));
  if (changed.length) changes.push('调整功能 ' + named(changed));
  const parts = (design: AgentDesign) => new Map(design.parts.map(item => [item.id, JSON.stringify(item)]));
  const [p, q] = [parts(before), parts(after)];
  const partChanges = [...q.keys()].filter(key => p.get(key) !== q.get(key)).length + [...p.keys()].filter(key => !q.has(key)).length;
  if (partChanges) changes.push(partChanges + ' 个界面零件有变化');
  return '主线已修订：' + (changes.join('；') || '只调整了文字与验收');
}

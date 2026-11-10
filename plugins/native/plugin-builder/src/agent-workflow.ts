import { studioProblem } from "./studio-problem.js";
import { failStudioBuild, studioAcceptanceFailure, studioBuildFailure, studioBuildFailureOf, studioCapabilitySelection, studioProposalStep, studioRevisionStep, studioStep } from './studio-collaboration.js';
import { freezeStudioUi, studioUiAnswer, type StudioDesignLanguages } from "./agent-ui-text.js";
import { inDesignOrder, type AgentPublicationControl, type AgentRelease as PublishedAgentRelease } from './agent-model.js';
import { recheckAgentBuild } from './agent-recheck.js';
import { publishAgentBuild, buildScope, releaseScope } from './agent-publication.js';
import { effectsFromContract } from '@molis-ai/molis-work-plugin-sdk';
import { randomUUID } from 'node:crypto';
import type { PluginPrivateStorage, PluginExecutionControl } from '@molis-ai/molis-work-contracts/platform/plugin';
import { pluginComponentChoices, projectComponentMetadata, resolvePluginComponentCall } from '@molis-ai/molis-work-design-system';
import type { SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { BuilderAgentRequest, BuilderAgentRecord, BuilderSkill } from '@molis-ai/molis-work-contracts/services/agent-host';
import type { BuildManifest, BuildCheckResult } from '@molis-ai/molis-work-contracts/platform/plugin-builder';
import type { InstructionPrompt } from '@molis-ai/molis-work-contracts/platform/model-prompts';
import { AgentBuilderStore } from './agent-store.js';
import { reviseCheckedPresentation } from './checked-presentation.js';
import { BUILDER_PROMPTS, type BuilderPromptName } from './agent-prompts.js';
import { BUILDER_CHOOSE_CAPABILITY, BUILDER_CHOOSE_COMPONENT } from './choice-prompts.js';
import { capabilityCandidates, focusCatalog, usedCapabilities, withinBudget, type CatalogEntry } from './agent-catalog.js';
import { validateAgentDesign } from './agent-validation.js';
import { parseModelJson } from './model-json.js';
import { expandDesign, normalizeProposal } from './agent-authoring.js';
import { presentationTask, presentationReviewTask, acceptPresentation } from './agent-presentation.js';
import { proposalSketch, experienceTask, acceptExperience } from './agent-experience.js';
import { acceptPresentationReview } from './agent-review.js';
import { displayProblem } from './agent-diagnostics.js';
export { failureReason, humanize } from './agent-diagnostics.js';
import type { AgentBuild, AgentDesign, AgentBuildSnapshot, AgentBuildStep, AgentProposal, AgentRelease } from './agent-model.js';

export interface AgentBuilderPorts {
  projectId: string;
  /** The host supports versioned whole-page composition. */
  presentation?: boolean;
  visionAvailable?(): boolean;
  inspectPresentation?(build: AgentBuild, signal: AbortSignal): Promise<{ structural: boolean; issues: string[]; images: NonNullable<BuilderAgentRequest['images']> }>;
  catalog(scope?: 'project' | 'home'): Promise<CatalogEntry[]>;
  resources?: readonly string[];
  models(): Promise<readonly { provider_id: string; model_id: string; label: string }[]>;
  agent(build: AgentBuild, purpose: 'design' | 'code'): Promise<{ run(request: BuilderAgentRequest): Promise<BuilderAgentRecord>; close(): Promise<void>; records(): Promise<BuilderAgentRecord[]> }>;
  designLanguages?(): StudioDesignLanguages;
  runInLanguage?<T>(run: () => T, recovered: boolean): T;
  /** The ordered standards for this stage, from the same Skill official plugin authors use. */
  skills?(stage: 'design' | 'code' | 'experience' | 'ui' | 'review'): readonly BuilderSkill[];
  /**
   * The text an Agent prompt runs with now: the person's edit (from “Prompt 与 Character”) or the shipped default. The
   * version names which, so a run's record says whether it used the person's text.
   */
  prompt?(name: BuilderPromptName, shipped: { version: string; text: string }): { version: string; text: string };
  /**
   * The text a registered instruction (the two questions put to Jev, `choice-prompts.ts`) runs with now: the person's edit from
   * 设置 › 提示词, or its default. Absent, the workflow asks with the default.
   */
  instruction?(prompt: InstructionPrompt): string;
  /** The capability catalog new designs are made against. */
  catalogVersion?: string;
  /** Plugins a design uses that this project has not enabled, and enabling them. */
  missingPlugins?(design: AgentDesign, scope?: 'project' | 'home'): Promise<Array<{ pluginId: string; title: string; capabilities: string[] }>>;
  enablePlugins?(pluginIds: readonly string[]): Promise<void>;
  validateContract(contract: unknown): void;
  prepareBuild(previous: AgentBuild, design: AgentDesign, manifest: BuildManifest): Promise<string>;
  check(build: AgentBuild, operationIds: string[], signal: AbortSignal): Promise<BuildCheckResult>;
  call(build: AgentBuild, operationId: string, input: SandboxJson, control?: Pick<PluginExecutionControl, "signal" | "beforeEffect">): Promise<SandboxJson>;
  resetPreview(buildId: string, beforeReset?: () => void): Promise<void>;
  choose?(question: { key: string; instructions: string; state: string; candidates: readonly { key: string; description: string }[] }): Promise<{ choice: string | null; model: string; elapsedMs: number; confidence: number | null }>;
  /** How many operations are written at once (default 3; 1 writes them one after another). */
  parallel?: number;
  /**
   * Pictures of proposals (W7), when an image service is configured here. `draw` makes one attempt and resolves when
   * the picture is ready, or with the reason it is not; a failed request is never repeated (it may have cost money).
   */
  mockups?: { available(): Promise<boolean>; draw(request: { key: string; prompt: string }, signal: AbortSignal): Promise<{ jobId: string; imageId: string } | { reason: string }> };
  selectionAvailable?(): boolean;
  browserAcceptance(build: AgentBuild, signal: AbortSignal): Promise<NonNullable<AgentBuild['browserResult']>>;
  /** Shared source modules already in the build (src/*.ts other than the operation files and the entry). */
  sources?(build: AgentBuild): Promise<string[]>;
  publish(build: AgentBuild, manifest: BuildManifest, bundlePath: string, version: number, control: AgentPublicationControl): Promise<PublishedAgentRelease>;
  installations(): Promise<unknown[]>;
  lifecycle(action: 'install' | 'upgrade' | 'rollback' | 'disable' | 'enable' | 'uninstall', release: AgentRelease, grants?: unknown): Promise<void>;
}
const snapshot = (build: AgentBuild): AgentBuildSnapshot => ({ design: build.design, nodes: build.nodes, connected: build.connected, ...(build.directory ? { directory: build.directory } : {}), ...(build.designSource ? { designSource: build.designSource } : {}), checks: build.checks, checksScope: build.checksScope, browserResult: build.browserResult, visualResult: build.visualResult });
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
/** One of the two questions put to Jev as it runs now: the person's edit from the host, or the registered default. */
const instructionText = (ports: AgentBuilderPorts, prompt: InstructionPrompt): string => ports.instruction?.(prompt) ?? prompt.body;
const PENDING_CASE = '前置用例失败，尚未执行';
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

/** The stage's Skill, and a prompt version that names the exact standard the run followed. */
function mounted(ports: AgentBuilderPorts, stage: 'design' | 'code' | 'experience' | 'ui' | 'review', version: string): Pick<BuilderAgentRequest, 'promptVersion' | 'skills'> {
  const skills = ports.skills?.(stage);
  return skills?.length ? { promptVersion: [version, ...skills.map(skill => skill.id + '@' + skill.version)].join('+'), skills } : { promptVersion: version };
}

/** Durable host-driven state machine. Browser views subscribe; no browser tick starts work. */
export class AgentBuilderWorkflow {
  /** An Agent prompt as it runs now: the host's registered version (the person's edit) or the shipped text. */
  private prompt(name: BuilderPromptName): { version: string; text: string } {
    const shipped = BUILDER_PROMPTS[name];
    return this.ports.prompt?.(name, shipped) ?? shipped;
  }
  readonly store: AgentBuilderStore;
  private readonly jobs = new Map<string, { abort: AbortController; done: Promise<void> }>();
  /** Mockups being drawn; they outlive the job that proposed them and stop when the host closes. */
  private readonly drawing = new Set<AbortController>();
  private readonly listeners = new Set<(build: AgentBuild) => void>();
  private closed = false;
  constructor(storage: PluginPrivateStorage, private readonly ports: AgentBuilderPorts) { this.store = new AgentBuilderStore(storage); }
  async initialize() {
    for (const build of this.store.list()) if (build.active) {
      const stage = build.active.stage;
      this.change(build.id, value => { value.active = null; value.phase = 'paused'; value.error = studioBuildFailure('build-interrupted', '', { guidance: 'build-continue-after-restart' }); for (const step of value.steps) if (step.status === 'active') step.status = 'cancelled'; });
      // Recovered build jobs continue from persisted files. Design is safe to retry with a new session.
      this.launch(build.id, stage, true);
    }
  }
  subscribe(listener: (build: AgentBuild) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private change(id: string, mutate: (build: AgentBuild) => void) {
    const build = this.store.update(id, this.store.require(id).revision, mutate);
    for (const listener of this.listeners) try { listener(build); } catch { /* view disconnects do not stop execution */ }
    return build;
  }
  private step(id: string, step: Omit<AgentBuildStep, 'at'>) { this.change(id, build => { const existing = build.steps.findIndex(item => item.id === step.id); const next = { ...step, at: new Date().toISOString() }; if (existing < 0) build.steps.push(next); else build.steps[existing] = next; pruneSteps(build.steps); }); }
  private current(id: string, token: string) { if (this.closed || this.store.require(id).active?.token !== token) throw studioProblem("plugin-builder.request.older-build-discarded", '旧构建结果已作废'); }
  async state() { return { builds: this.store.list(), releases: this.store.releases(), installations: await this.ports.installations(), models: await this.ports.models(), selectionAvailable: Boolean(this.ports.choose && this.ports.selectionAvailable?.()), runtimeAvailable: true }; }
  create(brief: string) { const build = this.store.create(brief); this.launch(build.id, 'design'); return this.store.require(build.id); }
  private launch(id: string, stage: NonNullable<AgentBuild['active']>['stage'], recovered = false) {
    // A job told to stop no longer counts: its results are void, and the next run may start.
    if (this.closed || this.jobs.get(id)?.abort.signal.aborted === false) throw studioProblem("plugin-builder.request.draft-busy", '此草稿已有执行中的工作');
    const abort = new AbortController(), token = randomUUID(), signal = abort.signal;
    this.change(id, build => { build.phase = stage === 'build' || stage === 'check' ? 'building' : 'designing'; build.error = null; build.pendingPlugins = undefined; build.active = { token, stage, contractRevision: build.design?.contract.revision }; });
    // Detail and revision end in a frozen design, and the same job goes straight on to build it. Every way into a build
    // (including resuming one) first checks that the plugins the design uses are enabled in the project.
    const build = async () => { if (!await this.waitForPlugins(id, token)) await this.build(id, token, signal); };
    const work = stage === 'check' ? () => recheckAgentBuild(this.ports, () => this.store.require(id), mutate => { this.current(id, token); this.change(id, mutate); }, () => { signal.throwIfAborted(); this.current(id, token); }, signal)
      : stage === 'design' ? () => this.propose(id, token, signal)
      : stage === 'detail' ? async () => { await this.detail(id, token, signal); await build(); }
      : stage === 'visual' ? () => this.reviseVisual(id, token, signal)
      : stage === 'revise' ? async () => { await this.revise(id, token, signal); await build(); }
      : build;
    const start = () => Promise.resolve().then(work);
    const done = (this.ports.runInLanguage?.(start, recovered) ?? start()).catch(error => {
      if (this.store.require(id).active?.token === token) this.change(id, build => { build.active = null; build.phase = abort.signal.aborted ? 'paused' : 'failed'; build.error = studioBuildFailureOf(error); for (const step of build.steps) if (step.status === 'active') { step.status = abort.signal.aborted ? 'cancelled' : 'failed'; step.detail = message(error); } });
    }).finally(() => { if (this.jobs.get(id)?.abort === abort) this.jobs.delete(id); });
    this.jobs.set(id, { abort, done });
  }
  /**
   * A design that uses capabilities of plugins this project has not enabled waits for the person: enabling them
   * continues the build; declining sends the design back without them. Returns true when the build now waits.
   */
  private async waitForPlugins(id: string, token: string): Promise<boolean> {
    const design = this.store.require(id).design, missing = design && this.ports.missingPlugins ? await this.ports.missingPlugins(design, buildScope(this.store.require(id))) : [];
    this.current(id, token);
    if (!missing.length) return false;
    this.change(id, build => { build.pendingPlugins = missing; build.active = null; build.phase = 'paused'; });
    this.step(id, { id: 'plugins:' + design!.contract.revision, agent: 'host', action: 'decide', label: studioStep('plugins-needed'), status: 'waiting',
      detail: missing.map(item => item.title + '：' + item.capabilities.join('、')).join('\n') });
    return true;
  }
  private async withAgent<T>(id: string, purpose: 'design' | 'code', action: (agent: Awaited<ReturnType<AgentBuilderPorts['agent']>>) => Promise<T>) {
    const agent = await this.ports.agent(this.store.require(id), purpose); try { return await action(agent); } finally { await agent.close(); }
  }
  private record(id: string, record: BuilderAgentRecord) { this.change(id, build => { build.runs.push({ id: record.id, role: record.role, phase: record.phase, configuredModel: record.configuredModel, reportedModels: record.reportedModels, promptVersion: record.promptVersion, ...(record.error ? { error: record.error } : {}) }); if (build.runs.length > MAX_RUNS) build.runs.splice(0, build.runs.length - MAX_RUNS); }); }
  /**
   * One designer answer with the host's repair loop: a rejected answer goes back to the same role with the exact reason,
   * at most twice in a row. Long structured answers are where models most often slip.
   */
  private async designer<T>(id: string, token: string, signal: AbortSignal, stepId: string, task: Record<string, unknown>, accept: (output: string) => T, images?: BuilderAgentRequest['images']): Promise<T> {
    const stage = task.mode === 'compose' ? 'ui' : task.mode === 'experience' ? 'experience' : 'design', prompt = this.prompt(stage === 'design' ? 'designer' : stage);
    let repair: { previousAnswer: string; validationError: string } | undefined;
    for (let attempt = 0; ; attempt++) {
      const current = this.store.require(id);
      const ask = () => this.withAgent(id, 'design', agent => agent.run({ role: 'designer', instruction: prompt.text, ...mounted(this.ports, stage, prompt.version),
        contractRevision: current.design?.contract.revision ?? 'draft', signal, ...(images?.length ? { images } : {}), task: JSON.stringify(repair ? { ...task, repair } : task) }));
      // A dropped connection to the model is not the designer's answer: ask again (see RETRY_WAITS) before giving up.
      let record: BuilderAgentRecord | undefined;
      for (let retry = 0; !record; retry++) {
        try { record = await ask(); }
        catch (error) {
          signal.throwIfAborted(); this.current(id, token);
          if (!TRANSIENT.test(message(error))) throw error;
          if (retry >= RETRY_WAITS.length) throw modelUnreachable(error);
          this.step(id, { id: stepId + ':retry:' + attempt + ':' + retry, agent: 'design', action: 'note', label: studioStep('model-retry', { round: retry + 1 }), status: 'done', detail: message(error) });
          await new Promise(resolve => setTimeout(resolve, RETRY_WAITS[retry]));
        }
      }
      this.current(id, token); this.record(id, record);
      try { return accept(record.output); }
      catch (error) {
        // A designer answer takes seconds; a third repair costs little and saves the whole stage.
        if (attempt >= 3 || !record.output.trim()) throw failStudioBuild('design-step-did-not-finish', error, { guidance: 'choose-continue-let-ai-design-again-describe-what' });
        repair = { previousAnswer: record.output.slice(0, 30_000), validationError: message(error) };
        this.step(id, { id: stepId + ':repair:' + attempt, agent: stage === 'design' ? 'design' : 'ui', action: 'repair', label: studioStep(stage === 'experience' ? 'repair-experience' : stage === 'ui' ? 'repair-ui' : 'repair-design', { round: attempt + 1 }), status: 'done', detail: message(error) });
      }
    }
  }
  /** The catalog as the designer sees it: what bears on `focus` in full, what the design already uses always, the rest summarised. */
  private async designContext(id: string, focus = '', keep: readonly string[] = []) {
    const all = await this.ports.catalog(buildScope(this.store.require(id))), { capabilities, moreCapabilities } = focusCatalog(all, focus, keep);
    return { all, catalog: withinBudget(capabilities, keep), more: moreCapabilities, ids: all.map(item => item.id), resources: [...(this.ports.resources ?? [])] };
  }
  /** Stage one: clarify once at most, then 2–3 product-level proposals the person compares on the canvas. */
  private async propose(id: string, token: string, signal: AbortSignal) {
    const initial = this.store.require(id), stepId = 'design:' + token, { catalog, more, ids } = await this.designContext(id, [initial.brief, ...initial.messages.map(item => item.text)].join('\n'));
    this.step(id, { id: stepId, agent: 'design', action: 'design', label: studioStep('understanding-request'), status: 'active' });
    const outcome = await this.designer(id, token, signal, stepId, { mode: 'propose', brief: initial.brief, messages: initial.messages, clarificationAllowed: !initial.clarificationAnswered,
      capabilities: catalog, moreCapabilities: more, resources: this.ports.resources ?? [] }, (output): ProposeOutcome => {
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
      this.step(id, { id: stepId, agent: 'design', action: 'design', label: studioStep('questions', { count: outcome.questions.length }), status: 'waiting' });
      return;
    }
    this.change(id, build => { build.candidates = outcome.proposals; build.chosen = undefined; build.questions = []; build.phase = 'choosing'; build.active = null; build.notes = outcome.dropped.slice(0, 40);
      if (outcome.summary) build.messages.push({ role: 'assistant', text: outcome.summary }); });
    this.step(id, { id: stepId, agent: 'design', action: 'design', label: studioStep('proposed', { count: outcome.proposals.length }), status: 'done', detail: outcome.proposals.map(item => item.title).join(' · ') });
    void this.drawMockups(id, outcome.proposals);
  }
  /**
   * W7: with an image service, each proposal gets one picture to choose by; without one, nothing changes. Drawing
   * never holds up the person: they can choose before the pictures arrive.
   */
  private async drawMockups(id: string, proposals: AgentProposal[]) {
    const mockups = this.ports.mockups;
    if (!mockups || this.closed || !await mockups.available().catch(() => false)) return;
    const abort = new AbortController(); this.drawing.add(abort);
    const set = (candidateId: string, mockup: NonNullable<AgentProposal['mockup']>) => { if (!this.closed) this.change(id, build => { const item = build.candidates.find(candidate => candidate.id === candidateId); if (item) item.mockup = mockup; }); };
    try {
      await Promise.all(proposals.map(async proposal => {
        set(proposal.id, { status: 'drawing' });
        const result = await mockups.draw({ key: id + ':' + proposal.id, prompt: mockupPrompt(proposal) }, abort.signal).catch(error => ({ reason: message(error) }));
        set(proposal.id, 'jobId' in result ? { status: 'ready', jobId: result.jobId, imageId: result.imageId } : { status: 'failed', reason: result.reason });
      }));
    } finally { this.drawing.delete(abort); }
  }
  /** Expands and strictly validates one full design answer (detail or revision). */
  private acceptDesign(id: string, output: string, base: { id: string; title: string; description: string; rationale: string; journey: string[] }, capabilities: CatalogEntry[], resources: string[]) {
    const language = this.ports.designLanguages?.();
    const value = parseModelJson(output, language !== undefined), dropped: string[] = [];
    const design = expandDesign(value, base, 'io.molis.work.generated.' + id, randomUUID(), dropped, capabilities);
    const valid = validateAgentDesign(design, capabilities.map(item => item.id), resources, this.ports.validateContract);
    const source = value && typeof value === 'object' && !Array.isArray(value) && 'design' in value ? (value as { design: unknown }).design : value;
    if (language) freezeStudioUi(valid, source && typeof source === 'object' && 'uiText' in source ? source.uiText : undefined, language, this.store.require(id).design?.contract.ui?.locales);
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
    // A build keeps the catalog it began with, so code already written against it keeps working; new builds use the current one.
    const previous = this.store.require(id).design;
    if (previous?.experience) valid.experience = previous.experience;
    const catalog = previous ? previous.catalog : this.ports.catalogVersion;
    if (catalog) valid.catalog = catalog; else delete valid.catalog;
    return { design: valid, dropped, source: JSON.stringify(source), rework };
  }
  /** Stage two: the chosen proposal in full: contract, parts and browser acceptance. Then the build starts. */
  private async detail(id: string, token: string, signal: AbortSignal) {
    const initial = this.store.require(id), chosen = initial.candidates.find(item => item.id === initial.chosen);
    if (!chosen) throw studioProblem("plugin-builder.request.chosen-proposal-expired", '选中的方案已失效，请重新选择');
    // Capabilities are settled before the design is written in full: it is written against their real inputs and outputs.
    let proposal = await this.pickCapabilities(id, token, signal, chosen), experience: AgentDesign['experience'], sketch: ReturnType<typeof acceptExperience>['sketch'] = proposalSketch(proposal);
    if (this.ports.presentation) {
      const step = 'experience:' + token;
      this.step(id, { id: step, agent: 'ui', action: 'design', label: studioStep('sketching-experience'), status: 'active' });
      const planned = await this.designer(id, token, signal, step, { ...experienceTask(initial.brief, proposal), messages: initial.messages }, output => acceptExperience(output, proposal));
      proposal = planned.proposal; experience = planned.experience; sketch = planned.sketch;
      this.step(id, { id: step, agent: 'ui', action: 'design', label: studioStep('experience-shared'), status: 'done', detail: experience.summary });
    }
    const picked = usedCapabilities(proposal.preview.contract.operations);
    const stepId = 'detail:' + token, { all, catalog, more, resources } = await this.designContext(id, [initial.brief, proposal.title, proposal.description, ...proposal.journey,
      ...proposal.preview.contract.operations.map(operation => operation.description)].join('\n'), picked);
    this.step(id, { id: stepId, agent: 'design', action: 'design', ...studioProposalStep(proposal.title), status: 'active' });
    const result = await this.designer(id, token, signal, stepId, { mode: 'detail', brief: initial.brief, messages: initial.messages, proposal: sketch, experience, capabilities: catalog, moreCapabilities: more, resources,
      ...(this.ports.designLanguages ? { uiText: studioUiAnswer(this.ports.designLanguages()) } : {}) },
      output => this.acceptDesign(id, output, proposal, all, resources));
    if (experience) result.design.experience = experience;
    await this.adopt(id, token, result, stepId, studioStep('design-frozen', { operations: result.design.contract.operations.length, parts: result.design.parts.length, checks: result.design.acceptance.length }));
  }
  /**
   * For each capability the chosen proposal names, the legal alternatives (same kind, close in purpose). With more than
   * one, Jev picks for the operation, as it does for components; if Jev cannot, the designer's choice stands. Returns the
   * proposal with the picks in place; the stored proposal is left as the designer wrote it.
   */
  private async pickCapabilities(id: string, token: string, signal: AbortSignal, proposal: AgentProposal): Promise<AgentProposal> {
    const catalog = await this.ports.catalog(buildScope(this.store.require(id))), picked = structuredClone(proposal), jev = Boolean(this.ports.choose && this.ports.selectionAvailable?.());
    for (const operation of picked.preview.contract.operations) {
      const named = operation.effects.capabilities ?? [], purpose = operation.description ?? operation.id;
      for (const [index, capability] of named.entries()) {
        const candidates = capabilityCandidates(catalog, capability, purpose);
        if (candidates.length < 2) continue;
        signal.throwIfAborted(); this.current(id, token);
        const stepId = 'capability:' + token + ':' + operation.id + ':' + capability, title = (entry: CatalogEntry) => entry.title ?? entry.id;
        this.step(id, { id: stepId, agent: 'design', action: 'select', label: studioStep('choosing-capability', { purpose: operation.id }), target: operation.id, status: 'active' });
        let selection: NonNullable<AgentBuildStep['selection']> = { source: 'rule', candidates: candidates.map(entry => entry.id), choice: capability };
        let refusal: { detail?: string } | undefined;
        if (jev) {
          try {
            const answer = await this.ports.choose!({ key: 'builder-' + randomUUID(), instructions: instructionText(this.ports, BUILDER_CHOOSE_CAPABILITY),
              state: JSON.stringify({ title: picked.title, journey: picked.journey, operation: { id: operation.id, description: purpose, kind: operation.kind } }),
              candidates: candidates.map(entry => ({ key: entry.id, description: title(entry) + '（' + (entry.source ?? '平台') + '）：' + entry.description })) });
            signal.throwIfAborted(); this.current(id, token);
            if (answer.choice && candidates.some(entry => entry.id === answer.choice)) {
              selection = { source: 'jev', candidates: selection.candidates, choice: answer.choice, model: answer.model, elapsedMs: answer.elapsedMs, confidence: answer.confidence };
            } else refusal = { detail: typeof answer.choice === 'string' ? answer.choice : undefined };
          } catch (error) { signal.throwIfAborted(); this.current(id, token); refusal = { detail: message(error) }; }
        }
        named[index] = selection.choice;
        const entry = candidates.find(item => item.id === selection.choice)!;
        this.step(id, { id: stepId, agent: 'design', action: 'place', ...studioCapabilitySelection(operation.id, title(entry), entry.id, capability, refusal), target: operation.id, status: 'done', selection });
      }
      if (named.length) operation.effects.capabilities = [...new Set(named)];
    }
    return picked;
  }
  /** A change request on a designed plugin: one revised design; what did not change keeps its parts and working code. */
  /** `hostRequest` is a revision the host asks for itself, e.g. after acceptance found a display problem. */
  private async revise(id: string, token: string, signal: AbortSignal, hostRequest?: string) {
    const initial = this.store.require(id), design = initial.design;
    if (!design) throw studioProblem("plugin-builder.request.no-design-to-change", '还没有确定的方案可以修改');
    const request = hostRequest ?? [...initial.messages].reverse().find(item => item.role === 'user')?.text ?? '';
    const stepId = 'revise:' + token + (hostRequest ? ':' + randomUUID().slice(0, 8) : ''), { all, catalog, more, resources } = await this.designContext(id, [initial.brief, request, design.title].join('\n'), usedCapabilities(design.contract.operations));
    this.step(id, { id: stepId, agent: 'design', action: 'design', label: studioStep(hostRequest ? 'revising-display' : 'revising-design'), status: 'active', detail: request.slice(0, 300) });
    const result = await this.designer(id, token, signal, stepId, { mode: 'revise', brief: initial.brief, request, messages: initial.messages, experience: design.experience,
      current: initial.designSource ? JSON.parse(initial.designSource) : { title: design.title, operations: design.contract.operations, parts: design.parts, acceptance: design.acceptance },
      capabilities: catalog, moreCapabilities: more, resources, ...(this.ports.designLanguages ? { uiText: studioUiAnswer(this.ports.designLanguages(), design.contract.ui?.locales) } : {}) }, output => this.acceptDesign(id, output, design, all, resources));
    const revision = studioRevisionStep(design, result.design, Object.keys(result.rework), Boolean(hostRequest));
    await this.adopt(id, token, result, stepId, revision.label, revision.detail);
  }
  /** Freezes a design: a new build directory keeps unchanged operations' code; unchanged parts and wiring stay. */
  private async adopt(id: string, token: string, result: { design: AgentDesign; dropped: string[]; source: string; rework?: Record<string, string> }, stepId: string, summary: AgentBuildStep['label'], detail = '') {
    const before = this.store.require(id), design = result.design;
    const manifest: BuildManifest = { version: /* @version format.builder.build-manifest */ 1, pluginId: design.contract.pluginId, revision: design.contract.revision, effects: effectsFromContract(design.contract) };
    const directory = await this.ports.prepareBuild(before, design, manifest); this.current(id, token);
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const kept = before.design ? before.nodes.filter(node => { const { kind: _kind, ...plan } = node; const next = design.parts.find(part => part.id === node.id); return !!next && same(plan, next); }) : [];
    const rework = result.rework ?? {};
    const unchanged = before.design ? before.connected.filter(operationId => !rework[operationId] && same(before.design!.contract.operations.find(item => item.id === operationId), design.contract.operations.find(item => item.id === operationId))) : [];
    await this.resetPreview(id, token);
    this.change(id, value => {
      if (value.design) value.history.push(snapshot(value));
      if (value.history.length > 20) value.history.splice(0, value.history.length - 20);
      value.design = design; value.designSource = result.source; value.title = design.title; value.directory = directory; value.notes = result.dropped.slice(0, 40);
      value.nodes = kept; value.connected = unchanged; value.checks = {}; value.browserResult = undefined; value.visualResult = undefined; value.pendingPart = undefined; value.pendingVisual = undefined;
      if (Object.keys(rework).length) value.rework = rework; else delete value.rework;
      value.active = value.active ? { ...value.active, stage: 'build', contractRevision: design.contract.revision } : value.active; value.phase = 'building';
    });
    this.step(id, { id: stepId, agent: 'design', action: 'design', label: summary, status: 'done', detail: [detail, ...result.dropped.slice(0, 12)].filter(Boolean).join('\n') || undefined });
  }
  async choose(id: string, revision: number, candidateId: string) {
    const build = this.store.require(id); if (build.revision !== revision || build.active) throw studioProblem("plugin-builder.request.draft-changed", '草稿已改变，请刷新');
    if (!build.candidates.some(item => item.id === candidateId)) throw studioProblem("plugin-builder.request.proposal-expired", '方案已失效');
    this.change(id, value => { value.chosen = candidateId; });
    this.launch(id, 'detail'); return this.store.require(id);
  }

  private async check(id: string, operations: string[], signal: AbortSignal) {
    return this.ports.check(this.store.require(id), operations, signal);
  }
  private async build(id: string, token: string, signal: AbortSignal) {
    const [ui, code] = await Promise.allSettled([this.assemble(id, token, signal), this.implement(id, token, signal)]);
    if (ui.status === 'rejected') throw ui.reason;
    if (code.status === 'rejected') {
      const need = (code.reason as { missingCapability?: { operation: string; capability: string } }).missingCapability;
      if (!need || !(await this.ports.catalog(buildScope(this.store.require(id)))).some(entry => entry.id === need.capability)) throw code.reason;
      signal.throwIfAborted(); this.current(id, token);
      // Once: the designer adds the capability the code needs, and the build carries on against the revised contract.
      this.step(id, { id: 'capability-needed:' + token + ':' + need.operation, agent: 'host', action: 'note', label: studioStep('capability-needed', { purpose: need.operation, capability: need.capability }), status: 'done' });
      await this.revise(id, token, signal, '操作 ' + need.operation + ' 的代码需要调用能力 ' + need.capability + '（例如为了返回合同要求的字段），但它的 effects.capabilities 里没有声明。请把 ' + need.capability + ' 加进这个操作的 effects.capabilities，其余保持不变。');
      await Promise.all([this.assemble(id, token, signal), this.implement(id, token, signal)]);
    }
    this.current(id, token); const build = this.store.require(id);
    if (build.pendingPart) { this.change(id, value => { value.active = null; value.phase = 'paused'; }); return; }
    const final = await this.check(id, build.design!.contract.operations.map(item => item.id), signal); this.current(id, token);
    this.change(id, value => { value.checks.global = final; value.checksScope = value.runtimeScope; value.scopeCheckPending = undefined; }); if (!final.passed) throw failStudioBuild('build-checks-failed', final.gates.find(gate => !gate.passed)?.detail ?? '');
    const result = await this.repairAcceptance(id, token, signal, await this.acceptance(id, token, signal, 0));
    if (!result.passed) throw studioAcceptanceFailure(result, this.store.require(id).design!.acceptance);
    await this.smoke(id, token, signal);
    await this.reviewPresentation(id, token, signal);
    this.change(id, value => { value.active = null; value.phase = 'ready'; value.error = null; });
  }
  /**
   * Stand-ins cannot catch a wrong id or a record the other plugin cannot read. Before the build is ready, each query
   * that reads another plugin's data runs once on real data (reading changes nothing). An error goes to the code agent
   * with the real message, and the query is tried again once.
   */
  private async smoke(id: string, token: string, signal: AbortSignal) {
    const run = async () => {
      for (const operation of this.store.require(id).design!.contract.operations) {
        if (operation.kind !== 'query' || !operation.effects.capabilities?.length) continue;
        const input = (operation.examples.find(example => example.error === undefined)?.input ?? {}) as SandboxJson;
        try { await this.ports.call(this.store.require(id), operation.id, input); }
        catch (error) { return { operation, error: message(error) }; }
      }
      return null;
    };
    let broken = await run(); this.current(id, token);
    if (!broken) return;
    const stepId = 'smoke:' + token;
    this.step(id, { id: stepId, agent: 'code', action: 'implement', label: studioStep('repairing-live-read', { operation: broken.operation.id }), operationId: broken.operation.id, status: 'active', detail: broken.error });
    const index = this.store.require(id).design!.contract.operations.findIndex(item => item.id === broken!.operation.id);
    await this.withAgent(id, 'code', agent => this.codeAttempt(agent, id, token, signal, this.prompt('repair'), [broken!.operation.id], stepId + ':run', {
      operation: broken!.operation, implementation: 'src/operations/' + index + '.ts', tests: 'tests/operations/' + index + '.ts', attempt: 1, maxRepairs: 1,
      failure: { passed: false, gates: [{ id: 'G7', passed: false, detail: '检查里别处的数据由替身代答，这次用真实数据读取时出错：' + broken!.error + '。按真实返回修正（例如传对编号、读不到时照样列出），不要改合同' }] } }));
    const checked = await this.check(id, this.store.require(id).design!.contract.operations.map(item => item.id), signal); this.current(id, token);
    this.change(id, value => { value.checks.global = checked; value.checksScope = value.runtimeScope; value.scopeCheckPending = undefined; });
    if (!checked.passed) throw failStudioBuild('build-checks-failed', checked.gates.find(gate => !gate.passed)?.detail ?? '');
    await this.resetPreview(id, token);
    broken = await run(); this.current(id, token);
    this.step(id, { id: stepId, agent: 'code', action: 'implement', label: studioStep(broken ? 'live-read-failed' : 'live-read-fixed'), operationId: broken?.operation.id, status: broken ? 'failed' : 'done', detail: broken?.error });
    if (broken) throw failStudioBuild('build-live-read-failed', broken.error, { values: { operation: broken.operation.id } });
  }
  private async compose(id: string, token: string, signal: AbortSignal, request: string, history = false, review?: { issues: string[]; images: BuilderAgentRequest['images'] }) {
    const initial = this.store.require(id), stepId = 'compose:' + token;
    this.step(id, { id: stepId, agent: 'ui', action: 'design', label: studioStep('designing-layout'), status: 'active' });
    const result = await this.designer(id, token, signal, stepId, presentationTask(initial, request, review?.issues), output => acceptPresentation(output, initial.design!), review?.images);
    this.current(id, token);
    this.change(id, value => {
      if (history) { value.history.push(snapshot(value)); if (value.history.length > 20) value.history.shift(); }
      value.design = result.design; value.visualResult = undefined; value.browserResult = undefined;
      value.nodes = value.nodes.map(node => ({ ...result.design.parts.find(part => part.id === node.id)!, kind: (result.design.presentation!.parts[node.id]?.kind ?? node.kind) as typeof node.kind }));
    });
    this.step(id, { id: stepId, agent: 'ui', action: 'design', label: studioStep('layout-applied'), status: 'done', detail: result.summary });
  }
  private async reviseVisual(id: string, token: string, signal: AbortSignal) {
    await reviseCheckedPresentation({ read: () => this.store.require(id), current: () => this.current(id, token), change: mutate => this.change(id, mutate),
      check: () => this.check(id, this.store.require(id).design!.contract.operations.map(item => item.id), signal),
      compose: request => this.compose(id, token, signal, request), acceptance: () => this.acceptance(id, token, signal, 0), review: () => this.reviewPresentation(id, token, signal) });
  }
  private async reviewPresentation(id: string, token: string, signal: AbortSignal) {
    if (!this.ports.inspectPresentation || !this.store.require(id).design?.presentation) return;
    const start = Date.now(), stepId = 'visual-review:' + token;
    let deferred: string[] = [];
    this.step(id, { id: stepId, agent: 'ui', action: 'review', label: studioStep('checking-layout'), status: 'active' });
    for (let round = 0; round < 2; round++) {
      const build = this.store.require(id), inspected = await this.ports.inspectPresentation(build, signal);
      this.current(id, token);
      let issues = [...deferred, ...inspected.issues], repairs = inspected.structural ? [] : [...inspected.issues], status: NonNullable<AgentBuild['visualResult']>['status'] = 'unavailable', refusal: string | undefined;
      if (this.ports.visionAvailable?.()) {
        try {
          const prompt = this.prompt('review');
          const record = await this.withAgent(id, 'design', agent => agent.run({ role: 'designer', instruction: prompt.text,
            ...mounted(this.ports, 'review', prompt.version), contractRevision: build.design!.contract.revision, signal, images: inspected.images,
            task: JSON.stringify(presentationReviewTask(build, inspected.images.map(image => image.label), inspected.issues)) }));
          this.current(id, token); this.record(id, record);
          const answer = acceptPresentationReview(record.output, build, inspected.images.map(image => image.label));
          issues = [...new Set([...issues, ...answer.issues])]; repairs = [...repairs, ...answer.repairs]; status = 'reviewed';
          deferred = [...new Set([...deferred, ...answer.issues.filter(issue => !answer.repairs.includes(issue))])];
        } catch (error) { signal.throwIfAborted(); this.current(id, token); status = 'failed'; refusal = message(error); }
      }
      this.change(id, value => { value.visualResult = { structural: inspected.structural, status, issues: refusal === undefined ? issues : [...issues, refusal], at: new Date().toISOString(), revision: token, elapsedMs: Date.now() - start }; });
      if (round === 0 && repairs.length) {
        const before = snapshot(this.store.require(id)), history = this.store.require(id).history;
        try {
          await this.compose(id, token, signal, '核对本轮评审建议，集中改善有证据且当前组件能表达的问题，保持功能与绑定。', true, { issues: repairs, images: this.ports.visionAvailable?.() ? inspected.images : undefined });
          const checked = await this.acceptance(id, token, signal, 1);
          if (!checked.passed) throw failStudioBuild('build-visual-checks-failed', checked.blocked ?? checked.cases.find(item => !item.passed)?.detail ?? '');
        } catch (error) {
          signal.throwIfAborted(); this.current(id, token); if (!inspected.structural) throw error;
          const detail = message(error);
          this.change(id, value => { Object.assign(value, before); value.history = history; value.visualResult!.issues = [...value.visualResult!.issues, detail]; });
          this.step(id, { id: stepId, agent: 'ui', action: 'review', label: studioStep('layout-kept'), status: 'done', detail }); return;
        }
        continue;
      }
      this.step(id, { id: stepId, agent: 'ui', action: 'review', label: studioStep(!inspected.structural ? 'layout-needs-work' : status === 'reviewed' ? (issues.length ? 'layout-reviewed-with-notes' : 'layout-reviewed') : status === 'failed' ? 'layout-review-interrupted' : 'layout-review-unavailable'), status: inspected.structural ? 'done' : 'failed', detail: [...issues, refusal].filter(Boolean).join('\n') || undefined });
      if (!inspected.structural) throw failStudioBuild('build-visual-checks-failed', inspected.issues.join('\n'));
      return;
    }
  }
  private async assemble(id: string, token: string, signal: AbortSignal) {
    if (this.ports.presentation && !this.store.require(id).design!.presentation) await this.compose(id, token, signal, '按用户旅程设计整页的主次和空间');
    const design = this.store.require(id).design!;
    for (const part of design.parts) {
      signal.throwIfAborted(); this.current(id, token); if (this.store.require(id).nodes.some(node => node.id === part.id)) continue;
      const choices = pluginComponentChoices(part, design.contract).map(projectComponentMetadata), stepId = 'part:' + design.contract.revision + ':' + part.id;
      this.step(id, { id: stepId, agent: 'ui', action: 'select', label: studioStep('choosing-component', { purpose: part.purpose }), target: part.id, status: 'active' });
      const preference = design.presentation?.parts[part.id]?.kind;
      let selection: NonNullable<AgentBuildStep['selection']> = { source: preference ? 'design' : 'rule', candidates: choices.map(choice => choice.kind), choice: preference ?? choices[0]!.kind };
      if (choices.length > 1 && this.ports.choose && this.ports.selectionAvailable?.()) {
        try {
          const answer = await this.ports.choose({ key: 'builder-' + randomUUID(), instructions: instructionText(this.ports, BUILDER_CHOOSE_COMPONENT), state: JSON.stringify({ title: design.title, journey: design.journey, pages: design.contract.pages, presentation: design.presentation, neighbors: design.parts.filter(item => item.pageId === part.pageId), preference, part }), candidates: choices.map(choice => ({ key: choice.kind, description: choice.description })) });
          signal.throwIfAborted(); this.current(id, token);
          if (!answer.choice || !choices.some(choice => choice.kind === answer.choice)) throw new Error('Jev 没有返回合法组件');
          selection = { source: 'jev', candidates: choices.map(choice => choice.kind), choice: answer.choice, model: answer.model, elapsedMs: answer.elapsedMs, confidence: answer.confidence };
        } catch (error) {
          signal.throwIfAborted(); this.current(id, token);
          if (preference) this.step(id, { id: stepId + ':fallback', agent: 'ui', action: 'note', label: studioStep('using-design-choice'), status: 'done', detail: message(error) });
          else { this.change(id, value => { value.pendingPart = { id: part.id, candidates: choices.map(choice => choice.kind), reason: message(error) }; });
          this.step(id, { id: stepId, agent: 'ui', action: 'select', label: studioStep('waiting-for-component'), target: part.id, status: 'waiting', detail: message(error) }); return;
          }
        }
      }
      this.current(id, token); this.change(id, value => { value.nodes = inDesignOrder(value.design, [...value.nodes, { ...part, kind: selection.choice as typeof choices[number]['kind'] }]); });
      this.step(id, { id: stepId, agent: 'ui', action: 'place', label: studioStep('component-placed'), target: part.id, status: 'done', selection });
    }
  }
  /**
   * Every operation not yet connected gets a code agent of its own, several at once. The first one that writes the
   * plugin's data goes alone when nothing is connected yet: it settles how records are stored (and any shared module),
   * and the others follow it. Parallel runs write only their own operation's files; checks see the other operations as
   * they last passed. A failed operation stops new ones from starting; the ones already running finish.
   */
  private async implement(id: string, token: string, signal: AbortSignal) {
    const initial = this.store.require(id), operations = initial.design!.contract.operations, width = Math.max(1, this.ports.parallel ?? 3);
    const pending = operations.map((operation, index) => ({ operation, index })).filter(item => !initial.connected.includes(item.operation.id));
    if (!pending.length) return;
    const anchor = width > 1 && !initial.connected.length ? pending.find(item => item.operation.effects.storage?.includes('write')) ?? pending[0]! : undefined;
    if (anchor) await this.withAgent(id, 'code', agent => this.implementOne(agent, id, token, signal, anchor.index));
    const rest = pending.filter(item => item !== anchor), alone = width === 1 || rest.length === 1;
    let next = 0, failure: { error: unknown } | undefined;
    await Promise.all(Array.from({ length: Math.min(width, rest.length) }, () => this.withAgent(id, 'code', async agent => {
      while (next < rest.length && !failure) {
        const item = rest[next++]!;
        try { await this.implementOne(agent, id, token, signal, item.index, alone ? undefined : ['src/operations/' + item.index + '.ts', 'tests/operations/' + item.index + '.ts']); }
        catch (error) { failure ??= { error }; }
      }
    })));
    if (failure) throw failure.error;
  }
  /** One operation: check, up to three repair runs, then connect it or stop with the host's reason. */
  private async implementOne(agent: Awaited<ReturnType<AgentBuilderPorts['agent']>>, id: string, token: string, signal: AbortSignal, index: number, writable?: string[]) {
    const initial = this.store.require(id), operation = initial.design!.contract.operations[index]!;
    signal.throwIfAborted(); this.current(id, token);
    if (initial.connected.includes(operation.id)) return;
    const stepId = 'code:' + initial.design!.contract.revision + ':' + operation.id;
    this.step(id, { id: stepId, agent: 'code', action: 'implement', label: studioStep('implementing-operation', { operation: operation.id }), operationId: operation.id, status: 'active' });
    const change = initial.rework?.[operation.id];
    let result = await this.check(id, [operation.id], signal);
    // A reworked operation still passes its unchanged checks, so it always gets one run with the change to make.
    for (let attempt = 0; (!result.passed || (change !== undefined && attempt === 0)) && attempt < 4; attempt++) {
      const now = this.store.require(id), revising = initial.history.length > 0;
      const prompt = attempt ? this.prompt('repair') : revising || change ? this.prompt('revise') : this.prompt('implement');
      // Everything the agent needs is in the task, so its limited turns go to writing and checking, not exploring.
      const siblings = now.design!.contract.operations.map((item, position) => ({ id: item.id, kind: item.kind, description: item.description, input: item.input, output: item.output,
        implementation: 'src/operations/' + position + '.ts', tests: 'tests/operations/' + position + '.ts', implemented: now.connected.includes(item.id) })).filter(item => item.id !== operation.id);
      const shared = await this.ports.sources?.(now) ?? [];
      if (attempt) this.step(id, { id: stepId, agent: 'code', action: 'implement', label: studioStep('repair-operation', { operation: operation.id, round: attempt }), operationId: operation.id, status: 'active', detail: (gate => gate ? gate.id + '：' + gate.detail.slice(0, 300) : '')(result.gates.find(gate => !gate.passed)) });
      await this.codeAttempt(agent, id, token, signal, prompt, [operation.id], stepId + ':run:' + attempt,
        { operation, implementation: 'src/operations/' + index + '.ts', tests: 'tests/operations/' + index + '.ts', siblings, shared, failure: result, attempt, maxRepairs: 3, ...(change ? { change } : {}), ...(writable ? { writable } : {}) }, writable);
      result = await this.check(id, [operation.id], signal);
    }
    this.current(id, token); this.change(id, build => { build.checks[operation.id] = result; });
    this.step(id, { id: stepId, agent: 'code', action: 'verify', label: studioStep(result.passed ? 'operation-connected' : 'operation-not-verified', { operation: operation.id }), operationId: operation.id, status: result.passed ? 'done' : 'failed', detail: JSON.stringify(result.gates) });
    if (!result.passed) {
      // Code that needs a capability the contract does not declare cannot be fixed by the code agent: the contract must say so.
      const missing = /Undeclared or unapproved capabilities: ([\w.:-]+)/.exec(result.gates.map(gate => gate.detail).join('\n'))?.[1];
      throw Object.assign(failStudioBuild('one-feature-could-not-be-written', result.gates.find(gate => !gate.passed)?.detail ?? '', { guidance: 'choose-continue-let-ai-try-again-if-keeps' }), missing ? { missingCapability: { operation: operation.id, capability: missing } } : {});
    }
    await this.resetPreview(id, token); this.change(id, build => { build.connected.push(operation.id); if (build.rework) { delete build.rework[operation.id]; if (!Object.keys(build.rework).length) delete build.rework; } });
  }
  /** One code-agent run. A run that runs out of turns or fails still counts as an attempt; the host check decides what follows. */
  private async codeAttempt(agent: Awaited<ReturnType<AgentBuilderPorts['agent']>>, id: string, token: string, signal: AbortSignal,
    prompt: { version: string; text: string }, operationIds: string[], noteId: string, task: Record<string, unknown>, writable?: readonly string[]) {
    let record: BuilderAgentRecord | undefined;
    // A dropped connection to the model is not the code's fault: it is asked again (files written so far stay) before the round counts.
    for (let retry = 0; ; retry++) {
      try {
        record = await agent.run({ role: 'coder', instruction: prompt.text, ...mounted(this.ports, 'code', prompt.version), contractRevision: this.store.require(id).design!.contract.revision, operationIds, ...(writable ? { writable } : {}), signal,
          task: JSON.stringify(task), checks: (ids, checkSignal) => this.check(id, [...ids], checkSignal),
          onActivity: activity => { if (this.store.require(id).active?.token === token) this.step(id, { id: 'activity:' + randomUUID(), agent: 'code', action: activity.type, label: activity.name, operationId: operationIds[0], status: 'done', detail: activity.detail.slice(0, 12_000), ...(activity.path ? { target: activity.path } : {}) }); } });
        break;
      } catch (error) {
        signal.throwIfAborted(); this.current(id, token);
        record = (error as { record?: BuilderAgentRecord }).record;
        if (TRANSIENT.test(message(error))) {
          if (record) this.record(id, record);
          // Still unreachable after the retries: the build stops rather than spend its repair rounds on an outage.
          if (retry >= RETRY_WAITS.length) throw modelUnreachable(error);
          this.step(id, { id: noteId + ':retry:' + retry, agent: 'code', action: 'note', label: studioStep('model-retry', { round: retry + 1 }), operationId: operationIds[0], status: 'done', detail: message(error) });
          await new Promise(resolve => setTimeout(resolve, RETRY_WAITS[retry]));
          signal.throwIfAborted(); this.current(id, token);
          continue;
        }
        this.step(id, { id: noteId, agent: 'code', action: 'note', label: studioStep('round-unfinished'), operationId: operationIds[0], status: 'done', detail: message(error) });
        break;
      }
    }
    this.current(id, token); if (record) this.record(id, record);
  }
  /** G7 in a real browser, on an empty preview; the preview is emptied again so the person starts clean. */
  private async acceptance(id: string, token: string, signal: AbortSignal, round: number) {
    const stepId = 'browser:' + token + ':' + round;
    this.step(id, { id: stepId, agent: 'host', action: 'verify', label: studioStep(round ? 'rerunning-acceptance' : 'running-acceptance'), status: 'active' });
    let result: NonNullable<AgentBuild['browserResult']>;
    try { result = await this.ports.browserAcceptance(this.store.require(id), signal); }
    catch (error) { signal.throwIfAborted(); const blocked = message(error); result = { passed: false, cases: this.store.require(id).design!.acceptance.map(test => ({ id: test.id, passed: false, detail: '尚未执行：' + blocked })), blocked, at: new Date().toISOString() }; }
    this.current(id, token);
    this.change(id, value => { value.browserResult = result; });
    this.step(id, { id: stepId, agent: 'host', action: 'verify', label: studioStep(result.passed ? 'acceptance-passed' : 'acceptance-failed'), status: result.passed ? 'done' : 'failed', detail: JSON.stringify(result.cases) });
    return result;
  }
  /**
   * A failed acceptance case goes back to the code agent with the operations its steps touch, at most twice; each
   * round re-runs the full gates and the whole acceptance. Contract and acceptance stay frozen.
   */
  private async repairAcceptance(id: string, token: string, signal: AbortSignal, result: NonNullable<AgentBuild['browserResult']>) {
    for (let round = 1; !result.passed && !result.blocked && round <= 2; round++) {
      const design = this.store.require(id).design!;
      const failures = result.cases.flatMap(failed => { const test = design.acceptance.find(item => item.id === failed.id); return !failed.passed && failed.detail !== PENDING_CASE && test ? [{ failed, test }] : []; });
      const first = failures[0]; if (!first) break;
      const { failed, test } = first;
      const acceptanceFailures = failures.map(({ failed, test }) => ({ description: test.description, steps: test.steps, detail: failed.detail }));
      // Display problem: the part's data already has the expected text but the part does not show it. That is the
      // designer's configuration, not code; hand it back to the designer and re-place only what changed.
      const displays = failures.flatMap(({ failed, test }) => { const display = displayProblem(test, failed.detail, design.parts); return display ? [{ test, display }] : []; });
      if (displays.length) {
        const requests = displays.map(({ test, display }) => {
        const kind = this.store.require(id).nodes.find(node => node.id === display.componentId)?.kind;
        const request = display.type === 'choice'
          ? '宿主在界面验收「' + test.description + '」中填写组件 ' + display.componentId + ' 时发现：' + display.reason + '。这是验收值或字段显示映射与已有枚举不一致，代码不能改变这些选项。请按字段已声明的原始值或实际显示文字修正 fill（或该字段的显示映射），保持被检查的行为、操作合同和代码不变。'
          : display.type === 'form'
          ? '宿主在界面验收「' + test.description + '」中提交组件 ' + display.componentId + ' 时发现：' + display.reason + '。如果这个字段应该从其他组件带过来（prefill），确认来源命令的结果里有它（没有就加进那个命令的 output）；如果应该由用户填写，在验收里补上 fill 步骤。'
          : display.type === 'display'
          ? '宿主在界面验收「' + test.description + '」中发现：组件 ' + display.componentId + (kind ? '（现在显示为 ' + kind + '，显示 titleField、textField 和 columns 里的字段）' : '') + ' 读到的数据里已经有「' + display.expected.join('」「')
            + '」，但界面上没有显示出来（界面显示的是：' + display.visible.slice(0, 200) + '）。请只调整这个组件的显示设置（titleField、textField、columns 等），让这些内容显示出来（布尔或枚举字段用 columns 里的 values 写成人话，如 {"true": "已打卡", "false": "未打卡"}）；验收只写会显示的值，不要把列名和值连在一起写（组件可能是表格）；不要改操作。'
          : '宿主在界面验收「' + test.description + '」中发现：期望组件 ' + display.componentId + ' 显示「' + display.expected.join('」「') + '」，但它不读取任何操作，内容只能经由设计带过来（界面显示的是：' + display.visible.slice(0, 200)
            + '）。如果内容是另一个组件命令的结果或选中的记录，用 "prefill:组件.字段" 预填这个表单字段；如果是它自己命令的结果，在 submit 里写 "show": "字段" 显示出来；如果验收本身写错了组件，改正验收步骤，但它检查的行为不能变。不要改操作。';
          return request;
        });
        await this.revise(id, token, signal, requests.join('\n\n') + '\n本批界面验收的全部实际失败如下，请集中处理属于设计的原因，保留其余原始诊断，不改变被验收的业务行为：\n' + JSON.stringify(acceptanceFailures));
        await this.assemble(id, token, signal); this.current(id, token);
        if (this.store.require(id).pendingPart) return result;
        await this.implement(id, token, signal);
        const final = await this.check(id, this.store.require(id).design!.contract.operations.map(item => item.id), signal); this.current(id, token);
        this.change(id, value => { value.checks.global = final; value.checksScope = value.runtimeScope; value.scopeCheckPending = undefined; });
        if (!final.passed) throw failStudioBuild('build-checks-failed', final.gates.find(gate => !gate.passed)?.detail ?? '');
        result = await this.acceptance(id, token, signal, round);
        continue;
      }
      const components = new Set(failures.flatMap(({ test }) => test.steps.flatMap(step => 'componentId' in step ? [step.componentId] : [])));
      const operationIds = [...new Set(design.parts.filter(part => components.has(part.id)).flatMap(part => [part.read?.operationId, part.submit?.operationId]).filter((value): value is string => !!value))];
      if (!operationIds.length) break;
      const stepId = 'acceptance-repair:' + token + ':' + round;
      this.step(id, { id: stepId, agent: 'code', action: 'implement', label: studioStep('repairing-acceptance', { count: failures.length }), operationId: operationIds[0], status: 'active', detail: JSON.stringify(acceptanceFailures) });
      const operations = design.contract.operations.map((item, index) => ({ ...item, implementation: 'src/operations/' + index + '.ts', tests: 'tests/operations/' + index + '.ts' })).filter(item => operationIds.includes(item.id));
      const parts = design.parts.filter(part => components.has(part.id)).map(({ id: partId, intent, purpose, props, read, submit }) => ({ id: partId, intent, purpose, props, read, submit }));
      const shared = await this.ports.sources?.(this.store.require(id)) ?? [];
      await this.withAgent(id, 'code', agent => this.codeAttempt(agent, id, token, signal, this.prompt('acceptance'), operationIds, stepId + ':run',
        { operations, parts, shared, acceptanceFailure: { description: test.description, steps: test.steps, detail: failed.detail }, acceptanceFailures, round }));
      let final = await this.check(id, design.contract.operations.map(item => item.id), signal); this.current(id, token);
      // A fix that breaks a check goes back to the code agent with the check's own words, as any other repair.
      for (let attempt = 1; !final.passed && attempt <= 2; attempt++) {
        await this.withAgent(id, 'code', agent => this.codeAttempt(agent, id, token, signal, this.prompt('repair'), operationIds, stepId + ':repair:' + attempt,
          { operations, shared, failure: final, attempt, maxRepairs: 2, acceptanceFailure: { description: test.description, steps: test.steps, detail: failed.detail }, acceptanceFailures }));
        final = await this.check(id, design.contract.operations.map(item => item.id), signal); this.current(id, token);
      }
      this.change(id, value => { value.checks.global = final; value.checksScope = value.runtimeScope; value.scopeCheckPending = undefined; });
      this.step(id, { id: stepId, agent: 'code', action: 'implement', label: studioStep(final.passed ? 'acceptance-repaired' : 'repair-not-verified'), operationId: operationIds[0], status: final.passed ? 'done' : 'failed', detail: JSON.stringify(final.gates) });
      if (!final.passed) throw failStudioBuild('build-checks-failed', final.gates.find(gate => !gate.passed)?.detail ?? '');
      result = await this.acceptance(id, token, signal, round);
    }
    return result;
  }
  async call(id: string, componentId: string, binding: 'read' | 'submit', payload: unknown, control?: Pick<PluginExecutionControl, 'signal' | 'beforeEffect'>) {
    const build = this.store.require(id), node = build.nodes.find(item => item.id === componentId); if (!node || !build.design) throw studioProblem("plugin-builder.request.component-not-found", '界面组件不存在');
    const call = resolvePluginComponentCall(node, binding, payload); if (!build.connected.includes(call.operationId)) throw studioProblem("plugin-builder.request.operation-not-connected", '这个操作尚未接通，输入已保留');
    return this.ports.call(build, call.operationId, call.input as SandboxJson, control);
  }
  private async resetPreview(id: string, token?: string) { const check = token ? () => this.current(id, token) : undefined; check?.(); await this.ports.resetPreview(id, check); check?.(); }
  /**
   * Pausing takes effect at once: the build is marked paused and the running work is told to stop. A model call or a
   * check can take a while to notice; its results are void by then, so the person does not wait for it.
   */
  async pause(id: string) {
    const job = this.jobs.get(id);
    if (job) {
      this.change(id, build => { build.active = null; build.phase = 'paused'; for (const step of build.steps) if (step.status === 'active') { step.status = 'cancelled'; step.detail = '用户暂停构建'; } });
      job.abort.abort(new Error('用户暂停构建'));
      await Promise.race([job.done, new Promise(resolve => setTimeout(resolve, 3000))]);
    }
    return this.store.require(id);
  }
  async action(id: string, body: Record<string, unknown>, authority?: PluginExecutionControl) {
    if (body.action === 'pause' || body.action === 'stop') return this.pause(id);
    if (body.action === 'visual' && (!this.ports.presentation || !this.store.require(id).design || !this.store.require(id).checks.global?.passed)) throw studioProblem("plugin-builder.request.visual-edit-needs-checks", '功能接通并通过检查后才能单独调整界面');
    // A change request never goes stale: whatever the build is doing, it stops and takes the request in.
    if ((body.action === 'message' || body.action === 'revise' || body.action === 'visual') && this.store.require(id).active) {
      if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 48_000) throw studioProblem("plugin-builder.request.change-description-required", '请输入具体修改意见');
      await this.pause(id); body = { ...body, revision: this.store.require(id).revision };
    }
    // Pictures arriving for the proposals change the draft but not the choice, so choosing only needs the candidate to exist.
    const build = this.store.require(id); if ((body.revision !== build.revision && body.action !== 'message' && body.action !== 'revise' && body.action !== 'visual' && !(body.action === 'choose' && build.phase === 'choosing')) || build.active) throw studioProblem("plugin-builder.request.draft-locked", '草稿已更新或正在构建，请先暂停并刷新');
    if (body.action === 'scope') {
      if (body.scope !== 'home' && body.scope !== 'project') throw studioProblem("plugin-builder.request.draft-scope-invalid", '发布范围只能是项目或个人空间');
      if (this.store.versions(id).some(release => releaseScope(release) !== body.scope)) throw studioProblem("plugin-builder.request.published-scope-fixed", '已发布草稿的范围不能改变，请创建新的草稿');
      if (buildScope(build) === body.scope) return build;
      const changed = this.change(id, value => { value.runtimeScope = body.scope === 'home' ? 'home' : undefined; value.scopeCheckPending = true; value.checksScope = undefined; value.checks = {}; value.browserResult = undefined; value.visualResult = undefined; value.connected = []; value.pendingPlugins = undefined; value.phase = 'paused'; value.error = null; });
      await this.ports.resetPreview(id, () => { if (this.closed || this.store.require(id).revision !== changed.revision) throw new Error('草稿已改变'); });
      return this.store.require(id);
    }
    if (body.action === 'recheck') { this.launch(id, 'check'); return this.store.require(id); }
    if (body.action === 'choose') return this.choose(id, build.revision, String(body.candidateId));
    if (body.action === 'resume') { this.launch(id, build.scopeCheckPending ? 'check' : build.pendingVisual ? 'visual' : build.design ? 'build' : build.chosen && build.candidates.length ? 'detail' : 'design'); return this.store.require(id); }
    if (body.action === 'message' || body.action === 'revise' || body.action === 'visual') {
      if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 48_000) throw studioProblem("plugin-builder.request.change-description-required", '请输入具体修改意见');
      this.change(id, value => { value.messages.push({ role: 'user', text: body.message as string }); value.clarificationAnswered ||= !!value.questions.length; value.questions = []; });
      if (body.action === 'visual') this.change(id, value => {
        value.history.push(snapshot(value)); if (value.history.length > 20) value.history.shift(); value.pendingVisual = body.message as string;
      });
      this.launch(id, body.action === 'visual' ? 'visual' : build.design ? 'revise' : 'design'); return this.store.require(id);
    }
    if (body.action === 'enable-plugins' || body.action === 'skip-plugins') {
      const pending = build.pendingPlugins;
      if (!pending?.length) throw studioProblem("plugin-builder.request.no-plugins-to-enable", '没有等待启用的插件');
      if (body.action === 'enable-plugins') {
        if (buildScope(build) === 'home') throw new Error('个人空间检查不能通过启用项目插件补齐依赖');
        if (!this.ports.enablePlugins) throw studioProblem("plugin-builder.request.cannot-enable-in-project", '这个项目不能在这里启用插件');
        await this.ports.enablePlugins(pending.map(item => item.pluginId));
        this.change(id, value => { value.pendingPlugins = undefined; for (const step of value.steps) if (step.agent === 'host' && step.action === 'decide' && step.status === 'waiting') { step.status = 'done'; step.label = studioStep('plugins-enabled'); } });
        this.launch(id, 'build'); return this.store.require(id);
      }
      this.change(id, value => { value.pendingPlugins = undefined; value.messages.push({ role: 'user', text: '不要使用' + pending.map(item => '「' + item.title + '」').join('、') + '的能力（' + pending.flatMap(item => item.capabilities).join('、') + '），换一种不需要它们的做法' });
        for (const step of value.steps) if (step.agent === 'host' && step.action === 'decide' && step.status === 'waiting') { step.status = 'cancelled'; step.label = studioStep('plugins-declined'); } });
      this.launch(id, 'revise'); return this.store.require(id);
    }
    if (body.action === 'part') {
      const pending = build.pendingPart, part = build.design?.parts.find(item => item.id === pending?.id);
      if (!pending || !part || !pending.candidates.includes(String(body.kind))) throw studioProblem("plugin-builder.request.component-selection-expired", '组件选择已失效');
      this.change(id, value => { value.nodes = inDesignOrder(value.design, [...value.nodes, { ...part, kind: body.kind as AgentBuild['nodes'][number]['kind'] }]); value.pendingPart = undefined; });
      this.step(id, { id: 'part:' + build.design!.contract.revision + ':' + part.id, agent: 'ui', action: 'place', label: studioStep('using-persons-component'), target: part.id, status: 'done', selection: { source: 'user', candidates: pending.candidates, choice: String(body.kind) } }); this.launch(id, 'build'); return this.store.require(id);
    }
    if (body.action === 'undo' && build.design && build.history.at(-1)?.checks?.global?.bundlePath && build.history.at(-1)?.design?.contract.revision === build.design?.contract.revision) { const previous = build.history.at(-1)!; this.change(id, value => { value.history.pop(); Object.assign(value, previous); value.pendingVisual = undefined; value.error = null; value.phase = !value.scopeCheckPending && previous.browserResult?.passed && previous.checksScope === value.runtimeScope ? 'ready' : 'paused'; }); return this.store.require(id); }
    if (body.action === 'undo') { const previous = build.history.at(-1); if (!previous) throw studioProblem("plugin-builder.request.no-revision-to-undo", '没有可撤销的合同修订'); await this.resetPreview(id); this.change(id, value => { value.history.pop(); Object.assign(value, previous); value.pendingVisual = undefined; value.connected = []; value.checks = {}; value.browserResult = undefined; value.visualResult = undefined; value.phase = 'paused'; }); this.launch(id, 'build'); return this.store.require(id); }
    if (body.action === 'remove') { this.store.remove(id, build.revision); await this.resetPreview(id); return null; }
    if (body.action === 'publish') return publishAgentBuild(this.store, this.ports, build, authority, () => { if (this.closed) throw new Error('宿主已关闭'); });
    if (['install', 'upgrade', 'rollback', 'disable', 'enable', 'uninstall'].includes(String(body.action))) { const release = this.store.versions(id).find(item => item.version === body.version); if (!release) throw studioProblem("plugin-builder.request.version-not-found", '发布版本不存在'); if (release.distribution?.runtime_scope === 'home') throw studioProblem("plugin-builder.request.home-install-through-settings", '个人空间发布请下载签名包后在插件设置中导入确认'); await this.ports.lifecycle(body.action as Parameters<AgentBuilderPorts['lifecycle']>[0], release, body.grants); return this.store.require(id); }
    throw studioProblem("plugin-builder.request.unknown-build-operation", '未知构建操作');
  }
  async close() { this.closed = true; for (const abort of this.drawing) abort.abort(); for (const job of this.jobs.values()) job.abort.abort(failStudioBuild('build-interrupted', '', { guidance: 'build-continue-after-restart' })); await Promise.all([...this.jobs.values()].map(job => job.done)); await Promise.all(this.store.list().map(build => this.resetPreview(build.id))); this.listeners.clear(); }
}

/** What the image service is asked to draw for a proposal: the product's screen, in the product's plain style. */
export function mockupPrompt(proposal: AgentProposal): string {
  const parts = proposal.preview.parts.map(part => '- ' + part.purpose + '（' + ({ heading: '标题栏', description: '说明或数字', input: '表单', action: '按钮', collection: '列表', reading: '分节文字', schedule: '按日期的列表', conversation: '对话', evidence: '表格', feedback: '提示' } as Record<string, string>)[part.intent] + '）').join('\n');
  return ['一张桌面应用里的插件界面效果图（UI mockup），正面平视，单页，不要设备外框、不要手和人物。',
    '风格：简洁、浅色、中性灰白底、圆角卡片、细分隔线、一个蓝色主按钮，中文界面文字清晰可读，不要渐变和装饰插画。',
    '插件：' + proposal.title + '。' + proposal.description, '页面从上到下：\n' + parts, '使用路径：' + proposal.journey.join(' → ')].join('\n');
}
/** Network failures between the host and the model service, worth one more request. */
const TRANSIENT = /fetch failed|^terminated$|other side closed|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|getaddrinfo|could not be resolved|socket hang up|network (?:error|timeout)|UND_ERR/i;
/** How long to wait before asking the model again after a dropped connection; a longer outage stops the build. */
let RETRY_WAITS = [5_000, 15_000, 30_000];
/** Only for tests: shorter waits. */
export function setModelRetryWaits(waits: number[]) { RETRY_WAITS = waits; }
const modelUnreachable = (error: unknown) => Object.assign(failStudioBuild('build-model-unreachable', new Error(message(error), { cause: error }), { values: { count: RETRY_WAITS.length }, guidance: 'build-continue-after-network' }), { modelUnreachable: true });

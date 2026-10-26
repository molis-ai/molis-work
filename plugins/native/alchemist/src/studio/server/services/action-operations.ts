import { ActionError, searchEntriesPage, searchText, type SearchEntry, type ActionAvailability, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ApiDependencies } from "../api/dependencies.js";
import { ALCHEMIST_GENERATE_PERMISSION, alchemistOperations, type AlchemistHomeOperationName, type AlchemistOperationInput, type AlchemistOperationName } from "../../shared/contracts/actions.js";
import type { AlchemistPulseGithubPort } from "../sources/pulse-github-port.js";
import { DISCOVERY_BRAINSTORM_JOB } from "./create-exploration.js";
import { RESEARCH_LENS_JOB } from "./start-lens-run.js";
import { DISCOVERY_PULSE_JOB } from "./start-pulse-run.js";
import { alchemistStateErrors } from "../../errors.js";
import { deriveDirectionTitle } from "../../shared/contracts/direction.js";
import { IdeaActionError } from "./idea-card-actions.js";
import { ResearchPlanError } from "./create-research-plan.js";
import { createWorkspaceOperations } from "./workspace-operations.js";
import { DecisionServiceError } from "./decision-workspace.js";
import { AlchemistOperationError } from "./action-error.js";
export { AlchemistOperationError } from "./action-error.js";

export type AlchemistEffectControl = Pick<ActionExecutionContext, "beforeEffect" | "assert_authority_current" | "retainBackgroundAuthority">;
export interface AlchemistActionInvoker {
  invoke<I, O>(definition: ActionDefinition<I, O>, input: I, signal?: AbortSignal, control?: AlchemistEffectControl): Promise<O>;
}

/** What a project's studio implements: every operation but the Home's, which the Host serves from its own ports (`createAlchemistActionHandlers`). */
type Implementations = { [K in Exclude<AlchemistOperationName, AlchemistHomeOperationName>]: (input: AlchemistOperationInput<K>, signal?: AbortSignal, control?: AlchemistEffectControl) => unknown | Promise<unknown> };

/** Business implementation stays beside the original repositories and services, without HTTP request emulation. */
function implementations(d: ApiDependencies): Implementations {
  const direction = (id: string) => {
    const value = d.directions.get(id);
    if (!value || value.workspaceId !== d.workspaceId) throw new AlchemistOperationError("alchemist.direction_not_found", "没有找到这个方向。", 404);
    return value;
  };
  return {
    ...createWorkspaceOperations(d),
    searchEntries: input => {
      const directions = d.directions.list().filter(entry => entry.workspaceId === d.workspaceId && entry.status !== "archived").map((entry): SearchEntry => ({
        subject: { kind: "alchemist-direction", id: entry.id }, revision: entry.updatedAt, title: entry.title, summary: searchText(entry.description, 4000),
        updated_at: entry.updatedAt, content: "summary", open: { surface: "alchemist", id: entry.id } }));
      const ideas = d.ideas.listIdeas().flatMap((idea): SearchEntry[] => {
        const content = d.ideas.getVersion(idea.id, idea.currentVersion)?.content;
        if (!content) return [];
        return [{ subject: { kind: "alchemist-idea", id: idea.id }, revision: `${idea.currentVersion}:${idea.lifecycle}:${idea.updatedAt}`, title: content.title || "未命名 Idea",
          summary: searchText([content.coreProblem, content.coreMechanism, content.valueProposition].filter(Boolean).join("\n"), 4000), updated_at: idea.updatedAt, content: "summary",
          open: { surface: "alchemist", id: idea.id } }];
      });
      return searchEntriesPage([...directions, ...ideas], input);
    },
    reuseCandidates: (input, signal) => d.workReuse.candidates(input, signal),
    reuseAssess: (input, signal, control) => d.workReuse.assess(input, signal, control),
    reusePublish: async (input, signal, control) => ({ reference: await d.workReuse.publish(input.reportId, signal, control) }),
    reuseReceipt: async (input, signal) => ({ receipt: await d.workReuse.receipt(input.planId, signal) }),
    reuseReconcile: async (input, signal, control) => ({ receipt: await d.workReuse.reconcile(input.planId, signal, control) }),
    reuseFeedback: async (input, signal) => ({ receipt: await d.workReuse.feedback(input, signal) }),
    playbookRevise: input => ({ rule: d.workReuse.revise(input) }),
    bootstrap: () => ({
      workspace: { id: d.workspaceId, name: d.workspaceName ?? "炼金术士" }, actor: { id: d.actorId, name: d.actorName ?? "本地创始人" },
      directions: d.directions.list(), explorations: d.explorations.list(),
      ideas: d.ideas.listIdeas().map(idea => ({ id: idea.id, directionId: idea.directionId,
        title: d.ideas.getVersion(idea.id, idea.currentVersion)?.content.title ?? "未命名 Idea", lifecycle: idea.lifecycle, currentVersion: idea.currentVersion, updatedAt: idea.updatedAt })),
    }),
    directionCreate: input => {
      const now = d.clock.now();
      return { direction: d.directions.create({ id: d.idFactory.next("direction"), workspaceId: d.workspaceId,
        title: input.title ?? deriveDirectionTitle(input.description), description: input.description, source: { kind: "user_input" }, status: "active", createdAt: now, updatedAt: now }) };
    },
    directionUpdate: input => ({ direction: d.directions.update(direction(input.id).id, {
      title: input.title ?? deriveDirectionTitle(input.description), description: input.description, updatedAt: d.clock.now() }) }),
    directionStatus: input => ({ direction: d.directions.setStatus(direction(input.id).id, input.status, d.clock.now()) }),
    explorationStart: async (input, signal, control) => {
      if (direction(input.id).status === "archived") throw new AlchemistOperationError("alchemist.direction_archived", "请先恢复方向，再继续炼化。");
      const accepted = await d.jobResumption.prepareStart(DISCOVERY_BRAINSTORM_JOB, control);
      signal?.throwIfAborted();
      const result = d.createExploration({ directionId: input.id, reuseExisting: input.reuseExisting ?? false });
      if (result.jobId) d.jobResumption.accept(result.jobId, accepted);
      return result;
    },
    explorationGet: input => {
      const exploration = d.explorations.get(input.id);
      if (!exploration) throw new AlchemistOperationError("alchemist.exploration_not_found", "没有找到这次炼化。", 404);
      return { direction: direction(exploration.directionId), exploration };
    },
    cardGet: input => d.ideaCardActions.getCandidateBrief(input.id),
    cardKeep: input => d.ideaCardActions.keep(input.id),
    cardDiscard: input => ({ card: d.ideaCardActions.discard(input.id) }),
    cardRestore: input => ({ card: d.ideaCardActions.restore(input.id) }),
    ideaGet: input => d.ideaCardActions.getIdeaVersionView(input.id, input.version),
    models: async () => ({ models: await d.listRuntimeModels() }),
    researchGet: (input, signal) => d.getResearchWorkspace(input.id, input.version, signal),
    researchPlan: async ({ id, ...input }, signal, control) => ({ plan: await d.workReuse.projectPlan(await d.createResearchPlan({ ideaId: id, ...input }, signal, control), signal) }),
    researchStart: async ({ id, ...input }, signal, control) => {
      const accepted = await d.jobResumption.prepareStart(RESEARCH_LENS_JOB, control);
      const plan = d.research.plans.getPlan(input.planId);
      if (plan) await d.workReuse.validate(plan, signal);
      await control?.beforeEffect(); control?.assert_authority_current?.(); signal?.throwIfAborted();
      const run = d.startLensRun({ ideaId: id, ...input });
      d.jobResumption.accept(run.jobId, accepted);
      return { run };
    },
    // One action stops either kind of run, each through its own service (D27): the page's 「停止」, MCP and workflows share it.
    runCancel: input => {
      try {
        const kind = d.jobs.get(input.id)?.kind;
        if (kind === RESEARCH_LENS_JOB) return { kind: "lens" as const, run: d.cancelLensRun(input.id) };
        if (kind === DISCOVERY_PULSE_JOB) return { kind: "pulse" as const, run: d.cancelPulseRun(input.id) };
        throw alchemistStateErrors.run_not_found("没有找到这次研究或市场脉搏。");
      } catch (error) {
        if (!(error instanceof ActionError) || !["alchemist.run_not_found", "alchemist.run_not_cancellable"].includes(error.code)) throw error;
        throw new AlchemistOperationError(error.code, error.message, error.code === "alchemist.run_not_found" ? 404 : 409);
      }
    },
    runList: () => ({ jobs: d.jobs.listRecent().filter(job => ["queued", "running", "interrupted", "failed"].includes(job.status)).map(job => {
      const input = job.input && typeof job.input === "object" ? job.input as Record<string, unknown> : {};
      const plan = typeof input.planId === "string" ? d.research.plans.getPlan(input.planId) : undefined;
      return { jobId: job.id, kind: job.kind, status: job.status, accepted: d.jobResumption.isAccepted(job.id), errorCode: job.errorCode,
        directionId: typeof input.directionId === "string" ? input.directionId : undefined, ideaId: plan?.key.ideaId };
    }) }),
    runContinuation: input => d.jobResumption.view(input.id),
    runContinue: (input, _signal, control) => d.jobResumption.continue(input.id, input.confirmation, control),
    runEvents: input => {
      // The original SQLite transaction gives events and terminal status one consistent snapshot.
      return d.jobs.readEvents(input.id, input.after ?? 0);
    },
    settingsGet: () => d.runtimeSettings.getPublicSettings(),
    settingsUpdate: (input, _signal, control) => d.runtimeSettings.update(input, control),
    settingsVerify: () => d.runtimeSettings.verifyAndEnable(),
    workspaceExport: async (input, signal) => {
      const file = await d.workspaceExport.create(input.format, signal);
      return { filename: file.filename, mimeType: file.contentType, encoding: "base64", content: Buffer.from(file.body).toString("base64") };
    },
  };
}

const inputProblems: Partial<Record<AlchemistOperationName, [string, string]>> = {
  conversationSend: ["alchemist.conversation_message_invalid", "消息或当前讨论上下文不完整。"], decisionCreate: ["alchemist.decision_invalid", "请选择决定并写下理由。"],
  annotationsList: ["alchemist.annotation_query_invalid", "注释目标不完整。"], annotationCreate: ["alchemist.annotation_invalid", "请保留引用，并另行写下评论。"],
  playbookPropose: ["alchemist.playbook_proposal_invalid", "方法变化、正反例和作用域需要由你明确填写。"], tasteCreate: ["alchemist.taste_rule_invalid", "请完整写下偏好及其适用范围。"],
  pulseSourceUpdate: ["alchemist.pulse_source_invalid", "来源设置不完整。"], pulseStart: ["alchemist.pulse_run_invalid", "脉搏运行参数不完整。"],
  directionCreate: ["alchemist.direction_input_invalid", "请更完整地描述你想探索的方向。"], directionUpdate: ["alchemist.direction_input_invalid", "方向内容无效。"], directionStatus: ["alchemist.direction_input_invalid", "方向状态无效。"],
  researchPlan: ["alchemist.research_plan_invalid", "研究计划参数不完整。"], researchStart: ["alchemist.lens_run_invalid", "启动研究所需信息不完整。"],
  settingsUpdate: ["alchemist.runtime_settings_invalid", "模型选择或调用上限不完整。"], workspaceExport: ["alchemist.export_format_invalid", "请选择 JSON 或 ZIP。"],
};

function businessError(error: unknown): never {
  if (error instanceof DecisionServiceError) throw new AlchemistOperationError(error.code,
    error.code === "alchemist.idea_version_not_found" ? "没有找到这个 Idea 版本。" : error.code === "alchemist.decision_already_exists" ? "这个 Idea 版本已经有正式决定。"
      : error.code === "alchemist.decision_version_not_current" ? "旧 Idea 版本只能回看。" : "两条兼容研究材料尚未齐全。", error.code === "alchemist.idea_version_not_found" ? 404 : 409);
  if (error instanceof ActionError && ["alchemist.opportunity_not_found", "alchemist.opportunity_direction_not_found", "alchemist.pulse_report_not_found", "alchemist.opportunity_action_failed", "alchemist.opportunity_already_converted", "alchemist.opportunity_cannot_be_saved", "alchemist.opportunity_cannot_be_dismissed", "alchemist.opportunity_cannot_be_converted"].includes(error.code)) throw new AlchemistOperationError(error.message, error.message === "alchemist.opportunity_not_found" ? "没有找到这个机会方向。" : "这个机会当前无法执行该动作。", error.message === "alchemist.opportunity_not_found" ? 404 : 409);
  if (error instanceof ActionError && error.code === "alchemist.pulse_no_enabled_sources") throw new AlchemistOperationError(error.message, "请至少启用一个市场来源。");
  if (error instanceof IdeaActionError || (error instanceof ActionError && ["alchemist.idea_card_not_candidate", "alchemist.idea_card_not_discarded"].includes(error.code))) {
    if (error instanceof IdeaActionError && error.code === "alchemist.idea_card_already_kept") throw new AlchemistOperationError(error.code, "这张候选牌已经形成 Idea，不会重复创建版本。", 409, { recovery: "打开已有 Idea 继续查看。", ideaId: error.ideaId });
    if (error.code === "alchemist.idea_card_not_candidate" || error.code === "alchemist.idea_card_not_discarded") throw new AlchemistOperationError(error.code, "这张牌的状态已经改变，请刷新后重试。");
    throw new AlchemistOperationError(error.code, error.code === "alchemist.idea_version_not_found" ? "没有找到这个 Idea 版本。" : "没有找到这张候选牌。", 404);
  }
  if (error instanceof ResearchPlanError) throw new AlchemistOperationError(error.code,
    error.code === "alchemist.idea_version_not_found" ? "只有正式 Idea 版本可以开始研究。" : error.code === "alchemist.runtime_model_not_found" ? "没有找到所选模型。" : "预算上限无效。", error.code === "alchemist.idea_version_not_found" ? 404 : 422);
  if (error instanceof ActionError && ["alchemist.research_plan_not_found", "alchemist.research_plan_mismatch", "alchemist.lens_run_exists"].includes(error.code)) throw new AlchemistOperationError(error.code, "这份研究计划无法启动。");
  if (error instanceof ActionError && error.code === "alchemist.job_not_found") throw new AlchemistOperationError("alchemist.run_not_found", error.message, 404);
  if (error instanceof Error) {
    const message = workspaceProblems[error.message];
    if (message) throw new AlchemistOperationError(error.message, message, error.message.endsWith("_not_found") ? 404 : 409);
    if (error.message === "alchemist.idea_version_not_found") throw new AlchemistOperationError(error.message, "没有找到这个 Idea 版本。", 404);
    if (["alchemist.runtime_model_unavailable", "alchemist.runtime_not_configured"].includes(error.message)) throw new AlchemistOperationError(error.message,
      error.message === "alchemist.runtime_model_unavailable" ? "所选模型已不可用，请重新选择；系统不会自动换模型。" : "请在 Molis Work 全局设置中配置模型，再回来重试。");
  }
  throw error;
}

export function createAlchemistOperationExecutor(dependencies: ApiDependencies): AlchemistActionInvoker {
  const handlers = implementations(dependencies);
  const byId = new Map(Object.entries(alchemistOperations).filter(([, operation]) => operation.definition.action.scope !== "home")
    .map(([name, operation]) => [operation.definition.capability_id, { name: name as Exclude<AlchemistOperationName, AlchemistHomeOperationName>, ...operation }]));
  return {
    async invoke<I, O>(definition: ActionDefinition<I, O>, input: I, signal?: AbortSignal, control?: AlchemistEffectControl): Promise<O> {
      signal?.throwIfAborted();
      const operation = byId.get(definition.capability_id);
      if (!operation || definition.version !== operation.definition.version) throw new ActionError("actions.missing", "没有这个炼金术士能力版本。");
      const parsed = operation.input.safeParse(input);
      if (!parsed.success) {
        const [code, message] = inputProblems[operation.name] ?? ["alchemist.alchemist_input_invalid", "操作参数不完整或格式无效。"];
        throw new AlchemistOperationError(code, message, 400);
      }
      let result: unknown;
      const effect = async () => { signal?.throwIfAborted(); await control?.beforeEffect(); control?.assert_authority_current?.(); signal?.throwIfAborted(); };
      try {
        await effect(); control?.assert_authority_current?.(); signal?.throwIfAborted();
        if (operation.definition.operation === "command" && operation.name !== "runContinue") dependencies.initializeCommand();
        // The mapped implementation and schema always come from the same operation key.
        result = await (handlers[operation.name] as (input: unknown, signal?: AbortSignal, control?: AlchemistEffectControl) => unknown)(parsed.data, signal, { ...control, beforeEffect: effect });
        await effect(); control?.assert_authority_current?.(); signal?.throwIfAborted();
      } catch (error) { businessError(error); }
      if (!operation.output.safeParse(result).success) throw new ActionError("actions.output_invalid", "炼金术士返回的数据不符合已声明的合同。");
      return result as O;
    },
  };
}

const workspaceProblems: Record<string, string> = {
  "alchemist.annotation_not_found": "没有找到这条注释。", "alchemist.annotation_already_resolved": "这条注释已经解决。", "alchemist.annotation_target_not_found": "注释目标版本已不可用。",
  "alchemist.action_proposal_not_found": "没有找到这条校准提案。", "alchemist.action_proposal_not_pending": "这条校准提案已经处理。", "alchemist.action_proposal_unsupported": "这类提案目前无法应用。",
  "alchemist.playbook_requires_lens_report": "研究方法校准需要来自研究报告。", "alchemist.playbook_requires_market_space": "研究方法校准需要来自市场空间研究。",
  "alchemist.idea_not_found": "没有找到这个 Idea。", "alchemist.taste_rule_not_found": "没有找到这条 Taste。", "alchemist.playbook_rule_not_found": "没有找到这条校准规则。", "alchemist.pulse_source_not_found": "没有找到这个市场来源。",
};

/** What the Host lends the actions beyond the project's studio. */
export interface AlchemistActionPorts {
  /** The project's studio for the caller, resolved from trusted caller context; discovery never opens the database. */
  resolve(caller: ActionCallContext): AlchemistActionInvoker | Promise<AlchemistActionInvoker>;
  /**
   * Whether a model can run now, for a caller who is not the person at the page. The plugin binds it to the actions that declare
   * `ALCHEMIST_GENERATE_PERMISSION`, and the person's own page is never held back by it: a message sent without a model is still saved, and a
   * stopped exploration or research run is still recorded, so the card tells the person how to go on. Absent: the actions are not judged.
   */
  modelAvailability?(): ActionAvailability;
  /** The Home's GitHub account choice for the market pulse, read and written without a project. Absent: no account can be chosen. */
  pulseGithub?: Pick<AlchemistPulseGithubPort, "read" | "select">;
}

/** The Home's operations: one binding for every project, served without opening a studio. */
function homeImplementations(ports: AlchemistActionPorts): { [K in AlchemistHomeOperationName]: (input: AlchemistOperationInput<K>) => unknown } {
  return {
    pulseGithub: () => ports.pulseGithub?.read() ?? { accounts: [], selectedConnectionId: null },
    pulseGithubSelect: input => {
      if (!ports.pulseGithub) throw new AlchemistOperationError("alchemist.pulse_github_unavailable", "这里不能选择 GitHub 账号。");
      ports.pulseGithub.select(input.connectionId);
      return { selectedConnectionId: ports.pulseGithub.read().selectedConnectionId };
    },
  };
}

export function createAlchemistActionHandlers(ports: AlchemistActionPorts): ActionHandlerBinding[] {
  const home = homeImplementations(ports) as Record<string, ((input: unknown) => unknown) | undefined>;
  const modelAvailability = ports.modelAvailability?.bind(ports);
  return Object.entries(alchemistOperations).map(([name, { definition }]): ActionHandlerBinding => {
    const base = { capability_id: definition.capability_id, version: definition.version };
    if (definition.action.scope === "home") {
      const run = home[name];
      if (!run) throw new Error(`The Home operation ${definition.capability_id} has no implementation.`);
      return { ...base, async handle(caller, input) { await caller.beforeEffect(); caller.assert_authority_current?.(); caller.signal?.throwIfAborted(); return run(input); } };
    }
    const handler: ActionHandlerBinding = { ...base,
      async handle(caller, input) {
        if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目。");
        return (await ports.resolve(caller)).invoke(definition as ActionDefinition, input, caller.signal, caller);
      },
    };
    return name !== "runContinue" && modelAvailability && definition.action.permissions.includes(ALCHEMIST_GENERATE_PERMISSION)
      ? { ...handler, availability: caller => caller.audience === "user" ? { available: true } : modelAvailability() } : handler;
  });
}

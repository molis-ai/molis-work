import { ActionError, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ApiDependencies } from "../api/dependencies.js";
import { alchemistOperations, type AlchemistOperationInput, type AlchemistOperationName } from "../../shared/contracts/actions.js";
import { deriveDirectionTitle } from "../../shared/contracts/direction.js";
import { IdeaActionError } from "./idea-card-actions.js";
import { ResearchPlanError } from "./create-research-plan.js";
import { StartLensRunError } from "./start-lens-run.js";
import { IdeaCardTransitionError } from "../../domain/discovery/idea-card.js";
import { createWorkspaceOperations } from "./workspace-operations.js";
import { DecisionServiceError } from "./decision-workspace.js";
import { OpportunityActionError } from "./opportunity-actions.js";
import { StartPulseRunError } from "./start-pulse-run.js";
import { AlchemistOperationError } from "./action-error.js";
export { AlchemistOperationError } from "./action-error.js";

export interface AlchemistActionInvoker {
  invoke<I, O>(definition: ActionDefinition<I, O>, input: I, signal?: AbortSignal): Promise<O>;
}

type Implementations = { [K in AlchemistOperationName]: (input: AlchemistOperationInput<K>, signal?: AbortSignal) => unknown | Promise<unknown> };

/** Business implementation stays beside the original repositories and services, without HTTP request emulation. */
function implementations(d: ApiDependencies): Implementations {
  const direction = (id: string) => {
    const value = d.directions.get(id);
    if (!value || value.workspaceId !== d.workspaceId) throw new AlchemistOperationError("DIRECTION_NOT_FOUND", "没有找到这个方向。", 404);
    return value;
  };
  return {
    ...createWorkspaceOperations(d),
    reuseCandidates: (input, signal) => d.workReuse.candidates(input, signal),
    reuseAssess: (input, signal) => d.workReuse.assess(input, signal),
    reusePublish: async (input, signal) => ({ reference: await d.workReuse.publish(input.reportId, signal) }),
    reuseReceipt: async (input, signal) => ({ receipt: await d.workReuse.receipt(input.planId, signal) }),
    reuseReconcile: async (input, signal) => ({ receipt: await d.workReuse.reconcile(input.planId, signal) }),
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
    explorationStart: input => {
      if (direction(input.id).status === "archived") throw new AlchemistOperationError("DIRECTION_ARCHIVED", "请先恢复方向，再继续炼化。");
      return d.createExploration({ directionId: input.id, reuseExisting: input.reuseExisting ?? false });
    },
    explorationGet: input => {
      const exploration = d.explorations.get(input.id);
      if (!exploration) throw new AlchemistOperationError("EXPLORATION_NOT_FOUND", "没有找到这次炼化。", 404);
      return { direction: direction(exploration.directionId), exploration };
    },
    cardGet: input => d.ideaCardActions.getCandidateBrief(input.id),
    cardKeep: input => d.ideaCardActions.keep(input.id),
    cardDiscard: input => ({ card: d.ideaCardActions.discard(input.id) }),
    cardRestore: input => ({ card: d.ideaCardActions.restore(input.id) }),
    ideaGet: input => d.ideaCardActions.getIdeaVersionView(input.id, input.version),
    models: async () => ({ models: await d.listRuntimeModels() }),
    researchGet: (input, signal) => d.getResearchWorkspace(input.id, input.version, signal),
    researchPlan: async ({ id, ...input }, signal) => ({ plan: await d.workReuse.projectPlan(await d.createResearchPlan({ ideaId: id, ...input }), signal) }),
    researchStart: async ({ id, ...input }, signal) => {
      const plan = d.research.getPlan(input.planId);
      if (plan) await d.workReuse.validate(plan, signal);
      return { run: d.startLensRun({ ideaId: id, ...input }) };
    },
    runCancel: input => {
      try { return { run: d.cancelLensRun(input.id) }; }
      catch (error) {
        const code = error instanceof Error ? error.message : "LENS_RUN_NOT_CANCELLABLE";
        if (!["LENS_RUN_NOT_FOUND", "LENS_RUN_NOT_CANCELLABLE"].includes(code)) throw error;
        throw new AlchemistOperationError(code, code === "LENS_RUN_NOT_FOUND" ? "没有找到这次研究。" : "这次研究已经结束，不能再取消。", code === "LENS_RUN_NOT_FOUND" ? 404 : 409);
      }
    },
    runEvents: input => {
      // The original SQLite transaction gives events and terminal status one consistent snapshot.
      return d.jobs.readEvents(input.id, input.after ?? 0);
    },
    settingsGet: () => d.runtimeSettings.getPublicSettings(),
    settingsUpdate: input => d.runtimeSettings.update(input),
    settingsVerify: () => d.runtimeSettings.verifyAndEnable(),
    workspaceExport: async (input, signal) => {
      const file = await d.workspaceExport.create(input.format, signal);
      return { filename: file.filename, mimeType: file.contentType, encoding: "base64", content: Buffer.from(file.body).toString("base64") };
    },
  };
}

const inputProblems: Partial<Record<AlchemistOperationName, [string, string]>> = {
  conversationSend: ["CONVERSATION_MESSAGE_INVALID", "消息或当前讨论上下文不完整。"], decisionCreate: ["DECISION_INVALID", "请选择决定并写下理由。"],
  annotationsList: ["ANNOTATION_QUERY_INVALID", "注释目标不完整。"], annotationCreate: ["ANNOTATION_INVALID", "请保留引用，并另行写下评论。"],
  playbookPropose: ["PLAYBOOK_PROPOSAL_INVALID", "方法变化、正反例和作用域需要由你明确填写。"], tasteCreate: ["TASTE_RULE_INVALID", "请完整写下偏好及其适用范围。"],
  pulseSourceUpdate: ["PULSE_SOURCE_INVALID", "来源设置不完整。"], pulseStart: ["PULSE_RUN_INVALID", "脉搏运行参数不完整。"],
  directionCreate: ["DIRECTION_INPUT_INVALID", "请更完整地描述你想探索的方向。"], directionUpdate: ["DIRECTION_INPUT_INVALID", "方向内容无效。"], directionStatus: ["DIRECTION_INPUT_INVALID", "方向状态无效。"],
  researchPlan: ["RESEARCH_PLAN_INVALID", "研究计划参数不完整。"], researchStart: ["LENS_RUN_INVALID", "启动研究所需信息不完整。"],
  settingsUpdate: ["RUNTIME_SETTINGS_INVALID", "模型选择或调用上限不完整。"], workspaceExport: ["EXPORT_FORMAT_INVALID", "请选择 JSON 或 ZIP。"],
};

function businessError(error: unknown): never {
  if (error instanceof DecisionServiceError) throw new AlchemistOperationError(error.code,
    error.code === "IDEA_VERSION_NOT_FOUND" ? "没有找到这个 Idea 版本。" : error.code === "DECISION_ALREADY_EXISTS" ? "这个 Idea 版本已经有正式决定。"
      : error.code === "DECISION_VERSION_NOT_CURRENT" ? "旧 Idea 版本只能回看。" : "两条兼容研究材料尚未齐全。", error.code === "IDEA_VERSION_NOT_FOUND" ? 404 : 409);
  if (error instanceof OpportunityActionError) throw new AlchemistOperationError(error.message, error.message === "OPPORTUNITY_NOT_FOUND" ? "没有找到这个机会方向。" : "这个机会当前无法执行该动作。", error.message === "OPPORTUNITY_NOT_FOUND" ? 404 : 409);
  if (error instanceof StartPulseRunError) throw new AlchemistOperationError(error.message, "请至少启用一个市场来源。");
  if (error instanceof IdeaActionError || error instanceof IdeaCardTransitionError) {
    if (error.code === "IDEA_CARD_ALREADY_KEPT") throw new AlchemistOperationError(error.code, "这张候选牌已经形成 Idea，不会重复创建版本。", 409, { recovery: "打开已有 Idea 继续查看。", ideaId: error.ideaId });
    if (error.code === "IDEA_CARD_NOT_CANDIDATE" || error.code === "IDEA_CARD_NOT_DISCARDED") throw new AlchemistOperationError(error.code, "这张牌的状态已经改变，请刷新后重试。");
    throw new AlchemistOperationError(error.code, error.code === "IDEA_VERSION_NOT_FOUND" ? "没有找到这个 Idea 版本。" : "没有找到这张候选牌。", 404);
  }
  if (error instanceof ResearchPlanError) throw new AlchemistOperationError(error.code,
    error.code === "IDEA_VERSION_NOT_FOUND" ? "只有正式 Idea 版本可以开始研究。" : error.code === "RUNTIME_MODEL_NOT_FOUND" ? "没有找到所选模型。" : "预算上限无效。", error.code === "IDEA_VERSION_NOT_FOUND" ? 404 : 422);
  if (error instanceof StartLensRunError) throw new AlchemistOperationError(error.code, "这份研究计划无法启动。");
  if (error instanceof Error) {
    const message = workspaceProblems[error.message];
    if (message) throw new AlchemistOperationError(error.message, message, error.message.endsWith("NOT_FOUND") ? 404 : 409);
    if (error.message === "IDEA_VERSION_NOT_FOUND") throw new AlchemistOperationError(error.message, "没有找到这个 Idea 版本。", 404);
    if (error.message === "JOB_NOT_FOUND") throw new AlchemistOperationError("RUN_NOT_FOUND", "没有找到这次运行。", 404);
    if (["RUNTIME_MODEL_UNAVAILABLE", "RUNTIME_NOT_CONFIGURED"].includes(error.message)) throw new AlchemistOperationError(error.message,
      error.message === "RUNTIME_MODEL_UNAVAILABLE" ? "所选模型已不可用，请重新选择；系统不会自动换模型。" : "请在 Molis Work 全局设置中配置模型，再回来重试。");
  }
  throw error;
}

export function createAlchemistOperationExecutor(dependencies: ApiDependencies): AlchemistActionInvoker {
  const handlers = implementations(dependencies);
  const byId = new Map(Object.entries(alchemistOperations).map(([name, operation]) => [operation.definition.capability_id, { name: name as AlchemistOperationName, ...operation }]));
  return {
    async invoke<I, O>(definition: ActionDefinition<I, O>, input: I, signal?: AbortSignal): Promise<O> {
      signal?.throwIfAborted();
      const operation = byId.get(definition.capability_id);
      if (!operation || definition.version !== operation.definition.version) throw new ActionError("actions.not_found", "没有这个炼金术士能力版本。");
      const parsed = operation.input.safeParse(input);
      if (!parsed.success) {
        const [code, message] = inputProblems[operation.name] ?? ["ALCHEMIST_INPUT_INVALID", "操作参数不完整或格式无效。"];
        throw new AlchemistOperationError(code, message, 400);
      }
      let result: unknown;
      try {
        // The mapped implementation and schema always come from the same operation key.
        result = await (handlers[operation.name] as (input: unknown, signal?: AbortSignal) => unknown)(parsed.data, signal);
      } catch (error) { businessError(error); }
      if (!operation.output.safeParse(result).success) throw new ActionError("actions.output_invalid", "炼金术士返回的数据不符合已声明的合同。");
      return result as O;
    },
  };
}

const workspaceProblems: Record<string, string> = {
  ANNOTATION_NOT_FOUND: "没有找到这条注释。", ANNOTATION_ALREADY_RESOLVED: "这条注释已经解决。", ANNOTATION_TARGET_NOT_FOUND: "注释目标版本已不可用。",
  ACTION_PROPOSAL_NOT_FOUND: "没有找到这条校准提案。", ACTION_PROPOSAL_NOT_PENDING: "这条校准提案已经处理。", ACTION_PROPOSAL_UNSUPPORTED: "这类提案目前无法应用。",
  PLAYBOOK_REQUIRES_LENS_REPORT: "研究方法校准需要来自研究报告。", PLAYBOOK_REQUIRES_MARKET_SPACE: "研究方法校准需要来自市场空间研究。",
  IDEA_NOT_FOUND: "没有找到这个 Idea。", TASTE_RULE_NOT_FOUND: "没有找到这条 Taste。", PLAYBOOK_RULE_NOT_FOUND: "没有找到这条校准规则。", PULSE_SOURCE_NOT_FOUND: "没有找到这个市场来源。",
};

/** Host resolves the project runtime from trusted caller context; discovery never opens the database. */
export function createAlchemistActionHandlers(resolve: (caller: ActionCallContext) => AlchemistActionInvoker | Promise<AlchemistActionInvoker>): ActionHandlerBinding[] {
  return Object.values(alchemistOperations).map(({ definition }) => ({ capability_id: definition.capability_id, version: definition.version,
    async handle(caller, input) {
      if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目。");
      return (await resolve(caller)).invoke(definition as ActionDefinition, input, caller.signal);
    },
  }));
}

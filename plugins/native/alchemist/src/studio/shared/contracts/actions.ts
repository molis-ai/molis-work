import { defineSubjectContextAction } from "@molis-ai/molis-work-contracts/platform/actions";
import { z } from "zod";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { createDirectionInputSchema } from "./direction.js";
import { directionUnderstandingSchema } from "./exploration.js";
import { evidenceSchema, lensCompatibilityKeySchema, lensReportSchema, researchPlanRequestSchema } from "./research.js";
import { updateRuntimeSettingsSchema } from "./settings.js";
import { conversationContextSchema, createConversationMessageSchema } from "./conversation.js";
import { annotationTargetSchema, createAnnotationSchema, listAnnotationsQuerySchema } from "./annotation.js";
import { createPlaybookProposalSchema, createTasteRuleSchema } from "./memory.js";
import { createDecisionRequestSchema } from "./decision.js";
import { startPulseRunRequestSchema, pulseSourceParamsSchema } from "./pulse.js";

import { reuseCandidateInputSchema, reuseCandidatesSchema, reuseAssessInputSchema, reuseAssessmentSchema, reuseSelectionSchema, reuseSnapshotSchema, reuseReceiptSchema, reuseFeedbackSchema, reuseReviseSchema, reuseReferenceSchema } from "../../../work-reuse/contracts.js";

const text = z.string(), id = text.min(1), version = z.number().int().positive();
const object = z.strictObject, strings = z.array(text), empty = object({});
export const runStatusSchema = z.enum(["queued", "running", "completed", "partial", "failed", "cancelled", "interrupted"]);
const lifecycle = z.enum(["exploring", "build", "hold", "drop", "archived"]);
export const directionSchema = object({ id, workspaceId: id, title: text, description: text,
  source: z.discriminatedUnion("kind", [object({ kind: z.literal("user_input") }), object({ kind: z.literal("pulse_opportunity"), opportunityId: id, pulseReportId: id })]),
  status: z.enum(["active", "archived"]), createdAt: text, updatedAt: text });
const briefFields = { title: text, highlight: text, targetUser: text, scenario: text, problem: text, mechanism: text,
  valueProposition: text, whyItMayWork: text, assumptions: strings, unknowns: strings, mvp: object({ inScope: strings, outOfScope: strings }) };
const cardFields = { ...briefFields, id, explorationRunId: id, directionId: id, createdAt: text };
export const cardSchema = z.discriminatedUnion("status", [
  object({ ...cardFields, status: z.literal("candidate") }),
  object({ ...cardFields, status: z.literal("discarded"), discardedAt: text }),
  object({ ...cardFields, status: z.literal("kept"), keptAt: text, keptIdeaId: id }),
]);
export const explorationSchema = object({ id, directionId: id, status: runStatusSchema, runtimeLabel: text,
  understanding: directionUnderstandingSchema.optional(), cards: z.array(cardSchema), errorCode: text.optional(), createdAt: text, updatedAt: text });
export const ideaSchema = object({ id, directionId: id, lifecycle, currentVersion: version, createdAt: text, updatedAt: text });
const { problem: _problem, mechanism: _mechanism, ...versionFields } = briefFields;
export const ideaVersionSchema = object({ id, ideaId: id, sourceCardId: id, sourceExplorationRunId: id,
  revision: object({ version, parentVersion: version.optional(), actorId: id, reason: text, createdAt: text }),
  content: object({ ...versionFields, coreProblem: text, coreMechanism: text }) });
const candidateModel = object({ ...briefFields, sourceLabel: text, kind: z.literal("candidate"), cardId: id, status: z.enum(["candidate", "discarded"]) });
const ideaModel = object({ ...briefFields, sourceLabel: text, kind: z.literal("idea"), ideaId: id, version, currentVersion: version });
export const runtimeModelSchema = object({ id, label: text, runtimeLabel: text, costVisibility: z.enum(["priced", "unobservable"]) });
const budget = object({ kind: z.literal("calls"), limit: z.number().int().min(1).max(40) });
export const researchPlanSchema = object({ id, key: lensCompatibilityKeySchema, scopeSummary: text, modelPolicy: z.enum(["auto", "fixed"]), modelId: text,
  runtimeLabel: text, estimatedDuration: object({ minMinutes: z.number(), maxMinutes: z.number() }), budget, appliedPlaybookRuleIds: strings, reuse: reuseSnapshotSchema.optional(), createdAt: text });
export const lensRunSchema = object({ id, planId: id, key: lensCompatibilityKeySchema, status: runStatusSchema,
  stage: z.enum(["planning", "collecting", "cross_checking", "synthesizing"]), runtimeLabel: text, jobId: id, errorCode: text.optional(), createdAt: text, updatedAt: text });
const lensWorkspace = object({ lens: z.enum(["market_space", "build_cost"]), status: z.enum(["not_started", "planned", "queued", "running", "completed", "partial", "failed", "cancelled"]),
  plan: researchPlanSchema.optional(), run: lensRunSchema.optional(), report: lensReportSchema.optional(), evidence: z.array(evidenceSchema).optional() });
const settings = updateRuntimeSettingsSchema.safeExtend({ provider: z.enum(["none", "prologue"]), updatedAt: text, configured: z.boolean(), runtimeLabel: text, models: z.array(runtimeModelSchema) });
const identity = object({ id }), ideaIdentity = object({ id, version });
const conversationContext = z.discriminatedUnion("kind", [conversationContextSchema.options[0], conversationContextSchema.options[1],
  conversationContextSchema.options[2].extend({ version: z.union([version, z.literal("draft")]) }), conversationContextSchema.options[3]]);
const conversationMessage = object({ id, workspaceId: id, actorId: id, author: z.enum(["user", "assistant"]), body: text, context: conversationContext,
  responseState: z.enum(["complete", "runtime_unavailable", "failed"]), parentMessageId: id.optional(), runtimeLabel: text.optional(), createdAt: text });
const annotation = object({ id, workspaceId: id, actorId: id, target: annotationTargetSchema, quotedSnapshot: text, comment: text,
  status: z.enum(["open", "resolved"]), createdAt: text, resolvedAt: text.optional() });
const proposalSource = object({ kind: z.enum(["annotation", "conversation", "direct"]), id });
const ruleFields = { id, workspaceId: id, actorId: id, version, source: proposalSource, createdAt: text, updatedAt: text };
const tasteRule = object({ ...ruleFields, title: text, statement: text, appliesTo: text, exceptions: strings, status: z.enum(["active", "disabled", "deleted"]) });
const playbookRule = object({ ...ruleFields, originalFeedback: text, methodChange: text, positiveExamples: strings, negativeExamples: strings, status: z.enum(["active", "disabled"]),
  scope: z.discriminatedUnion("kind", [object({ kind: z.literal("report"), reportId: id }), object({ kind: z.literal("direction"), directionId: id }), object({ kind: z.literal("global_market_space") })]) });
const proposal = object({ id, workspaceId: id, actorId: id, source: proposalSource, action: z.enum(["create_playbook_rule", "create_taste_rule", "revise_idea"]), target: annotationTargetSchema,
  summary: text, diff: z.array(object({ field: text, before: text, after: text })), versionImpact: text, costImpact: text, memoryImpact: text,
  status: z.enum(["pending", "applied", "rejected"]), createdAt: text, appliedAt: text.optional(), rejectedAt: text.optional() });
const reportBinding = object({ reportId: id, revision: version, lens: z.enum(["market_space", "build_cost"]) });
const decisionSummary = object({ id, outcome: z.enum(["build", "hold", "drop"]), reason: text, revisitCondition: text,
  sourceKind: z.enum(["direct", "annotation", "conversation"]), createdAt: text, reportBindings: z.tuple([reportBinding, reportBinding]) });
const decision = decisionSummary.extend({ ideaId: id, ideaVersion: version, mvpScopeVersion: version, actorId: id });
const decisionMaterial = object({ status: lensWorkspace.shape.status, summary: text.optional(), reportId: id.optional() });
const decisionWorkspace = object({ ideaId: id, ideaVersion: version, currentVersion: version, title: text, lifecycle,
  gate: z.discriminatedUnion("ready", [object({ ready: z.literal(true) }), object({ ready: z.literal(false), code: text, message: text })]),
  materials: object({ market_space: decisionMaterial, build_cost: decisionMaterial }), decision: decisionSummary.optional() });
const activity = object({ id, workspaceId: id, kind: text, targetKind: text, targetId: id, payload: z.record(text, z.unknown()), createdAt: text });
const sourceId = pulseSourceParamsSchema.shape.sourceId;
const pulseSource = object({ sourceId, label: text, enabled: z.boolean(), homepageUrl: text, capability: text, limitation: text, updatedAt: text });
const pulseRun = object({ id, workspaceId: id, status: runStatusSchema, stage: lensRunSchema.shape.stage, sourceIds: z.array(sourceId), runtimeLabel: text, jobId: id,
  errorCode: text.optional(), createdAt: text, updatedAt: text });
const pulseFinding = object({ id, title: text, fact: text, whyItMatters: text, demandInference: text, counterSignals: strings, unknowns: strings, sourceSignalIds: strings });
const pulseReport = object({ id, runId: id, revision: version, status: z.enum(["completed", "partial"]), title: text, summary: text, periodStart: text, periodEnd: text, runtimeLabel: text,
  successfulSourceIds: z.array(sourceId), failedSourceIds: z.array(sourceId), coverageGaps: strings, findings: z.array(pulseFinding), createdAt: text });
const opportunity = object({ id, reportId: id, title: text, highlight: text, rationale: text, demandInference: text, counterSignals: strings, unknowns: strings, sourceSignalIds: strings,
  status: z.enum(["new", "saved_for_later", "converted_to_direction", "dismissed"]), savedAt: text.optional(), dismissedAt: text.optional(), convertedAt: text.optional(), convertedDirectionId: id.optional(), createdAt: text });
const supplySignal = object({ id, sourceId, title: text, url: text, summary: text, observedAt: text, publishedAt: text.optional(), categories: strings,
  nativeMetrics: z.array(object({ name: text, label: text, value: z.number(), unit: z.enum(["count", "percent", "visits", "score"]), observedAt: text, definition: text })), supports: strings, cannotProve: strings });

function operation<I extends z.ZodType, O extends z.ZodType>(name: string, title: string, description: string, kind: "query" | "command", input: I, output: O,
  extraPermissions: readonly string[] = []) {
  const definition: ActionDefinition<z.input<I>, z.output<O>> = {
    capability_id: `alchemist.${name}`, version: 1, operation: kind,
    action: { title, description, kind: kind === "query" ? "query" : "operation", scope: "project", audiences: ["user", "workflow", "agent", "mcp"],
      subject_kinds: ["alchemist"], permissions: ["alchemist:read", ...(kind === "command" ? ["alchemist:write"] : []), ...extraPermissions],
      input_schema: z.toJSONSchema(input, { target: "draft-7", io: "input" }),
      // Studio results are objects, including card/message unions; MCP can return the same shape without an envelope.
      output_schema: { ...z.toJSONSchema(output, { target: "draft-7" }), type: "object" } },
  };
  return { definition, input, output };
}

/** One contract feeds discovery, function calls and the HTTP adapter. No Host IDs or credentials are accepted as input. */
export const alchemistOperations = {
  playbookContext: {
    definition: defineSubjectContextAction("alchemist.playbook.context", "alchemist-playbook", "已确认研究方法", ["alchemist:read"]),
    input: object({ subject_id: id }),
    output: object({ subject: object({ kind: z.literal("alchemist-playbook"), id }), revision: id, title: text, content: text, truncated: z.boolean(), goal_ids: strings, session_id: z.null() }),
  },
  reuseCandidates: operation("reuse.candidates", "寻找可沿用成果与方法", "读取当前授权范围内固定版本成果与适用方法；查询不运行模型，不代表已采用", "query", reuseCandidateInputSchema, reuseCandidatesSchema),
  reuseAssess: operation("reuse.assess", "检查复用适用性", "通过 Prologue 判断给定候选的适用、失效与重核条件，不自动采用", "command", reuseAssessInputSchema, reuseAssessmentSchema, ["alchemist:generate"]),
  reusePublish: operation("reuse.publish", "保存研究固定版本", "将研究与证据幂等登记为当前项目私有 Artifact，不公开发布", "command", object({ reportId: id }), object({ reference: reuseReferenceSchema })),
  reuseReceipt: operation("reuse.receipt", "读取实际复用记录", "区分已选择、已实际消费和关系补写状态，返回固定方法及成果版本", "query", object({ planId: id }), object({ receipt: reuseReceiptSchema.nullable() })),
  reuseReconcile: operation("reuse.reconcile", "补写复用关系", "仅补写已实际消费的 Context Ledger 关系，不重复模型调用", "command", object({ planId: id }), object({ receipt: reuseReceiptSchema.nullable() })),
  reuseFeedback: operation("reuse.feedback", "记录复用效果", "如实记录解释、准备、修正和结果，不推算节省比例", "command", reuseFeedbackSchema, object({ receipt: reuseReceiptSchema })),
  playbookRevise: operation("memory.playbook.revise", "修改研究方法", "确认保存方法新版本；旧计划和实际采用版本保留，已创建未执行计划需重核", "command", reuseReviseSchema, object({ rule: playbookRule })),
  conversationList: operation("conversation.list", "读取炼金术士讨论", "读取当前项目的讨论消息、关联对象及实际回复状态", "query", empty, object({ messages: z.array(conversationMessage) })),
  conversationSend: operation("conversation.send", "与炼金术士讨论", "保存消息，使用所选对象、历史与启用的 Taste 生成回复；不可用或失败时保留消息并明确状态", "command",
    createConversationMessageSchema.extend({ context: conversationContext }), z.union([object({ message: conversationMessage, assistantMessage: conversationMessage }),
      object({ message: conversationMessage, assistant: object({ state: z.literal("runtime_unavailable"), message: text }) })]), ["alchemist:generate"]),
  decisionsList: operation("decisions.list", "读取决策列表", "读取待决策 Idea、历史决定和实际活动记录", "query", empty,
    object({ cases: z.array(decisionWorkspace.extend({ status: z.enum(["pending", "decided", "old_version"]), nextPanel: z.enum(["market", "cost", "decision"]), nextAction: text })),
      log: z.array(decision.extend({ title: text, destination: text })), activities: z.array(activity) })),
  decisionGet: operation("decisions.workspace", "读取 Idea 决策依据", "检查指定版本的两类研究是否完整、兼容，以及已有决定", "query", ideaIdentity, decisionWorkspace),
  decisionCreate: operation("decisions.create", "记录正式决定", "仅在当前 Idea 版本研究材料齐全时记录 Build、Hold 或 Drop；保留理由和报告引用", "command",
    createDecisionRequestSchema.extend({ id, version }), object({ decision })),
  annotationsList: operation("annotations.list", "读取报告注释", "按对象和固定版本读取注释", "query", listAnnotationsQuerySchema.extend({ revision: version }), object({ annotations: z.array(annotation) })),
  annotationCreate: operation("annotations.create", "添加报告注释", "保存所选正文原文与单独评论；验证目标版本仍存在", "command", createAnnotationSchema, object({ annotation })),
  annotationResolve: operation("annotations.resolve", "解决报告注释", "将未解决注释标为已解决，保留原始引用和评论", "command", identity, object({ annotation })),
  memoryGet: operation("memory.read", "读取 Taste 与研究方法", "读取长期偏好、研究方法及实际应用的计划和运行引用", "query", empty,
    object({ taste: z.array(tasteRule), playbook: z.array(playbookRule.extend({ applications: z.array(object({ planId: id, runId: id.optional() })) })) })),
  playbookPropose: operation("memory.propose", "提出研究方法校准", "依据市场研究报告注释提出方法、正反例和适用范围；应用前不改变长期规则", "command",
    createPlaybookProposalSchema.extend({ id }), object({ proposal })),
  proposalList: operation("proposals.pending", "继续待确认方法", "读取当前调用者尚未确认的持久化方法提案", "query", empty, object({ proposals: z.array(proposal) })),
  proposalReject: operation("proposals.reject", "不采用方法提案", "撤回尚未确认的方法提案，保留原批注", "command", identity, object({ proposal })),
  proposalApply: operation("memory.apply", "应用研究方法提案", "应用待处理提案并解决来源注释；同一提案不能重复应用", "command", identity, object({ proposal, rule: playbookRule })),
  tasteCreate: operation("memory.taste.create", "添加个人偏好", "保存带适用范围与例外的 Taste，不将其当作市场证据", "command", createTasteRuleSchema, object({ rule: tasteRule })),
  tasteDisable: operation("memory.taste.disable", "停用个人偏好", "保留偏好记录，后续构思与讨论不再使用", "command", identity, object({ rule: tasteRule })),
  playbookDisable: operation("memory.playbook.disable", "停用研究方法", "保留历史方法和应用记录，后续计划不再选用", "command", identity, object({ rule: playbookRule })),
  pulseReports: operation("pulse.reports", "读取市场脉搏", "读取来源信号、报告、机会与最近运行状态，保留覆盖缺口", "query", empty,
    object({ latestRun: pulseRun.optional(), reports: z.array(object({ report: pulseReport, opportunities: z.array(opportunity), signals: z.array(supplySignal) })) })),
  pulseSources: operation("pulse.sources", "读取市场来源", "读取来源启用状态、能力和局限", "query", empty, object({ sources: z.array(pulseSource) })),
  pulseSourceUpdate: operation("pulse.sources.configure", "设置市场来源", "启用或停用已有市场来源", "command", object({ sourceId, enabled: z.boolean() }), object({ source: pulseSource })),
  pulseStart: operation("pulse.start", "运行市场脉搏", "从已启用来源抓取真实信号并生成报告，返回后台任务", "command", startPulseRunRequestSchema, object({ run: pulseRun }), ["alchemist:collect"]),
  opportunitySave: operation("opportunities.save", "暂存市场机会", "将新机会加入稍后查看，并返回真实位置", "command", identity,
    object({ opportunity, destination: object({ surface: z.literal("pulse"), collection: z.literal("saved_for_later") }) })),
  opportunityConvert: operation("opportunities.convert", "市场机会形成方向", "从机会创建探索方向；重复转换返回原方向，并以 created 说明是否新建", "command", identity,
    object({ opportunity, direction: directionSchema, created: z.boolean(), destination: object({ surface: z.literal("ideas"), directionId: id }) })),
  bootstrap: operation("workspace.read", "炼金术士工作区", "读取当前项目方向、炼化记录和已保留 Idea", "query", empty,
    object({ workspace: object({ id, name: text }), actor: object({ id, name: text }), directions: z.array(directionSchema), explorations: z.array(explorationSchema),
      ideas: z.array(object({ id, directionId: id, title: text, lifecycle, currentVersion: version, updatedAt: text })) })),
  directionCreate: operation("directions.create", "创建探索方向", "保存方向描述，尚不启动模型生成", "command", createDirectionInputSchema, object({ direction: directionSchema })),
  directionUpdate: operation("directions.update", "编辑探索方向", "修改已有方向，保留已生成的卡片和 Idea", "command", createDirectionInputSchema.extend({ id }), object({ direction: directionSchema })),
  directionStatus: operation("directions.status", "归档或恢复方向", "归档后保留历史，并停止从该方向启动新炼化", "command", object({ id, status: z.enum(["active", "archived"]) }), object({ direction: directionSchema })),
  explorationStart: operation("explorations.start", "启动炼化", "将方向加入后台生成任务；reuseExisting 为 true 时返回最近一次炼化", "command", object({ id, reuseExisting: z.boolean().optional() }),
    object({ runId: id, jobId: id.optional(), reused: z.boolean().optional() }), ["alchemist:generate"]),
  explorationGet: operation("explorations.get", "读取炼化", "读取真实运行状态、候选卡与来源方向", "query", identity, object({ direction: directionSchema, exploration: explorationSchema })),
  cardGet: operation("cards.get", "读取候选卡", "读取卡片正文；已保留的卡片返回对应 Idea 和版本", "query", identity,
    z.discriminatedUnion("kind", [object({ kind: z.literal("candidate"), model: candidateModel }), object({ kind: z.literal("idea_redirect"), ideaId: id, version })])),
  cardKeep: operation("cards.keep", "保留候选卡", "形成正式 Idea 初始版本；重复保留返回已有 Idea 引用的冲突", "command", identity, object({ idea: ideaSchema, version: ideaVersionSchema, card: cardSchema })),
  cardDiscard: operation("cards.discard", "丢弃候选卡", "将候选牌标为丢弃，可恢复", "command", identity, object({ card: cardSchema })),
  cardRestore: operation("cards.restore", "恢复候选卡", "恢复已丢弃的候选牌", "command", identity, object({ card: cardSchema })),
  ideaGet: operation("ideas.version", "读取 Idea 版本", "读取固定版本正文、来源及当前版本号", "query", ideaIdentity, object({ idea: ideaSchema, version: ideaVersionSchema, model: ideaModel })),
  models: operation("runtime.models", "可用研究模型", "读取 Host 配置提供的模型，不返回凭据", "query", empty, object({ models: z.array(runtimeModelSchema) })),
  researchGet: operation("research.workspace", "读取研究工作区", "读取 Idea 指定版本的市场和成本研究、计划、报告及证据", "query", ideaIdentity,
    object({ ideaId: id, ideaVersion: version, models: z.array(runtimeModelSchema), lenses: object({ market_space: lensWorkspace, build_cost: lensWorkspace }) })),
  researchPlan: operation("research.plan", "创建研究计划", "设置研究模型和调用次数上限；仅创建计划，不执行研究", "command",
    researchPlanRequestSchema.safeExtend({ id, lens: z.enum(["market_space", "build_cost"]), reuse: reuseSelectionSchema.optional() }), object({ plan: researchPlanSchema })),
  researchStart: operation("research.start", "启动研究", "执行已确认的研究计划并返回后台任务引用", "command",
    object({ id, lens: z.enum(["market_space", "build_cost"]), planId: id }), object({ run: lensRunSchema }), ["alchemist:generate"]),
  runCancel: operation("research.cancel", "取消研究", "按研究 run.jobId 取消市场或成本研究；不接受 run.id，也不取消探索或脉搏任务", "command", identity, object({ run: lensRunSchema })),
  runEvents: operation("runs.events", "读取任务事件", "按 jobId（不是研究 run.id）读取 after 游标后的事件；重复查询不会取消任务", "query",
    object({ id, after: z.number().int().nonnegative().optional() }), object({ jobId: id, status: runStatusSchema, cursor: z.number().int().nonnegative(),
      events: z.array(object({ jobId: id, sequence: z.number().int().positive(), type: text, payload: z.unknown(), createdAt: text })) })),
  settingsGet: operation("runtime.settings", "读取炼金术士模型设置", "读取所选模型、可用状态与默认研究调用上限", "query", empty, settings),
  settingsUpdate: operation("runtime.configure", "设置炼金术士模型", "更新模型选择与调用上限；失效的指定模型不自动替换", "command", updateRuntimeSettingsSchema, settings),
  settingsVerify: operation("runtime.verify", "检查炼金术士模型", "检查当前模型配置是否可用，不发起生成请求", "query", empty, settings),
  workspaceExport: operation("workspace.export", "导出炼金术士工作区", "返回真实 JSON 或 ZIP 字节的 base64、文件名与 MIME；包含业务记录，不包含模型凭据", "command",
    object({ format: z.enum(["json", "zip"]) }), object({ filename: text, mimeType: z.enum(["application/json; charset=utf-8", "application/zip"]), encoding: z.literal("base64"), content: text })),
};

export type AlchemistOperationName = keyof typeof alchemistOperations;
export type AlchemistOperationInput<K extends AlchemistOperationName> = z.output<(typeof alchemistOperations)[K]["input"]>;
export const alchemistActions = Object.fromEntries(Object.entries(alchemistOperations).map(([key, operation]) => [key, operation.definition])) as {
  [K in AlchemistOperationName]: (typeof alchemistOperations)[K]["definition"]
};
export const ALCHEMIST_ACTION_PERMISSIONS = [...new Set(Object.values(alchemistActions).flatMap(action => action.action.permissions))];

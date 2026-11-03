import type { ActionDefinition, ActionIntake, ActionResultView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { BoardSnapshot, CreateGoalIntentInput, CreateGoalIntentResult, GoalEventDecisionResult, GoalEventDirectoryItem, GoalsCommandApi,
  ProjectGuidanceView, RecordGoalUserDecisionInput } from "./goals.js";
import type { GoalTreeProposalCheckInput, GoalTreeProposalCheckResult, GoalTreeProposalDecideInput, GoalTreeProposalDecisionResult,
  GoalTreeProposalListQuery, GoalTreeProposalListResult, GoalTreeProposalRecord, GoalTreeProposalSubmitInput } from "./governance-collaboration.js";
import { goalIntentSourceKinds } from "./goal-events.js";
import { goalAction, inGoalRelation } from "./goal-action-definition.js";
import { text, identifier, count, boolean, object, array, nullable, enumeration, scope, change, effect, decision, goalDirectoryItemSchema } from "./goal-event-action-schemas.js";
import { boardSnapshotSchema } from "./goal-snapshot-action-schemas.js";
import { projectGuidanceEntrySchema, projectGuidanceRevisionSchema } from "./goal-guidance-action-schemas.js";
import * as tree from "./goal-tree-action-schemas.js";

export type InitializeBoardOutput = { project_id: string; replayed: boolean; observed_event_cursor: number };
export type GoalCreateActionInput = Omit<CreateGoalIntentInput, "project_id" | "actor_id" | "actor_kind">;
export type GoalDecisionActionInput = Omit<RecordGoalUserDecisionInput, "project_id" | "authority">;
type Business<Input> = Omit<Input, "project_id" | "actor_id" | "submitted_session_id" | "runtime_actor_id" | "authority">;

/** A source taken as an input of a Goal as it was then: the receipt holds the digest of what was confirmed, not a live link. Only the person's
 * call records it `confirmed`; every other caller (assistant, agent, workflow, MCP client) records it `proposed`, and it stays so until the person
 * accepts it (`goals.inputs.accept`) or removes it (`goals.inputs.release`). */
export interface GoalConfirmedInput {
  binding_id: string;
  goal_id: string;
  source: { kind: "feed_item"; id: string };
  name: string;
  snapshot_digest: string | null;
  state: "proposed" | "confirmed" | "inactive";
  created_at: string;
}
const confirmedSource = object({ kind: enumeration(["feed_item"]), id: { ...identifier, maxLength: 200 } });
/** What the owner of a source computes of it: `sha256:` and 64 lower-case hex digits; the reason is one bounded sentence like a deliverable's. */
const snapshotDigest = { type: "string", pattern: "^sha256:[0-9a-f]{64}$" };
export const goalConfirmedInputSchema = object({ binding_id: text, goal_id: text, source: confirmedSource, name: text, snapshot_digest: { type: ["string", "null"] },
  state: enumeration(["proposed", "confirmed", "inactive"]), created_at: text });

/**
 * Where a plan in hand becomes proposed goal steps (context-program §21.10). `goals.tree.submit` only files a proposal that the person
 * approves in Goals, so the entry is `proposes`: the surface always shows a card first, there is nothing to undo (withdrawing a proposal is
 * the approval decision, `goals.tree.decide`, which an undo must not stand in for), and the rules alone never push it for a passage.
 * The query named in `prepare` computes the whole proposal from the selection without a model.
 */
export const GOALS_TREE_INTAKE: ActionIntake = {
  intake_id: "breakdown", item_kind: "goal_tree_proposal", title: "目标步骤", verb: "拆成目标步骤", effect: "proposes",
  describe: "一段计划或一串步骤：拆成可以跟踪、验收的目标步骤，只是提议，要在 Goals 里确认才生效；不是随手记一件事，也不是已经定下的目标",
  examples: ["把这周的发布计划拆成目标步骤", "把这几条拆成可以推进的目标", "这段方案变成可以验收的步骤"],
  prepare: { capability_id: "goals.fragment.offers", version: 1 },
};

/** What the card says once the proposal is filed: it is not in force yet, and the way on is Goals. */
export const GOALS_TREE_SUBMIT_RESULT: ActionResultView = {
  summary: "已提交目标提案：要在 Goals 里确认才生效",
  link: { label: "去 Goals 确认", href_template: "/projects/{project_id}/?openPlugin=goals#{/proposal/proposal_id}" },
};

/** An action only the person can call, through a protected entry: the other audiences never see it. */
function userOnly<Input, Output>(definition: ActionDefinition<Input, Output>, permissions?: string[]): ActionDefinition<Input, Output> {
  return { ...definition, action: { ...definition.action, audiences: ["user"], ...(permissions ? { permissions } : {}) } };
}
const versioned = <Input, Output>(definition: ActionDefinition<Input, Output>, version: number): ActionDefinition<Input, Output> => ({ ...definition, version });

const initialize = goalAction<{ idempotency_key: string }, InitializeBoardOutput>("goals.board.initialize", "初始化目标资料库",
  "在当前可信管理上下文中为本项目初始化尚不存在的目标资料库；不创建项目目录绑定，不覆盖已有资料库，重试保留原请求键", "command",
  object({ idempotency_key: identifier }), object({ project_id: text, replayed: boolean, observed_event_cursor: count }));
const submit = goalAction<Business<GoalTreeProposalSubmitInput>, { proposal: GoalTreeProposalRecord; replayed: boolean; observed_event_cursor: number }>("goals.tree.submit", "提交结构提案",
  "提交新目标及父子或依赖关系的待确认提案；提交不会创建正式目标。五项及以上变化须提供整份 narrative 和逐项 explanation。用户通过 Web 或管理入口审批后落地", "command", tree.treeSubmitInputSchema, tree.treeSubmitResultSchema);
const treeSubmit: ActionDefinition<Business<GoalTreeProposalSubmitInput>, { proposal: GoalTreeProposalRecord; replayed: boolean; observed_event_cursor: number }> = {
  ...submit, action: { ...submit.action, intake: GOALS_TREE_INTAKE, result_view: GOALS_TREE_SUBMIT_RESULT } };
const treeDecide = goalAction<Business<GoalTreeProposalDecideInput>, GoalTreeProposalDecisionResult<never>>("goals.tree.decide", "审批结构提案",
  "保存用户通过受保护入口作出的逐项或整组决定；整组确认全有或全无。实际用户和操作出处由 Host 提供", "command", tree.treeDecideInputSchema, tree.treeDecisionResultSchema);
const decide = goalAction<GoalDecisionActionInput, GoalEventDecisionResult>("goals.decisions.record", "记录用户决定",
  "保存用户本人通过受保护入口作出的决定；模型只能请求或引用决定。作者及操作出处由 Host 注入，仍核对原请求和当前承诺", "command",
  object({ goal_id: identifier, idempotency_key: identifier, request_id: identifier, selected_option_id: identifier,
    conclusion: identifier, accepts_requirements: boolean, effects: array({ ...effect, properties: { ...effect.properties as Record<string, unknown>, action: identifier } }), authorized_change: change,
    scope: { ...scope, required: [] } }, ["goal_id", "idempotency_key", "conclusion"]),
  object({ event_id: identifier, observed_event_cursor: count, replayed: boolean, recorded: { const: true }, decision }));

/**
 * The Goals actions the platform's own entries call (command line, management MCP, onboarding, Feed promotion, project arrival); the plugin
 * declares and handles these same objects. Calls still go through the action gateway, which checks the caller and picks the provider.
 */
export const goalEntryActions = {
  /** Version 2 (S8): the project's name is the directory's, not Goals', so the input no longer carries a title. */
  initialize: versioned(userOnly(initialize), 2),
  treeSubmit,
  treeRead: goalAction<Business<GoalTreeProposalListQuery>, GoalTreeProposalListResult>("goals.tree.read", "读取结构提案",
    "读取当前项目的结构提案；可按提案 ID 或根目标筛选", "query", tree.treeReadInputSchema, tree.treeReadResultSchema),
  treeCheck: versioned(goalAction<Business<GoalTreeProposalCheckInput>, GoalTreeProposalCheckResult>("goals.tree.check", "检查结构提案",
    "检查提案的事实基线及目标关系约束，保存检查结果；预检回滚正式目标和关系变更", "command", tree.treeCheckInputSchema, tree.treeCheckResultSchema), 2),
  treeDecide: versioned(userOnly(treeDecide, ["goals:decide"]), 2),
  active: goalAction<{ goal_id: string; reason: string; idempotency_key: string }, ReturnType<GoalsCommandApi["setActiveGoal"]>>("goals.active.set", "设为当前目标",
    "选择当前未完成且不在归档/回收站的目标；不启动工作，不改变完成状态", "command",
    object({ goal_id: identifier, reason: identifier, idempotency_key: identifier }), object({ active_goal_id: text, observed_event_cursor: count, replayed: boolean })),
  /** Version 2 (S8): the board in the snapshot no longer carries a name. */
  snapshot: versioned(goalAction<Record<string, never>, BoardSnapshot>("goals.snapshot.read", "读取项目目标完整快照",
    "读取当前项目的目标资料：全部目标、关系、规划方法、项目长期说明和结构提案；不含事件正文，需要时用 goals.events.list 或 goals.history.list 读取", "query", object({}), boardSnapshotSchema), 2),
  decide: userOnly(decide, ["goals:decide"]),
  guidanceRead: goalAction<Record<string, never>, ProjectGuidanceView>("goals.guidance.read", "读取项目长期说明", "读取已确认的长期说明、停用项、完整修订和当前 Runtime Prompt 前缀", "query",
    object({}), object({ entries: array(projectGuidanceEntrySchema), inactive_entries: array(projectGuidanceEntrySchema), revisions: array(projectGuidanceRevisionSchema),
      virtual_document: text, runtime_prompt_prefix: text })),
  create: inGoalRelation(goalAction<GoalCreateActionInput, CreateGoalIntentResult>("goals.create", "创建目标", "保存目标原始意图、要求及关系；创建本身不会完成目标。重试须保留相同 idempotency_key", "command",
    object({ title: identifier, outcome: text, why: text, business_logic: text, priority: { type: "number", minimum: 0, maximum: 100 },
      goal_id: text, parent_goal_id: text, dependency_goal_ids: { type: "array", items: text },
      requirements: { type: "array", items: object({ requirement_id: text, statement: identifier, human_decision_required: boolean }, ["statement"]) },
      source_kind: { enum: [...goalIntentSourceKinds] }, idempotency_key: identifier }, ["title", "idempotency_key"]),
    object({ goal: object({ goal_id: text, project_id: text, title: text, outcome: text }), replayed: boolean, observed_event_cursor: count,
      recorded: { const: true }, completion_effect: { const: false } })), "create"),
  directoryItem: goalAction<{ goal_id: string }, GoalEventDirectoryItem | null>("goals.directory.read", "读取目标目录项", "按目标 ID 读取目录摘要；不存在、已归档或已丢弃时返回 null", "query",
    object({ goal_id: identifier }), nullable(goalDirectoryItemSchema)),
  inputsConfirm: goalAction<{ goal_id: string; source: { kind: "feed_item"; id: string }; name: string; snapshot_digest: string; reason: string }, { binding: GoalConfirmedInput; replayed: boolean }>("goals.inputs.confirm",
    "确认来源材料为目标的输入", "把一条来源材料（目前是 Feed 消息）按确认时内容的摘要记为目标的输入；用户调用记为已确认，助理、Agent、工作流和外部工具调用只记为待确认，等用户在目标的输入里认可或移除；不复制、不移动原材料，重复确认返回原记录，来源已被提议、还在等用户认可时用户的确认被拒绝（先认可）", "command",
    object({ goal_id: identifier, source: confirmedSource, name: { ...identifier, maxLength: 200 }, snapshot_digest: snapshotDigest, reason: { ...identifier, maxLength: 300 } }),
    object({ binding: goalConfirmedInputSchema, replayed: boolean })),
} as const;

import { ActionError, type ActionCallContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GoalTreeApplicationApi } from "./goal-tree-contract.js";
import { goalAction, goalActor } from "./action-contract.js";
import * as schema from "./tree-action-schemas.js";

type Input<Key extends keyof GoalTreeApplicationApi> = Omit<Parameters<GoalTreeApplicationApi[Key]>[0],
  "board_id" | "actor_id" | "submitted_session_id" | "runtime_actor_id" | "authority">;
type Output<Key extends keyof GoalTreeApplicationApi> = ReturnType<GoalTreeApplicationApi[Key]>;
const decide = goalAction<Input<"decideGoalTreeProposal">, Output<"decideGoalTreeProposal">>("goals.tree.decide", "审批结构提案",
  "保存用户通过受保护入口作出的逐项或整组决定；整组确认全有或全无。历史提案仅供阅读，结构变化须提交新提案。实际用户和操作出处由 Host 提供", "command", schema.treeDecideInputSchema, schema.treeDecisionResultSchema);
export const goalsTreeActions = {
  treeSubmit: goalAction<Input<"submitGoalTreeProposal">, Output<"submitGoalTreeProposal">>("goals.tree.submit", "提交结构提案",
    "提交新目标及父子或依赖关系的待确认提案；提交不会创建正式目标，不需要 Run。五项及以上变化须提供整份 narrative 和逐项 explanation。用户通过 Web 或管理入口审批后落地", "command", schema.treeSubmitInputSchema, schema.treeSubmitResultSchema),
  treeRead: goalAction<Input<"listGoalTreeProposals">, Output<"listGoalTreeProposals">>("goals.tree.read", "读取结构提案",
    "读取当前项目的原生及历史提案；可按提案 ID 或根目标筛选，历史原始 ID 和 legacy 映射 ID 均可读取。历史条目不能通过新审批落地", "query", schema.treeReadInputSchema, schema.treeReadResultSchema),
  treeCheck: goalAction<Input<"checkGoalTreeProposal">, Output<"checkGoalTreeProposal">>("goals.tree.check", "检查结构提案",
    "检查原生提案的事实基线及目标关系约束，保存检查结果；预检回滚正式目标和关系变更。历史提案不支持新检查，请提交新的目标或关系提案", "command", schema.treeCheckInputSchema, schema.treeCheckResultSchema),
  treeDecide: { ...decide, action: { ...decide.action, audiences: ["user"] as const, permissions: ["goals:decide"] } },
} as const;

function authority(caller: ActionCallContext) {
  const p = caller.user_action;
  if (caller.audience !== "user" || caller.actor_kind !== "user" || !caller.actor_id.trim()
    || !p?.conversation_ref.trim() || !p.message_ref.trim() || !["web", "management"].includes(p.source)) {
    throw new ActionError("goal_tree_proposal.untrusted_actor", "结构审批需要受保护入口提供真实用户及操作出处；模型自报确认无效");
  }
  return { actor_id: caller.actor_id, actor_kind: "user" as const, authority_source: p.source as "web" | "management",
    conversation_ref: p.conversation_ref, message_ref: p.message_ref,
    whole_confirmation_prompted: p.whole_confirmation_prompted,
    prompted_proposal_id: p.prompted_subject_id };
}
export function createGoalsTreeActionHandlers(tree: GoalTreeApplicationApi, boardId: string): ActionHandlerBinding[] {
  return [
    { ...goalsTreeActions.treeSubmit, handle: (caller, input) => tree.submitGoalTreeProposal({ ...input as Input<"submitGoalTreeProposal">,
      board_id: boardId, actor_id: goalActor(caller).actor_id, submitted_session_id: caller.runtime_session_id }) },
    { ...goalsTreeActions.treeRead, handle: (_caller, input) => tree.listGoalTreeProposals({ ...input as Input<"listGoalTreeProposals">, board_id: boardId }) },
    { ...goalsTreeActions.treeCheck, handle: (caller, input) => tree.checkGoalTreeProposal({ ...input as Input<"checkGoalTreeProposal">,
      board_id: boardId, actor_id: goalActor(caller).actor_id }) },
    { ...goalsTreeActions.treeDecide, availability(caller) {
      try { authority(caller); return { available: true }; }
      catch (error) { if (error instanceof ActionError) return { available: false, code: error.code, reason: error.message }; throw error; }
    }, handle: (caller, input) => tree.decideGoalTreeProposal({ ...input as Input<"decideGoalTreeProposal">,
      board_id: boardId, authority: authority(caller), runtime_actor_id: caller.audit_actor_id }) },
  ];
}

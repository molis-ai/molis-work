import { goalsActions, GOALS_PLUGIN_ID, type GoalEntryCompositionApi } from "@molis-ai/molis-work-plugin-goals";
import { ActionError, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { CreateGoalIntentResult, GoalEventDirectoryPage, GoalTrashResult } from "@molis-ai/molis-work-contracts/modules/goals";
import { goalEventClosureKinds, goalEventConcernActions } from "@molis-ai/molis-work-contracts/modules/goals";
import type { McpToolDefinition } from "./protocol.js";
import { MolisWorkV1Error } from "@molis-ai/molis-work-contracts/platform/errors";
import { mcpWebUrl } from "./goal-presentation.js";
import { planningMethodResponse } from "./query-presentation.js";
import { presentGoalTrashResult } from "./goal-trash-presentation.js";

/** Existing names only. New Goals capabilities are discovered from the plugin's action contracts. */
export const LEGACY_GOALS_MCP = [
  { name: "molis_work_v1_snapshot", action: goalsActions.snapshot, session_actor: false },
  { name: "molis_work_v1_goal_tree_propose", action: goalsActions.treeSubmit, session_actor: true },
  { name: "molis_work_v1_goal_tree_read", action: goalsActions.treeRead, session_actor: false },
  { name: "molis_work_v1_goal_tree_check", action: goalsActions.treeCheck, session_actor: true },
  { name: "molis_work_v1_active_goal", action: goalsActions.active, session_actor: true },
  { name: "molis_work_v1_goal_trash", action: goalsActions.trash, session_actor: true },
  { name: "molis_work_v1_goal_restore", action: goalsActions.trash, session_actor: true },
  { name: "molis_work_v1_goal_trash_list", action: goalsActions.trashed, session_actor: false },
  { name: "molis_work_v1_project_guidance_get", action: goalsActions.guidanceRead, session_actor: false },
  { name: "molis_work_v1_project_guidance_add", action: goalsActions.guidanceAdd, session_actor: true },
  { name: "molis_work_v1_project_guidance_update", action: goalsActions.guidanceUpdate, session_actor: true },
  { name: "molis_work_v1_planning_methods", action: goalsActions.planningRead, session_actor: false },
  { name: "molis_work_v1_planning_method_save", action: goalsActions.planningSave, session_actor: true },
  { name: "molis_work_v1_planning_analyze_change", action: goalsActions.planningImpact, session_actor: false },
  { name: "molis_work_v1_planning_graph_check", action: goalsActions.planningGraph, session_actor: false },
  { name: "molis_work_v1_event_configure", action: goalsActions.configure, session_actor: true },
  { name: "molis_work_v1_event_report", action: goalsActions.report, session_actor: true },
  { name: "molis_work_v1_event_progress", action: goalsActions.progress, session_actor: true },
  { name: "molis_work_v1_event_concern", action: goalsActions.concern, session_actor: true },
  { name: "molis_work_v1_event_decision_request", action: goalsActions.requestDecision, session_actor: true },
  { name: "molis_work_v1_event_cite_decision", action: goalsActions.citeDecision, session_actor: true },
  { name: "molis_work_v1_event_agree", action: goalsActions.agree, session_actor: true },
  { name: "molis_work_v1_event_close", action: goalsActions.close, session_actor: true },
  { name: "molis_work_v1_event_resume", action: goalsActions.resume, session_actor: true },
  { name: "molis_work_v1_goal_intent_create", action: goalsActions.create, session_actor: true },
  { name: "molis_work_v1_goal_list", action: goalsActions.list, session_actor: false },
  { name: "molis_work_v1_goal_state", action: goalsActions.state, session_actor: false },
  { name: "molis_work_v1_event_list", action: goalsActions.events, session_actor: false },
  { name: "molis_work_v1_event_read", action: goalsActions.event, session_actor: false },
  { name: "molis_work_v1_event_note", action: goalsActions.note, session_actor: true },
] as const;

function legacyInputSchema(binding: typeof LEGACY_GOALS_MCP[number]) {
  const inputSchema = structuredClone(binding.action.action.input_schema);
  delete (inputSchema.properties as Record<string, unknown>).source_kind;
  if (binding.action === goalsActions.trash) {
    delete (inputSchema.properties as Record<string, unknown>).trashed;
    (inputSchema as Record<string, unknown>).required = (inputSchema.required as string[]).filter(key => key !== "trashed");
  }
  if (binding.name === "molis_work_v1_planning_methods") Object.assign(inputSchema.properties as Record<string, unknown>, {
    method_ids: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", minLength: 1 }, description: "只返回这些方法并保持顺序；未知 ID 会明确报错" },
    include_instructions: { type: "boolean", description: "默认完整响应；false 先读轻量目录，随后按 method_ids 读取正文" },
  });
  return inputSchema;
}
export const LEGACY_GOALS_MCP_TOOLS: McpToolDefinition[] = LEGACY_GOALS_MCP.map(binding => {
  const inputSchema = legacyInputSchema(binding);
  return { name: binding.name, description: binding.action.action.description, inputSchema };
});

export async function callLegacyGoalsMcp(actions: BoundActionClient, name: string, input: Record<string, unknown>,
  urls: { projectId?: string; webBaseUrl: string }): Promise<string> {
  const binding = LEGACY_GOALS_MCP.find(item => item.name === name);
  if (!binding) throw new MolisWorkV1Error("mcp.tool_unknown", `未知 Goals 兼容方法：${name}`);
  const allowed = Object.keys(legacyInputSchema(binding).properties as Record<string, unknown>);
  const unexpected = Object.keys(input).filter(key => !allowed.includes(key));
  if (unexpected.length) throw new MolisWorkV1Error("mcp.unexpected_field", `不能使用未许可字段：${unexpected.join("、")}`, { fields: unexpected });
  const withUrl = <T>(value: T, goalId: string) => ({ ...value, goal_url: mcpWebUrl(
    `${urls.projectId ? `/projects/${encodeURIComponent(urls.projectId)}` : ""}/goals/${encodeURIComponent(goalId)}`, urls.webBaseUrl,
    (code, message) => new MolisWorkV1Error(code, message)) });
  // Keep only wire presentation here; validation, transactions and idempotency belong to the action.
  const reference = { ...binding.action, provider_id: GOALS_PLUGIN_ID };
  let result: unknown;
  const payload = binding.action === goalsActions.trash ? { ...input, trashed: name === "molis_work_v1_goal_trash" }
    : name === "molis_work_v1_planning_methods" ? {} : input;
  try { result = await actions.invoke<unknown, unknown>(reference, payload); }
  catch (error) {
    if (error instanceof ActionError && error.code === "goal.trash_confirmation_required") {
      throw new MolisWorkV1Error("mcp.user_confirmation_required", error.message);
    }
    if (error instanceof ActionError && error.code === "actions.input_invalid") legacyInputError(name, input);
    if (error instanceof ActionError) throw new MolisWorkV1Error(error.code, error.message);
    throw error;
  }
  if (binding.action === goalsActions.trash) {
    const trash = result as GoalTrashResult;
    return JSON.stringify(presentGoalTrashResult(trash, {
      goal_id: trash.goal.goal_id, status: trash.goal.trashed_at ? "trashed" : "open",
    }), null, 2);
  }
  if (name === "molis_work_v1_goal_intent_create") {
    const created = result as CreateGoalIntentResult;
    return JSON.stringify(withUrl(created, created.goal.goal_id), null, 2);
  }
  if (name === "molis_work_v1_goal_list") {
    const page = result as GoalEventDirectoryPage;
    return JSON.stringify({ ...page, goals: page.goals.map(goal => withUrl(goal, goal.goal_id)) }, null, 2);
  }
  if (name === "molis_work_v1_goal_state") return JSON.stringify(withUrl(result, String(input.goal_id)), null, 2);
  if (name === "molis_work_v1_planning_methods") {
    const planning = result as ReturnType<GoalEntryCompositionApi["readPlanningComposition"]>;
    return JSON.stringify(planningMethodResponse(planning.methods, planning.composition, input,
      (code, message, details) => new MolisWorkV1Error(code, message, details)), null, 2);
  }
  return JSON.stringify(result, null, 2);
}

/** Preserve established legacy diagnostics after the shared action rejects the input. */
function legacyInputError(name: string, input: Record<string, unknown>): void {
  if (name === "molis_work_v1_event_close") {
    if (!(goalEventClosureKinds as readonly unknown[]).includes(input.kind)) throw new MolisWorkV1Error("event_closure.invalid_kind", "收尾类型只能是 complete 或 cancel");
    if (input.expected_config_version == null) throw new MolisWorkV1Error("event_closure.expected_config_version_required", "收尾需要当前配置版本");
    if (input.expected_agreement_version == null) throw new MolisWorkV1Error("event_closure.expected_agreement_version_required", "收尾需要当前约定版本");
  }
  if (name === "molis_work_v1_event_concern" && !(goalEventConcernActions as readonly unknown[]).includes(input.action)) {
    throw new MolisWorkV1Error("event_concern.invalid_action", "Concern 动作只能是 open、resolve、accept 或 overturn");
  }
  if (name === "molis_work_v1_event_resume" && (typeof input.reason !== "string" || !input.reason.trim())) {
    throw new MolisWorkV1Error("event_resume.reason_required", "重新继续需要说明理由");
  }
}

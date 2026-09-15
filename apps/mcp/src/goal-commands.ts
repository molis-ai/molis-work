import type { GoalsEntryApi, AsyncGoalsEntryApi } from "@molis-ai/molis-work-plugin-goals";

/** Wire adaptation after host authorization; application owners still decide business validity. */
export function createMcpGoalToolHandlers(
  goals: GoalsEntryApi | AsyncGoalsEntryApi,
  _audience: "runtime" | "management",
) {
  type Commands = typeof goals.commands;
  type Planning = typeof goals.planning;
  return {
    molis_work_v1_project_guidance_add: async (input: Record<string, unknown>) => goals.commands.addProjectGuidance({
      board_id: String(input.board_id), actor_id: String(input.actor_id),
      kind: String(input.kind) as Parameters<Commands["addProjectGuidance"]>[0]["kind"],
      content: String(input.content), source_refs: (input.source_refs as string[]) ?? [],
      reason: String(input.reason), confirmation_summary: String(input.confirmation_summary),
      user_confirmed: input.user_confirmed === true, idempotency_key: String(input.idempotency_key),
    }),
    molis_work_v1_project_guidance_update: async (input: Record<string, unknown>) => goals.commands.updateProjectGuidance({
      board_id: String(input.board_id), guidance_id: String(input.guidance_id), actor_id: String(input.actor_id),
      action: String(input.action) as Parameters<Commands["updateProjectGuidance"]>[0]["action"],
      kind: input.kind == null ? undefined : String(input.kind) as Parameters<Commands["updateProjectGuidance"]>[0]["kind"],
      content: input.content == null ? undefined : String(input.content),
      source_refs: input.source_refs == null ? undefined : input.source_refs as string[],
      reason: String(input.reason), confirmation_summary: String(input.confirmation_summary),
      user_confirmed: input.user_confirmed === true, idempotency_key: String(input.idempotency_key),
    }),
    molis_work_v1_planning_method_save: async (input: Record<string, unknown>) => goals.planning.saveProjectMethod({
      board_id: String(input.board_id), method: input.method as Parameters<Planning["saveProjectMethod"]>[0]["method"],
      actor_id: String(input.actor_id), user_confirmed: input.user_confirmed === true,
    }),
    molis_work_v1_planning_analyze_change: async (input: Record<string, unknown>) => goals.planning.analyzeChange(
      String(input.board_id), (input.changed_goal_ids as string[]) ?? [],
    ),
    molis_work_v1_planning_graph_check: async (input: Record<string, unknown>) => goals.planning.validateBoardGraph(String(input.board_id)),
  };
}

import type { RecordGoalUserDecisionInput } from "@molis-ai/molis-work-contracts/modules/goals";
import { createGoalEventEntryClient, hostEventDecisionAuthority, goalsActions } from "@molis-ai/molis-work-plugin-goals";
import type { LocalHostProjectClient } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { McpPresentationErrorFactory } from "./query-presentation.js";

const allowed = new Set(["database_path", "board_id", "actor_id", "actor_kind",
  ...Object.keys(goalsActions.decide.action.input_schema.properties as Record<string, unknown>)]);

export function createMcpGoalEventHandlers(
  client: LocalHostProjectClient,
  audience: "runtime" | "management",
  createError: McpPresentationErrorFactory,
) {
  const events = createGoalEventEntryClient(client);
  const rejectUnknown = (input: Record<string, unknown>) => {
    const unexpected = Object.keys(input).filter((key) => !allowed.has(key));
    if (unexpected.length) {
      throw createError(
        "mcp.unexpected_field",
        `不能使用未许可字段：${unexpected.join("、")}`,
        { fields: unexpected },
      );
    }
  };
  const actor = (input: Record<string, unknown>) => {
    const actorId = String(input.actor_id ?? "").trim();
    if (!actorId) {
      throw createError(
        audience === "runtime" ? "mcp.runtime_identity_missing" : "mcp.actor_required",
        audience === "runtime"
          ? "宿主没有提供可信 Runtime 身份。请重新连接 Molis Work MCP，不要在参数里填用户身份。"
          : "管理入口需要 actor_id",
      );
    }
    return {
      actor_id: actorId,
      actor_kind: audience === "runtime" ? "runtime" as const : "user" as const,
    };
  };

  return {
    molis_work_v1_event_decide: async (input: Record<string, unknown>) => {
      rejectUnknown(input);
      if (audience !== "management") {
        throw createError(
          "mcp.authority_denied",
          "用户决定只能由受保护的管理入口或 Web 记录。Runtime 可以请求或引用已保存决定，不能自行批准。",
        );
      }
      const actorFields = actor(input);
      const payload: RecordGoalUserDecisionInput = {
        board_id: String(input.board_id),
        goal_id: String(input.goal_id),
        idempotency_key: String(input.idempotency_key ?? ""),
        authority: hostEventDecisionAuthority(
          "management",
          String(input.board_id),
          actorFields.actor_id,
          String(input.idempotency_key ?? ""),
        ),
        request_id: input.request_id == null ? undefined : String(input.request_id),
        selected_option_id: input.selected_option_id == null ? undefined : String(input.selected_option_id),
        conclusion: String(input.conclusion ?? ""),
        accepts_requirements: input.accepts_requirements === true ? true : input.accepts_requirements === false ? false : undefined,
        effects: input.effects as RecordGoalUserDecisionInput["effects"],
        authorized_change: input.authorized_change as RecordGoalUserDecisionInput["authorized_change"],
        scope: input.scope as RecordGoalUserDecisionInput["scope"],
      };
      return events.recordTrustedDecision(payload);
    },
  };
}

import type { RecordGoalUserDecisionInput } from "@molis-ai/molis-work-contracts/modules/goals";
import { createGoalEventEntryClient, hostEventDecisionAuthority, goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectClient } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { McpPresentationErrorFactory } from "./goal-presentation.js";

// No identity fields: the management entry decides as the person on this machine (repository-anti-corruption §9.5 #6).
const allowed = new Set(["database_path", "project_id",
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
  return {
    molis_work_v1_event_decide: async (input: Record<string, unknown>) => {
      rejectUnknown(input);
      if (audience !== "management") {
        throw createError(
          "mcp.authority_denied",
          "用户决定只能由受保护的管理入口或 Web 记录。Runtime 可以请求或引用已保存决定，不能自行批准。",
        );
      }
      const payload: RecordGoalUserDecisionInput = {
        project_id: String(input.project_id),
        goal_id: String(input.goal_id),
        idempotency_key: String(input.idempotency_key ?? ""),
        authority: hostEventDecisionAuthority(
          "management",
          String(input.project_id),
          LOCAL_PERSON_ACTOR_ID,
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

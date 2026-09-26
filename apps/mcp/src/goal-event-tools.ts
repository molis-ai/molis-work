import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import type { McpToolDefinition } from "./protocol.js";
import { V1_COMMON } from "./tool-schemas.js";

const business = goalsActions.decide.action.input_schema;

/** Protected management transport only; business fields come from the shared action. */
export const EVENT_TOOLS: McpToolDefinition[] = [{
  name: "molis_work_v1_event_decide",
  description: goalsActions.decide.action.description,
  inputSchema: { ...business,
    properties: { ...V1_COMMON, ...business.properties as Record<string, unknown>,
      actor_id: { type: "string", description: "受保护管理入口的操作者；Runtime 不能使用此入口。" } },
    required: ["board_id", "actor_id", ...business.required as string[]],
  },
}];

import { goalEntryActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";
import type { McpToolDefinition } from "./protocol.js";
import { V1_COMMON } from "./tool-schemas.js";

const business = goalEntryActions.decide.action.input_schema;

/** Protected management transport only; business fields come from the shared action. */
export const EVENT_TOOLS: McpToolDefinition[] = [{
  name: "molis_work_v1_event_decide",
  description: goalEntryActions.decide.action.description,
  inputSchema: { ...business,
    properties: { ...V1_COMMON, ...business.properties as Record<string, unknown> },
    required: ["project_id", ...business.required as string[]],
  },
}];

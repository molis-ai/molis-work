import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import type { McpToolDefinition } from "./protocol.js";
import {
  V1_COMMON,
  V1_STRING,
} from "./tool-schemas.js";

export const V1_TOOLS: McpToolDefinition[] = [
  {
    name: "molis_work_v1_initialize",
    description: goalsActions.initialize.action.description,
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        ...goalsActions.initialize.action.input_schema.properties as Record<string, unknown>,
      },
      required: ["project_id", "title", "idempotency_key"],
    },
  },
  {
    name: "molis_work_v1_goal_tree_decide",
    description: goalsActions.treeDecide.action.description,
    inputSchema: {
      type: "object",
      properties: {
        ...goalsActions.treeDecide.action.input_schema.properties as Record<string, unknown>,
        ...V1_COMMON,
        // Who decides is the person on this machine; the caller only points at where the decision came from.
        authority: {
          type: "object",
          properties: {
            conversation_ref: V1_STRING,
            message_ref: V1_STRING,
            whole_confirmation_prompted: { type: "boolean" },
            prompted_proposal_id: V1_STRING,
          },
          additionalProperties: false,
        },
      },
      required: ["project_id", "proposal_id", "idempotency_key"],
    },
  },
];

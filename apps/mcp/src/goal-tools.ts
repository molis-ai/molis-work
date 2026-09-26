import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import type { McpToolDefinition } from "./protocol.js";
import {
  V1_COMMON,
  V1_STRING,
  v1PayloadTool,
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
        actor_id: { type: "string" },
      },
      required: ["board_id", "title", "actor_id", "idempotency_key"],
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
        runtime_actor_id: V1_STRING,
        authority: {
          type: "object",
          properties: {
            actor_id: V1_STRING,
            actor_kind: { type: "string", enum: ["user"] },
            authority_source: { type: "string", enum: ["web", "management"] },
            conversation_ref: V1_STRING,
            message_ref: V1_STRING,
            whole_confirmation_prompted: { type: "boolean" },
            prompted_proposal_id: V1_STRING,
          },
          required: ["actor_id", "actor_kind", "authority_source", "conversation_ref", "message_ref"],
        },
      },
      required: ["board_id", "proposal_id", "authority", "idempotency_key"],
    },
  },
  v1PayloadTool(
    "molis_work_v1_import_v3",
    goalsActions.importV3.action.description,
    { ...goalsActions.importV3.action.input_schema.properties as Record<string, unknown>, actor_id: V1_STRING },
    ["legacy", "actor_id", "idempotency_key"],
  ),
];

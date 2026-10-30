import type { ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { McpToolDefinition } from "./protocol.js";
import { V1_COMMON, V1_STRING } from "./tool-schemas.js";
import type { MANAGEMENT_GOAL_ACTIONS } from "./tool-dispatch.js";

/** What a management tool takes from the action's definition: its own description and the schema of its business input. */
export interface McpManagementActionText {
  readonly description: string;
  readonly input_schema: ActionSchema;
}

/**
 * Where the Host reads that text for one of the three actions: the Goals definitions it ships with (the same ones registered in the
 * action directory, the provider pinned as in BL-501), matched by id and version. It needs no open Home.
 */
export type McpManagementActionSource = (name: keyof typeof MANAGEMENT_GOAL_ACTIONS) => McpManagementActionText;

/**
 * The three management tools. Their wire (the project, the database, who a decision came from) is the transport's; the description and the
 * business fields are the action's, read by the Host from the Goals definition it ships, never written here a second time.
 */
export function managementGoalTools(read: McpManagementActionSource): McpToolDefinition[] {
  const initialize = read("initialize"), treeDecide = read("treeDecide"), decide = read("decide");
  return [
    {
      name: "molis_work_v1_initialize",
      description: initialize.description,
      inputSchema: {
        type: "object",
        properties: {
          ...V1_COMMON,
          ...initialize.input_schema.properties as Record<string, unknown>,
        },
        required: ["project_id", "idempotency_key"],
      },
    },
    {
      name: "molis_work_v1_goal_tree_decide",
      description: treeDecide.description,
      inputSchema: {
        type: "object",
        properties: {
          ...treeDecide.input_schema.properties as Record<string, unknown>,
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
    {
      name: "molis_work_v1_event_decide",
      description: decide.description,
      inputSchema: { ...decide.input_schema,
        properties: { ...V1_COMMON, ...decide.input_schema.properties as Record<string, unknown> },
        required: ["project_id", ...decide.input_schema.required as string[]],
      },
    },
  ];
}

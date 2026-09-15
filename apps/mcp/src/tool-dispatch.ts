import { importV3Capability, trashedGoalsCapability, initializeBoardCapability, snapshotBoardCapability, createGoalsEntryClient, createGoalEntryCompositionClient, createGoalProposalClients, readProjectGuidanceCapability, setActiveGoalCapability } from "@molis-ai/molis-work-plugin-goals";
import { createMcpGoalEventHandlers } from "./goal-event-commands.js";
import type { LocalHostProjectClient, RuntimeGoalTreeConfirmation } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { GoalTreeProposalDecisionAuthority } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { LegacyV3ImportInput } from "@molis-ai/molis-work-plugin-goals";
import { createMcpGoalToolHandlers } from "./goal-commands.js";
import { createMcpGoalTrashHandlers } from "./goal-trash-commands.js";
import { createMcpGoalTreeHandlers } from "./goal-tree-commands.js";
import { planningMethodResponse, type McpPresentationErrorFactory } from "./query-presentation.js";
import { mcpBoardPayload } from "./payload.js";
import { canonicalMcpToolName } from "./tool-catalog.js";

export interface McpToolDispatchPorts {
  audience: "runtime" | "management";
  webBaseUrl: () => string;
  projectId: string | null | undefined;
  createError: McpPresentationErrorFactory;
  decisionAuthority: (confirmation: RuntimeGoalTreeConfirmation) => GoalTreeProposalDecisionAuthority;
}

/** Tool wire adaptation over an already scoped, authorized Host Client. */
export async function dispatchMcpProjectTool(
  client: LocalHostProjectClient,
  name: string,
  arguments_: Record<string, unknown>,
  ports: McpToolDispatchPorts,
): Promise<string> {
  name = canonicalMcpToolName(name);
  return client.withScope(async () => {
    const { goalTree } = createGoalProposalClients(client);
    const goalsAdapter = createGoalsEntryClient(client);
    const availability = createGoalEntryCompositionClient(client);
    const goalTools = createMcpGoalToolHandlers(goalsAdapter, ports.audience);
    const eventTools = createMcpGoalEventHandlers(client, ports.audience, ports.createError, {
      webBaseUrl: ports.webBaseUrl(),
      projectId: ports.projectId,
    });
    const trashTools = createMcpGoalTrashHandlers(availability, ports.createError);
    const goalTreeTools = createMcpGoalTreeHandlers(goalTree);
    let result: unknown;
    const prettyPrint = true;
    switch (name) {
      case "molis_work_v1_initialize":
        result = await client.invoke(initializeBoardCapability, {
          board_id: String(arguments_.board_id),
          title: String(arguments_.title),
          actor_id: String(arguments_.actor_id),
          idempotency_key: String(arguments_.idempotency_key),
        });
        break;
      case "molis_work_v1_snapshot":
        result = await client.invoke(snapshotBoardCapability, { board_id: String(arguments_.board_id) });
        break;
      case "molis_work_v1_project_guidance_get":
        result = await client.invoke(readProjectGuidanceCapability, { board_id: String(arguments_.board_id) });
        break;
      case "molis_work_v1_project_guidance_add":
      case "molis_work_v1_project_guidance_update":
      case "molis_work_v1_planning_method_save":
      case "molis_work_v1_planning_analyze_change":
      case "molis_work_v1_planning_graph_check":
        result = await goalTools[name](arguments_);
        break;
      case "molis_work_v1_planning_methods": {
        const planning = await availability.readPlanningComposition(String(arguments_.board_id));
        result = planningMethodResponse(planning.methods, planning.composition, arguments_, ports.createError);
        break;
      }
      case "molis_work_v1_goal_intent_create":
      case "molis_work_v1_goal_list":
      case "molis_work_v1_goal_state":
      case "molis_work_v1_event_configure":
      case "molis_work_v1_event_note":
      case "molis_work_v1_event_report":
      case "molis_work_v1_event_list":
      case "molis_work_v1_event_read":
      case "molis_work_v1_event_progress":
      case "molis_work_v1_event_concern":
      case "molis_work_v1_event_decision_request":
      case "molis_work_v1_event_cite_decision":
      case "molis_work_v1_event_agree":
      case "molis_work_v1_event_close":
      case "molis_work_v1_event_resume":
      case "molis_work_v1_event_decide":
        result = await eventTools[name](arguments_);
        break;
      case "molis_work_v1_goal_tree_propose":
      case "molis_work_v1_goal_tree_read":
      case "molis_work_v1_goal_tree_check":
        result = await goalTreeTools[name](arguments_);
        break;
      case "molis_work_v1_goal_tree_decide": {
        if (ports.audience === "runtime") {
          throw ports.createError(
            "goal_tree_proposal.runtime_decide_unsupported",
            "Runtime 不能写入 Goal Tree 决定。请让用户在 Web 或管理入口批准已保存的提案。",
          );
        }
        result = await goalTreeTools.molis_work_v1_goal_tree_decide(arguments_);
        break;
      }
      case "molis_work_v1_active_goal": {
        const payload = mcpBoardPayload<{
          board_id: string;
          goal_id: string;
          reason: string;
          actor_id: string;
          idempotency_key: string;
        }>(arguments_);
        result = await client.invoke(setActiveGoalCapability, {
          board_id: payload.board_id, goal: payload, write: payload,
        });
        break;
      }
      case "molis_work_v1_goal_trash":
      case "molis_work_v1_goal_restore":
        result = await trashTools[name](arguments_);
        break;
      case "molis_work_v1_goal_trash_list": {
        const boardId = String(arguments_.board_id);
        result = await client.invoke(trashedGoalsCapability, { board_id: boardId });
        break;
      }
      case "molis_work_v1_import_v3": {
        const payload = arguments_.payload as {
          legacy: LegacyV3ImportInput;
          actor_id: string;
          idempotency_key: string;
        };
        result = await client.invoke(importV3Capability, {
          legacy: payload.legacy,
          target_board_id: String(arguments_.board_id),
          actor_id: payload.actor_id,
          idempotency_key: payload.idempotency_key,
        });
        break;
      }
      default:
        throw ports.createError("mcp.tool_unknown", `未知 V1 tool: ${name}`);
    }
    return JSON.stringify(result, null, prettyPrint ? 2 : undefined);
  });
}

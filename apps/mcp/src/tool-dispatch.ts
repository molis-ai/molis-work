import { initializeBoardCapability, goalTreeCapabilities, type GoalTreeDecideEntryInput } from "@molis-ai/molis-work-plugin-goals";
import { createMcpGoalEventHandlers } from "./goal-event-commands.js";
import type { LocalHostProjectClient } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { McpPresentationErrorFactory } from "./goal-presentation.js";

export interface McpToolDispatchPorts {
  audience: "runtime" | "management";
  webBaseUrl: () => string;
  projectId: string | null | undefined;
  createError: McpPresentationErrorFactory;
}

/** Tool wire adaptation over an already scoped, authorized Host Client. */
export async function dispatchMcpProjectTool(
  client: LocalHostProjectClient,
  name: string,
  arguments_: Record<string, unknown>,
  ports: McpToolDispatchPorts,
): Promise<string> {
  return client.withScope(async () => {
    const eventTools = createMcpGoalEventHandlers(client, ports.audience, ports.createError);
    let result: unknown;
    const prettyPrint = true;
    switch (name) {
      case "molis_work_v1_initialize":
        result = await client.invoke(initializeBoardCapability, {
          project_id: String(arguments_.project_id),
          title: String(arguments_.title),
          idempotency_key: String(arguments_.idempotency_key),
        });
        break;
      case "molis_work_v1_event_decide":
        result = await eventTools[name](arguments_);
        break;
      case "molis_work_v1_goal_tree_decide": {
        if (ports.audience === "runtime") {
          throw ports.createError(
            "goal_tree_proposal.runtime_decide_unsupported",
            "Runtime 不能写入 Goal Tree 决定。请让用户在 Web 或管理入口批准已保存的提案。",
          );
        }
        // The decision is the person's: the Host builds who decides from the conversation the call points at and refuses an identity.
        const { database_path: _database, web_base_url: _url, ...input } = arguments_;
        result = await client.invoke(goalTreeCapabilities.decideGoalTreeProposal, [input as unknown as GoalTreeDecideEntryInput]);
        break;
      }
      default:
        throw ports.createError("mcp.tool_unknown", `未知 V1 tool: ${name}`);
    }
    return JSON.stringify(result, null, prettyPrint ? 2 : undefined);
  });
}

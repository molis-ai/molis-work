import { initializeBoardCapability, goalTreeCapabilities, managementTreeAuthority } from "@molis-ai/molis-work-plugin-goals";
import { createMcpGoalEventHandlers } from "./goal-event-commands.js";
import type { LocalHostProjectClient } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { GoalTreeProposalDecideInput } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { McpPresentationErrorFactory } from "./query-presentation.js";
import { canonicalMcpToolName } from "./tool-catalog.js";

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
  name = canonicalMcpToolName(name);
  return client.withScope(async () => {
    const eventTools = createMcpGoalEventHandlers(client, ports.audience, ports.createError);
    let result: unknown;
    const prettyPrint = true;
    switch (name) {
      case "molis_work_v1_initialize":
        result = await client.invoke(initializeBoardCapability, {
          board_id: String(arguments_.board_id),
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
        const { database_path: _database, web_base_url: _url, authority, ...input } = arguments_;
        const decision = { ...input, authority: managementTreeAuthority(String(input.board_id), String(input.idempotency_key), authority) };
        result = await client.invoke(goalTreeCapabilities.decideGoalTreeProposal, [decision as unknown as GoalTreeProposalDecideInput]);
        break;
      }
      default:
        throw ports.createError("mcp.tool_unknown", `未知 V1 tool: ${name}`);
    }
    return JSON.stringify(result, null, prettyPrint ? 2 : undefined);
  });
}

import { initializeBoardCapability, snapshotBoardCapability, createGoalProposalClients, setActiveGoalCapability } from "@molis-ai/molis-work-plugin-goals";
import type { LocalHostProjectClient } from "@molis-ai/molis-work-contracts/platform/app-host";
import { createCliGoalTreeHandlers } from "./goal-tree-commands.js";
import { printCliJson as print } from "./protocol.js";

/** CLI wire conversion over the Host's already selected project. */
export async function dispatchCliProjectCommand(
  client: LocalHostProjectClient, args: string[], input: Record<string, unknown>,
): Promise<number> {
  const operation = args[0];
  return client.withScope(async () => {
    const { goalTree } = createGoalProposalClients(client);
    const goalTreeCommands = createCliGoalTreeHandlers(goalTree);
    switch (operation) {
    case "init":
      print(
        await client.invoke(initializeBoardCapability, {
          board_id: String(input.board_id),
          title: String(input.title),
          idempotency_key: String(input.idempotency_key),
        }),
      );
      break;
    case "goal-tree-propose":
      print(await goalTreeCommands[operation](input));
      break;
    case "goal-tree-read":
      print(await goalTreeCommands[operation](input));
      break;
    case "goal-tree-check":
      print(await goalTreeCommands[operation](input));
      break;
    case "goal-tree-decide":
      print(await goalTreeCommands[operation](input));
      break;
    case "active-goal":
      print(
        await client.invoke(setActiveGoalCapability, {
          board_id: String(input.board_id),
          goal: { goal_id: String(input.goal_id), reason: String(input.reason) },
          write: { actor_id: String(input.actor_id), idempotency_key: String(input.idempotency_key) },
        }),
      );
      break;
    case "snapshot":
      print(await client.invoke(snapshotBoardCapability, { board_id: String(input.board_id) }));
      break;
    default:
      throw new Error(`未知 V1 operation: ${operation}`);
    }
    return 0;
  });
}

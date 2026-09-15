import { importV3Capability, initializeBoardCapability, snapshotBoardCapability, createGoalProposalClients, setActiveGoalCapability } from "@molis-ai/molis-work-plugin-goals";
import type { LocalHostProjectClient } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { LegacyV3ImportInput } from "@molis-ai/molis-work-plugin-goals";
import { createCliGoalTreeHandlers } from "./goal-tree-commands.js";
import { cliFlagValue as value, printCliJson as print } from "./protocol.js";

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
          actor_id: String(input.actor_id),
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
    case "import-v3":
      print(
        await client.invoke(importV3Capability, {
          legacy: input as unknown as LegacyV3ImportInput,
          target_board_id: String(value(args, "--board-id")),
          actor_id: String(value(args, "--actor")),
          idempotency_key: String(value(args, "--key")),
        }),
      );
      break;
    default:
      throw new Error(`未知 V1 operation: ${operation}`);
    }
    return 0;
  });
}

import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalEntryActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";
import { printCliJson as print } from "./protocol.js";

/**
 * What a command may do, handed over by the Host: Goals' actions as the person on this machine, for the one project the command is
 * bound to. The CLI names no one and no entry; `evidence` is only where a decision came from (the payload's `authority`).
 */
export interface CliManagementActions {
  readonly project_id: string;
  invoke<Output>(definition: ActionDefinition<unknown, Output>, input: Record<string, unknown>, evidence?: unknown): Promise<Output>;
}

/** CLI wire conversion: a command's JSON payload becomes the input of one Goals action, which keeps validation and transaction ownership. */
export async function dispatchCliProjectCommand(
  actions: CliManagementActions, args: string[], input: Record<string, unknown>,
): Promise<number> {
  const operation = args[0];
  const { project_id, ...payload } = input;
  // The payload must carry the project this command is bound to: it names the project, the action takes it from the call.
  const bound = (project: unknown) => {
    if (project !== actions.project_id) throw new ActionError("actions.scope_mismatch", "目标请求不属于当前项目");
  };
  switch (operation) {
  case "init":
    bound(String(project_id));
    print(await actions.invoke(goalEntryActions.initialize, { idempotency_key: String(input.idempotency_key) }));
    break;
  case "goal-tree-propose":
    bound(project_id);
    print(await actions.invoke(goalEntryActions.treeSubmit, payload));
    break;
  case "goal-tree-read":
    bound(project_id);
    print(await actions.invoke(goalEntryActions.treeRead, payload));
    break;
  case "goal-tree-check":
    bound(project_id);
    print(await actions.invoke(goalEntryActions.treeCheck, payload));
    break;
  case "goal-tree-decide": {
    // The decision is the person's: `authority` only points at the conversation it came from, and the Host builds who decides.
    const { authority, ...decision } = payload;
    bound(project_id);
    print(await actions.invoke(goalEntryActions.treeDecide, decision, authority));
    break;
  }
  case "active-goal":
    bound(String(project_id));
    print(await actions.invoke(goalEntryActions.active, {
      goal_id: String(input.goal_id), reason: String(input.reason), idempotency_key: String(input.idempotency_key),
    }));
    break;
  case "snapshot":
    bound(String(project_id));
    print(await actions.invoke(goalEntryActions.snapshot, {}));
    break;
  default:
    throw new Error(`未知 V1 operation: ${operation}`);
  }
  return 0;
}

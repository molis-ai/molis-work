import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { printCliJson as print } from "./protocol.js";

/** The Goals actions a command calls, by the id and version the action directory lists them under; the Host finds each one. */
const GOALS = {
  initialize: { capability_id: "goals.board.initialize", version: 2 },
  treeSubmit: { capability_id: "goals.tree.submit", version: 1 },
  treeRead: { capability_id: "goals.tree.read", version: 1 },
  treeCheck: { capability_id: "goals.tree.check", version: 2 },
  treeDecide: { capability_id: "goals.tree.decide", version: 2 },
  active: { capability_id: "goals.active.set", version: 1 },
  snapshot: { capability_id: "goals.snapshot.read", version: 2 },
} as const;

/**
 * What a command may do, handed over by the Host: Goals' actions as the person on this machine, for the one project the command is
 * bound to. The CLI names no one and no entry; `evidence` is only where a decision came from (the payload's `authority`).
 */
export interface CliManagementActions {
  readonly project_id: string;
  invoke<Output = unknown>(reference: { readonly capability_id: string; readonly version: number }, input: Record<string, unknown>, evidence?: unknown): Promise<Output>;
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
    print(await actions.invoke(GOALS.initialize, { idempotency_key: String(input.idempotency_key) }));
    break;
  case "goal-tree-propose":
    bound(project_id);
    print(await actions.invoke(GOALS.treeSubmit, payload));
    break;
  case "goal-tree-read":
    bound(project_id);
    print(await actions.invoke(GOALS.treeRead, payload));
    break;
  case "goal-tree-check":
    bound(project_id);
    print(await actions.invoke(GOALS.treeCheck, payload));
    break;
  case "goal-tree-decide": {
    // The decision is the person's: `authority` only points at the conversation it came from, and the Host builds who decides.
    const { authority, ...decision } = payload;
    bound(project_id);
    print(await actions.invoke(GOALS.treeDecide, decision, authority));
    break;
  }
  case "active-goal":
    bound(String(project_id));
    print(await actions.invoke(GOALS.active, {
      goal_id: String(input.goal_id), reason: String(input.reason), idempotency_key: String(input.idempotency_key),
    }));
    break;
  case "snapshot":
    bound(String(project_id));
    print(await actions.invoke(GOALS.snapshot, {}));
    break;
  default:
    throw new Error(`未知 V1 operation: ${operation}`);
  }
  return 0;
}

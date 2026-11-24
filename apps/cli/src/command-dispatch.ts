import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { trustedReviewActions } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { printCliJson as print, cliText } from "./protocol.js";

/**
 * What a command may do, handed over by the Host: the platform's protected review operations as the person on this machine, for the one
 * project the command is bound to. They take the original reference and obtain provenance from the Host. The CLI names no plugin and
 * none of a plugin's actions (PEQ-15; the Goals commands were removed in batch 44).
 */
export interface CliManagementActions {
  readonly project_id: string;
  invoke<Output = unknown>(reference: { readonly capability_id: string; readonly version: number }, input: Record<string, unknown>, evidence?: unknown): Promise<Output>;
}

/** CLI wire conversion: a command's JSON payload becomes the input of one platform action, which keeps validation and transaction ownership. */
export async function dispatchCliProjectCommand(
  actions: CliManagementActions, args: string[], input: Record<string, unknown>,
): Promise<number> {
  const operation = args[0];
  const { project_id, ...payload } = input;
  // The payload must carry the project this command is bound to: it names the project, the action takes it from the call.
  const bound = (project: unknown) => {
    if (project !== actions.project_id) throw new ActionError("actions.scope_mismatch", cliText("workbench.cli.v1-scope-mismatch"));
  };
  switch (operation) {
  case "review-request":
    bound(project_id);
    print(await actions.invoke(trustedReviewActions.read, payload));
    break;
  case "review-decide":
    bound(project_id);
    print(await actions.invoke(trustedReviewActions.decide, payload));
    break;
  default:
    throw new Error(cliText("workbench.cli.v1-unknown-op", { operation: String(operation ?? "") }));
  }
  return 0;
}

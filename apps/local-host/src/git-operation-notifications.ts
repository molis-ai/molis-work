import type { AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import type { GitOperationUpdate } from "@molis-ai/molis-work-plugin-git";

/** Reads trusted review ownership, never a project or operation supplied by browser input. */
export function observeGitOperations(queue: AgentReviewQueue, projectId: string, listener: (event: GitOperationUpdate) => void): () => void {
  return queue.observeSettlement((request, receipt) => {
    const operation = request.operation;
    if (request.project_id !== projectId || !operation || operation.kind === "checkpoint-rewind") return;
    listener({ workspace_id: operation.workspace_id, operation_id: operation.operation_id,
      outcome: receipt.effect_uncertain ? "unknown" : receipt.effect_settled ? "succeeded" : "failed" });
  });
}

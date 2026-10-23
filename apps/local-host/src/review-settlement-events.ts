import type { AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import { HOST_REVIEW_SETTLED_EVENT, HOST_WORKSPACE_CHANGED_EVENT, type HostReviewSettledPayload, type HostWorkspaceChangedPayload } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { HostEventRecipient, PluginHostEvents } from "@molis-ai/molis-work-plugin-runtime";

/** A person-reviewed plugin operation that ran, and the installation that asked for it while that activation still runs. */
export interface ReviewSettlement {
  /** Null when the activation that asked has since stopped: the operation ran all the same. */
  recipient: HostEventRecipient | null;
  payload: HostReviewSettledPayload;
}

export type ObserveReviewSettlements = (listener: (settlement: ReviewSettlement) => void) => () => void;

/**
 * Settled plugin operations of one project asked for in this process (X-6): each may have written to a workspace, whoever asked.
 * The recipient is the review's trusted authority, recorded when the installation asked for it, never a plugin or project read
 * from request input. It is null once the asking activation has stopped, been disabled, upgraded or reinstalled (its `holds()` is
 * false): a reinstall keeps the `install_id`, so the id alone cannot tell the new installation from the one that asked. A review
 * restored from history has no authority and sends nothing: it ran in an earlier process, before anything running now started.
 */
export function observeReviewSettlements(queue: AgentReviewQueue, projectId: string, listener: (settlement: ReviewSettlement) => void): () => void {
  return queue.observeSettlement((request, receipt, origin) => {
    const operation = request.operation;
    if (!origin || request.project_id !== projectId || !operation || operation.kind === "checkpoint-rewind") return;
    listener({ recipient: origin.holds() ? { plugin_id: origin.plugin_id, install_id: origin.install_id } : null, payload: { review_id: request.review_id, kind: operation.kind, operation_id: operation.operation_id,
      workspace_id: operation.workspace_id, outcome: receipt.effect_uncertain ? "unknown" : receipt.effect_settled ? "succeeded" : "failed" } });
  });
}

/**
 * One subscription to whichever settlement port the latest entry point brought. Each settlement goes as `host.review.settled@1`
 * to the installation that asked for it, while it still holds, and as `host.workspace.changed@1` to every installation of the
 * project that subscribes and holds `workspace:read`, whatever the outcome: a failed or unknown operation may have written part
 * of its change. Host-event delivery decides who can take each one now (S-54).
 */
export function reviewSettlementForwarder(hostEvents: Pick<PluginHostEvents, "notify" | "broadcast">) {
  let current: ObserveReviewSettlements | undefined, unsubscribe: (() => void) | undefined;
  return {
    update(next: ObserveReviewSettlements | undefined): void {
      if (next === current) return;
      unsubscribe?.(); current = next;
      unsubscribe = next?.(({ recipient, payload }) => {
        if (recipient) hostEvents.notify(recipient, { event_type_id: HOST_REVIEW_SETTLED_EVENT, type_version: 1, payload, correlation_id: payload.review_id });
        const changed: HostWorkspaceChangedPayload = { workspace_id: payload.workspace_id, cause: "plugin-operation" };
        hostEvents.broadcast({ event_type_id: HOST_WORKSPACE_CHANGED_EVENT, type_version: 1, payload: changed });
      });
    },
    stop(): void {
      unsubscribe?.(); unsubscribe = undefined; current = undefined;
    },
  };
}

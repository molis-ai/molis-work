import type { AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import { HOST_REVIEW_SETTLED_EVENT, type HostReviewSettledPayload } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { HostEventRecipient, PluginHostEvents } from "@molis-ai/molis-work-plugin-runtime";

/** A person-reviewed plugin operation that ran, and the installation that asked for it. */
export interface ReviewSettlement {
  recipient: HostEventRecipient;
  payload: HostReviewSettledPayload;
}

export type ObserveReviewSettlements = (listener: (settlement: ReviewSettlement) => void) => () => void;

/**
 * Settled plugin operations of one project (X-6). The recipient is the review's trusted authority, recorded when the
 * installation asked for it, never a plugin or project read from request input. A review without one sends nothing, and
 * neither does one whose asking activation has since stopped, been disabled, upgraded or reinstalled (its `holds()` is false):
 * a reinstall keeps the `install_id`, so the id alone cannot tell the new installation from the one that asked.
 */
export function observeReviewSettlements(queue: AgentReviewQueue, projectId: string, listener: (settlement: ReviewSettlement) => void): () => void {
  return queue.observeSettlement((request, receipt, origin) => {
    const operation = request.operation;
    if (!origin?.holds() || request.project_id !== projectId || !operation || operation.kind === "checkpoint-rewind") return;
    listener({ recipient: { plugin_id: origin.plugin_id, install_id: origin.install_id }, payload: { review_id: request.review_id, kind: operation.kind, operation_id: operation.operation_id,
      workspace_id: operation.workspace_id, outcome: receipt.effect_uncertain ? "unknown" : receipt.effect_settled ? "succeeded" : "failed" } });
  });
}

/**
 * One subscription to whichever settlement port the latest entry point brought, each settlement sent as `host.review.settled@1`
 * to the installation that asked for it. Host-event delivery decides whether that installation can take it now (S-54).
 */
export function reviewSettlementForwarder(hostEvents: Pick<PluginHostEvents, "notify">) {
  let current: ObserveReviewSettlements | undefined, unsubscribe: (() => void) | undefined;
  return {
    update(next: ObserveReviewSettlements | undefined): void {
      if (next === current) return;
      unsubscribe?.(); current = next;
      unsubscribe = next?.(({ recipient, payload }) => {
        hostEvents.notify(recipient, { event_type_id: HOST_REVIEW_SETTLED_EVENT, type_version: 1, payload, correlation_id: payload.review_id });
      });
    },
    stop(): void {
      unsubscribe?.(); unsubscribe = undefined; current = undefined;
    },
  };
}

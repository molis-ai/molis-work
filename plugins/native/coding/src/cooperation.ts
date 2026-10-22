/**
 * Sessions working together, the way FlyLeaf's cooperation protocol splits it: who executes and who writes.
 *
 * - A reference is read-only: a fixed output of another session, frozen into a round like any material.
 * - A delegation asks another session to do something; that session decides whether and how, and nothing runs until
 *   its person sends a round.
 * - A delivery hands a finished, fixed output back; the session that asked decides whether to take it.
 *
 * Received is not delivered, delivered is not accepted, accepted is not done: each step has its own receipt and none
 * is skipped. A reply that arrives after the delegation has ended is recorded and changes nothing. Hops are capped so
 * two sessions cannot hand the same work back and forth. The model is given none of this; it is the people's.
 */

export type DelegationState = "received" | "delivered" | "accepted" | "committing" | "completed" | "rejected" | "cancelled" | "failed";
export const DELEGATION_ENDED: readonly DelegationState[] = ["completed", "rejected", "cancelled", "failed"];
export const MAX_DELEGATION_HOPS = 3;
/** Each state's stable key; the words are in Coding's dictionary, in the language of the page that asked. */
export const DELEGATION_STATE_KEY: Record<DelegationState, string> = {
  received: "coding.delegation-state.received", delivered: "coding.delegation-state.delivered", accepted: "coding.delegation-state.accepted",
  committing: "coding.delegation-state.committing", completed: "coding.delegation-state.completed", rejected: "coding.delegation-state.rejected",
  cancelled: "coding.delegation-state.cancelled", failed: "coding.delegation-state.failed",
};

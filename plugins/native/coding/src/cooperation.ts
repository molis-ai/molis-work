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
export const DELEGATION_STATE_LABEL: Record<DelegationState, string> = {
  received: "已收到，尚未送达", delivered: "已送达，等对方接受", accepted: "对方已接受，尚未开始", committing: "对方执行中",
  completed: "已完成", rejected: "对方拒绝", cancelled: "已取消", failed: "失败",
};

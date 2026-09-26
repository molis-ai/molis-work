import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { PluginPrivateStorage } from "@molis-ai/molis-work-contracts/platform/plugin";

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
const NEXT: Record<DelegationState, readonly DelegationState[]> = {
  received: ["delivered", "cancelled", "failed"],
  delivered: ["accepted", "rejected", "cancelled", "failed"],
  accepted: ["committing", "rejected", "cancelled", "failed"],
  committing: ["completed", "cancelled", "failed"],
  completed: [], rejected: [], cancelled: [], failed: [],
};
export const DELEGATION_STATE_LABEL: Record<DelegationState, string> = {
  received: "已收到，尚未送达", delivered: "已送达，等对方接受", accepted: "对方已接受，尚未开始", committing: "对方执行中",
  completed: "已完成", rejected: "对方拒绝", cancelled: "已取消", failed: "失败",
};

export interface CodingDelivery {
  delivery_id: string;
  kind: "report" | "changeset";
  artifact: ArtifactReference;
  run_id: string;
  title: string;
  note: string;
  state: "sent" | "accepted" | "rejected";
  reason?: string;
  sent_at: string;
  decided_at?: string;
  decided_by?: string;
}

export interface CodingDelegationReceipt {
  event: "submitted" | "delivered" | "accepted" | "started" | "delivery-sent" | "delivery-accepted" | "delivery-rejected" | "completed" | "rejected" | "cancelled" | "failed";
  /** The delegation's state after this event. */
  state: DelegationState;
  at: string;
  actor: string;
  note?: string;
  artifact?: ArtifactReference;
  /** Arrived after the delegation ended: kept as a fact, applied to nothing. */
  recorded_only?: true;
}

export interface CodingDelegation {
  delegation_id: string;
  from_session: string;
  to_session: string | null;
  title: string;
  task: string;
  /** Fixed versions the asking session handed over; the other session reads them, never the asking session's data. */
  materials: ArtifactReference[];
  hops: number;
  state: DelegationState;
  revision: number;
  deliveries: CodingDelivery[];
  receipts: CodingDelegationReceipt[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export class CoordinationConflict extends Error {
  readonly code = "coding.cooperation_conflict";
}

const recordKey = (id: string) => `delegation:${id}`;
const indexKey = (sessionId: string) => `delegations:${sessionId}`;
const incomingKey = (sessionId: string) => `delegation-in:${sessionId}`;

/** Durable delegations in the plugin's own storage. Every change is an atomic replacement of the exact prior record. */
export class CodingCooperationStore {
  constructor(private readonly storage: PluginPrivateStorage) {}

  #replace(key: string, expected: string | null, value: string): void {
    if (!this.storage.compareAndSet) throw new Error("会话协作需要宿主提供原子写入，当前宿主不支持");
    if (!this.storage.compareAndSet(key, expected, value)) throw new CoordinationConflict("协作状态刚刚变化，请刷新后再操作");
  }

  get(id: string): CodingDelegation | null {
    const raw = this.storage.get(recordKey(id));
    return raw === null ? null : JSON.parse(raw) as CodingDelegation;
  }

  /** Delegations this session sent, and the one it was created for, newest first. */
  forSession(sessionId: string): { outgoing: CodingDelegation[]; incoming: CodingDelegation | null } {
    const ids = JSON.parse(this.storage.get(indexKey(sessionId)) ?? "[]") as string[];
    const incomingId = this.storage.get(incomingKey(sessionId));
    const outgoing = ids.map(id => this.get(id)).filter((item): item is CodingDelegation => item !== null && item.from_session === sessionId);
    return { outgoing: outgoing.sort((a, b) => b.created_at.localeCompare(a.created_at)), incoming: incomingId ? this.get(incomingId) : null };
  }

  /** The hop count a new delegation from this session would carry. */
  hopsFrom(sessionId: string): number {
    const incoming = this.forSession(sessionId).incoming;
    return (incoming?.hops ?? 0) + 1;
  }

  create(input: { from_session: string; title: string; task: string; materials: ArtifactReference[]; actor: string; at: string }): CodingDelegation {
    const hops = this.hopsFrom(input.from_session);
    if (hops > MAX_DELEGATION_HOPS) throw new Error(`委派最多转交 ${MAX_DELEGATION_HOPS} 层；这个会话本身已是第 ${hops - 1} 层委派`);
    const delegation: CodingDelegation = {
      delegation_id: crypto.randomUUID(), from_session: input.from_session, to_session: null, title: input.title, task: input.task,
      materials: input.materials, hops, state: "received", revision: 1, deliveries: [],
      receipts: [{ event: "submitted", state: "received", at: input.at, actor: input.actor }],
      created_by: input.actor, created_at: input.at, updated_at: input.at,
    };
    this.#replace(recordKey(delegation.delegation_id), null, JSON.stringify(delegation));
    this.#index(input.from_session, delegation.delegation_id);
    return delegation;
  }

  #index(sessionId: string, id: string): void {
    for (let attempt = 0; attempt < 5; attempt++) {
      const raw = this.storage.get(indexKey(sessionId)), ids = JSON.parse(raw ?? "[]") as string[];
      if (ids.includes(id)) return;
      try { this.#replace(indexKey(sessionId), raw, JSON.stringify([...ids, id])); return; }
      catch (error) { if (!(error instanceof CoordinationConflict)) throw error; }
    }
    throw new CoordinationConflict("会话协作目录正忙，请稍后重试");
  }

  /** The session created for a delegation answers to it; recorded once, before the delegation says delivered. */
  bindTarget(id: string, sessionId: string): void {
    this.#replace(incomingKey(sessionId), null, id);
  }

  /**
   * Apply one event. A move the state machine does not allow is refused; an event after the delegation ended is kept
   * as a recorded-only receipt, so a late answer is visible without rewriting what already happened.
   */
  apply(id: string, expectedRevision: number | undefined, event: CodingDelegationReceipt["event"], to: DelegationState | null,
    actor: string, at: string, change: (delegation: CodingDelegation) => void = () => {}, note?: string, artifact?: ArtifactReference): CodingDelegation {
    const raw = this.storage.get(recordKey(id));
    if (raw === null) throw new Error("找不到这个委派");
    const delegation = JSON.parse(raw) as CodingDelegation;
    if (expectedRevision !== undefined && delegation.revision !== expectedRevision) throw new CoordinationConflict("协作状态刚刚变化，请刷新后再操作");
    if (DELEGATION_ENDED.includes(delegation.state)) {
      delegation.receipts.push({ event, state: delegation.state, at, actor, ...(note ? { note } : {}), ...(artifact ? { artifact } : {}), recorded_only: true });
      delegation.revision++; delegation.updated_at = at;
      this.#replace(recordKey(id), raw, JSON.stringify(delegation));
      throw Object.assign(new Error(`这个委派已经${DELEGATION_STATE_LABEL[delegation.state]}；这次操作只记录，不改变结果`), { code: "coding.cooperation_ended" });
    }
    if (to !== null && to !== delegation.state && !NEXT[delegation.state].includes(to)) throw new Error(`不能从「${DELEGATION_STATE_LABEL[delegation.state]}」直接变成「${DELEGATION_STATE_LABEL[to]}」`);
    change(delegation);
    if (to !== null) delegation.state = to;
    delegation.receipts.push({ event, state: delegation.state, at, actor, ...(note ? { note } : {}), ...(artifact ? { artifact } : {}) });
    delegation.revision++; delegation.updated_at = at;
    this.#replace(recordKey(id), raw, JSON.stringify(delegation));
    return delegation;
  }
}

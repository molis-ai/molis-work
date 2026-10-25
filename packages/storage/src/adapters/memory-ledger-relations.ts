import type { DatabaseSync } from "node:sqlite";
import type { MemoryOwnerRelation } from "@molis-ai/molis-work-contracts/services/memory";

const invalid = () => Object.assign(new Error("记忆归属身份不完整或互相矛盾，保留原件待核对"), { code: "memory.conflict" });
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** A change has one persisted identity, shared by recovery projection and retention proof. */
export function assertMemoryChangeIdentity(row: Record<string, unknown>, note: Record<string, unknown>): void {
  if (!text(row.change_id) || !text(row.actor_id) || !text(row.at) || !(row.memory_id === null || text(row.memory_id))
    || note.change_id !== row.change_id || note.actor_id !== row.actor_id || note.memory_id !== row.memory_id || note.at !== row.at) throw invalid();
}

export function assertMemoryUseIdentity(row: Record<string, unknown>, note: Record<string, unknown>): void {
  if (!text(row.memory_id) || !text(row.receipt_id) || !text(row.at) || !text(row.state) || !(row.work_id === null || text(row.work_id))
    || note.memory_id !== row.memory_id || note.receipt_id !== row.receipt_id || note.at !== row.at || note.work_id !== row.work_id || note.state !== row.state) throw invalid();
}

export function assertMemoryRevisionIdentity(row: Record<string, unknown>, note: Record<string, unknown>): void {
  if (!Number.isSafeInteger(row.version) || Number(row.version) < 1 || note.version !== row.version) throw invalid();
}

export function assertMemoryPairIdentity(row: Record<string, unknown>, note: Record<string, unknown>): void {
  if (!text(row.pair_id) || !text(row.state) || note.pair_id !== row.pair_id || note.state !== row.state) throw invalid();
  for (const item of [note.a, note.b]) {
    if (!item || typeof item !== "object" || Array.isArray(item) || !("memory_id" in item) || !text(item.memory_id)) throw invalid();
  }
}

/** The ledger owns decoding; only the relation crosses this boundary, never candidate content. */
export function readMemoryOwnerRelations(db: DatabaseSync): MemoryOwnerRelation[] {
  const found = new Map<string, MemoryOwnerRelation>();
  const add = (relation: MemoryOwnerRelation) => {
    const key = JSON.stringify([relation.scope, relation.owner]), previous = found.get(key);
    if (previous && (previous.project_id !== relation.project_id
      || previous.subject !== null && relation.subject !== null && previous.subject !== relation.subject)) throw invalid();
    found.set(key, { ...relation, subject: previous?.subject ?? relation.subject });
  };
  // One SQLite statement provides both sources from the same read snapshot without adding an owner lock.
  const rows = db.prepare(`SELECT 'owner' AS kind, scope, owner, project_id, subject, NULL AS candidate_id, NULL AS actor_id, NULL AS state, NULL AS body
    FROM memory_owners UNION ALL
    SELECT 'candidate' AS kind, NULL, NULL, NULL, NULL, candidate_id, actor_id, state, body FROM memory_candidates`).all();
  for (const row of rows) {
    if (row.kind === "owner") { add(decodeMemoryOwnerRelation(row)); continue; }
    add(decodeMemoryCandidateRelation(row));
  }
  return [...found.values()].sort((a, b) => JSON.stringify([a.scope, a.owner]).localeCompare(JSON.stringify([b.scope, b.owner])));
}

export function decodeMemoryOwnerRelation(row: Record<string, unknown>): MemoryOwnerRelation {
  if (typeof row.scope !== "string" || !["personal", "project", "character"].includes(row.scope) || !text(row.owner)
    || !(row.project_id === null || text(row.project_id)) || !(row.subject === null || text(row.subject))) throw invalid();
  const relation: MemoryOwnerRelation = { scope: row.scope as MemoryOwnerRelation["scope"], owner: row.owner,
    project_id: row.project_id, subject: row.subject };
  return relation;
}

export function decodeMemoryCandidateRelation(row: Record<string, unknown>, decoded?: unknown): MemoryOwnerRelation {
  let value: unknown = decoded;
  if (decoded === undefined) { try { value = JSON.parse(String(row.body)); } catch { throw invalid(); } }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const note = value as Record<string, unknown>;
  if (!text(row.candidate_id) || !text(row.actor_id) || note.candidate_id !== row.candidate_id || note.actor_id !== row.actor_id
    || note.state !== row.state || !["pending", "accepted", "discarded", "expired", "cancelled"].includes(String(note.state))) throw invalid();
  if (note.scope === "personal" && note.owner !== row.actor_id) throw invalid();
  return decodeMemoryOwnerRelation({ scope: note.scope, owner: note.owner, project_id: note.project_id, subject: null });
}

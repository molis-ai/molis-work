import type { DatabaseSync } from "node:sqlite";
import type { MemoryOwnerRelation } from "@molis-ai/molis-work-contracts/services/memory";

const invalid = () => Object.assign(new Error("记忆归属身份不完整或互相矛盾，保留原件待核对"), { code: "memory.conflict" });
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

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

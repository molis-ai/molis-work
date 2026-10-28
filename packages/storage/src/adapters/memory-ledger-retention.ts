import type { MemoryCandidateRecord, MemoryChangeRecord, MemoryLedgerPort, MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import type { DatabaseSync } from "node:sqlite";
import type { openHomeSqliteDatabase } from "../home-sqlite.js";
import { assertMemoryChangeIdentity, assertMemoryPairIdentity, assertMemoryRevisionIdentity, assertMemoryUseIdentity, decodeMemoryCandidateRelation } from "./memory-ledger-relations.js";

const retentionConflict = (): never => { throw Object.assign(new Error("原记忆的账本清理尚未完整证明"), { code: "memory.adoption_conflict" }); };
const record = (body: unknown): Record<string, unknown> => {
  let value: unknown;
  try { value = JSON.parse(String(body)); } catch { return retentionConflict(); }
  if (!value || typeof value !== "object" || Array.isArray(value)) return retentionConflict();
  return value as Record<string, unknown>;
};
const sourceKey = (scope: MemoryScope, owner: string, event: string) => `memory-source-forgotten:${JSON.stringify([scope, owner, event])}`;

/** Refuse contradictory retained identities before any fixed-plan mutation or completion proof. */
export function assertMemoryLedgerRetentionIdentities(db: DatabaseSync): void {
  for (const row of db.prepare("SELECT * FROM memory_revisions").iterate()) {
    try { assertMemoryRevisionIdentity(row, record(row.body)); } catch { retentionConflict(); }
  }
  for (const row of db.prepare("SELECT * FROM memory_uses").iterate()) {
    try { assertMemoryUseIdentity(row, record(row.body)); } catch { retentionConflict(); }
  }
  for (const row of db.prepare("SELECT * FROM memory_pairs").iterate()) {
    try { assertMemoryPairIdentity(row, record(row.body)); } catch { retentionConflict(); }
  }
  for (const row of db.prepare("SELECT * FROM memory_changes").iterate()) {
    try { assertMemoryChangeIdentity(row, record(row.body)); } catch { retentionConflict(); }
  }
  for (const row of db.prepare("SELECT * FROM memory_candidates").iterate()) {
    const candidate = record(row.body);
    try { decodeMemoryCandidateRelation(row, candidate); } catch { retentionConflict(); }
    if (candidate.memory_id !== null && typeof candidate.memory_id !== "string") retentionConflict();
  }
}

/** Shared by the existing cleanup owner and fixed-project maintenance, inside their transaction. */
export function suppressMemoryLedgerSources(db: DatabaseSync, actor: string, scope: MemoryScope, owner: string, sources: readonly { event_id: string }[]): void {
  for (const source of sources) db.prepare("INSERT OR IGNORE INTO memory_markers(actor_id,key,at,body) VALUES (?,?,?,?)")
    .run(actor, sourceKey(scope, owner, source.event_id), new Date().toISOString(), JSON.stringify({ event_id: source.event_id }));
}

export function dropMemoryLedgerCandidate(db: DatabaseSync, candidateId: string, identity: { scope: MemoryScope; owner: string }, actor?: string): void {
  const row = db.prepare("SELECT * FROM memory_candidates WHERE candidate_id=?").get(candidateId);
  if (!row) return;
  const note = record(row.body);
  if (actor !== undefined) { try { decodeMemoryCandidateRelation(row, note); } catch { retentionConflict(); } }
  if (note.scope !== identity.scope || note.owner !== identity.owner || actor !== undefined && (row.actor_id !== actor || note.actor_id !== actor || note.candidate_id !== candidateId)) retentionConflict();
  db.prepare("DELETE FROM memory_candidates WHERE candidate_id=?").run(candidateId);
}

/** An exact old selection proof; never a scope-empty or current-project proof. */
export function assertMemoryLedgerRetainedObjectsCleared(db: DatabaseSync, input: {
  actor_id: string; scopes: readonly { scope: MemoryScope; owner: string; memories: readonly { memory_id: string }[];
    candidates: readonly { candidate_id: string }[]; sources: readonly { event_id: string }[] }[];
}): void {
  assertMemoryLedgerRetentionIdentities(db);
  const memories = new Set(input.scopes.flatMap(scope => scope.memories.map(item => item.memory_id)));
  for (const target of input.scopes) {
    for (const item of target.candidates) if (db.prepare("SELECT 1 FROM memory_candidates WHERE candidate_id=?").get(item.candidate_id)) retentionConflict();
    for (const source of target.sources) {
      const row = db.prepare("SELECT body FROM memory_markers WHERE actor_id=? AND key=?").get(input.actor_id, sourceKey(target.scope, target.owner, source.event_id));
      if (!row || record(row.body).event_id !== source.event_id) retentionConflict();
    }
  }
  for (const id of memories) {
    const marker = db.prepare("SELECT body FROM memory_markers WHERE actor_id='' AND key=?").get(`memory-forgotten:${id}`);
    if (!marker) return retentionConflict();
    const forgotten = record(marker.body);
    if (forgotten.memory_id !== id || forgotten.state !== "forgotten") retentionConflict();
    if (db.prepare("SELECT 1 FROM memory_revisions WHERE memory_id=? LIMIT 1").get(id)
      || db.prepare("SELECT 1 FROM memory_uses WHERE memory_id=? LIMIT 1").get(id)) retentionConflict();
  }
  for (const row of db.prepare("SELECT memory_id,body FROM memory_changes").iterate()) {
    const change = record(row.body);
    if (typeof row.memory_id === "string" && memories.has(row.memory_id)
      && (change.text !== "" || change.reason !== null || change.undoable !== false || change.undo !== null)) retentionConflict();
  }
  for (const row of db.prepare("SELECT body FROM memory_pairs").iterate()) {
    const pair = record(row.body);
    for (const name of ["a", "b"]) {
      const item = pair[name];
      if (!item || typeof item !== "object" || !("memory_id" in item) || typeof item.memory_id !== "string") return retentionConflict();
      if (memories.has(item.memory_id)) retentionConflict();
    }
  }
  for (const row of db.prepare("SELECT body FROM memory_candidates").iterate()) {
    const candidate = record(row.body);
    if (typeof candidate.memory_id === "string" && memories.has(candidate.memory_id)) retentionConflict();
  }
}

/** Purge ledger copies and fence late receipts in the ledger's existing transaction. */
export function createMemoryLedgerRetention(db: ReturnType<typeof openHomeSqliteDatabase>, transaction: MemoryLedgerPort["transaction"]):
  Pick<MemoryLedgerPort, "forget" | "forgetScopes"> & { assertNotForgotten(memoryId: string): void; isForgotten(memoryId: string): boolean } {
  // A purged SDK identity is never reused. This existing marker carries no body and survives scope cleanup.
  const forgottenKey = (memoryId: string) => `memory-forgotten:${memoryId}`;
  let forgottenStatement: ReturnType<typeof db.prepare> | undefined;
  const isForgotten = (memoryId: string) => !!(forgottenStatement ??= db.prepare("SELECT 1 FROM memory_markers WHERE actor_id='' AND key=?")).get(forgottenKey(memoryId));
  const assertNotForgotten = (memoryId: string) => {
    if (isForgotten(memoryId)) throw Object.assign(new Error("这条记忆已经删除，不能补回旧正文或使用记录"), { code: "memory.conflict" });
  };
  return {
    assertNotForgotten,
    isForgotten,
    forget: memoryId => transaction(() => {
      db.prepare("INSERT OR IGNORE INTO memory_markers(actor_id,key,at,body) VALUES ('',?,?,?)")
        .run(forgottenKey(memoryId), new Date().toISOString(), JSON.stringify({ memory_id: memoryId, state: "forgotten" }));
      db.prepare("DELETE FROM memory_revisions WHERE memory_id=?").run(memoryId);
      db.prepare("DELETE FROM memory_uses WHERE memory_id=?").run(memoryId);
      // Recent changes stay (what happened, when), but no longer carry the deleted text.
      for (const row of db.prepare("SELECT change_id, body FROM memory_changes WHERE memory_id=?").all(memoryId)) {
        const change = JSON.parse(String(row.body)) as MemoryChangeRecord;
        db.prepare("UPDATE memory_changes SET body=? WHERE change_id=?").run(JSON.stringify({ ...change, text: "", reason: null, undoable: false, undo: null }), String(row.change_id));
      }
      // A pair that named it shows no copy of it any more.
      for (const row of db.prepare("SELECT pair_id, body FROM memory_pairs").all()) {
        const pair = JSON.parse(String(row.body)) as { a: { memory_id: string }; b: { memory_id: string } };
        if (pair.a.memory_id === memoryId || pair.b.memory_id === memoryId) db.prepare("DELETE FROM memory_pairs WHERE pair_id=?").run(String(row.pair_id));
      }
      // Candidates that became this memory keep no copy of it either.
      for (const row of db.prepare("SELECT candidate_id, body FROM memory_candidates").all()) {
        const candidate = JSON.parse(String(row.body)) as MemoryCandidateRecord;
        if (candidate.memory_id === memoryId) db.prepare("UPDATE memory_candidates SET body=? WHERE candidate_id=?")
          .run(JSON.stringify({ ...candidate, text: "", why: "", memory_id: null }), String(row.candidate_id));
      }
      // A late ledger receipt cannot put back forgotten history. Operation markers contain identity only.
      for (const row of db.prepare("SELECT actor_id, key, body FROM memory_markers WHERE key LIKE 'memory-operation:%'").all()) {
        const mark = JSON.parse(String(row.body)) as { memory_id?: string; result?: { memory_id?: string } };
        if (mark.memory_id === memoryId || mark.result?.memory_id === memoryId) db.prepare("UPDATE memory_markers SET body=? WHERE actor_id=? AND key=?")
          .run(JSON.stringify({ ...mark, phase: "closed" }), String(row.actor_id), String(row.key));
      }
    }),
    forgetScopes: input => transaction(() => {
      const gone = new Set(input.scopes.map(item => JSON.stringify([item.scope, item.owner])));
      // Changes, candidate notes and pairs carry their scope and owner in the record, not in a column.
      const drop = (table: string, key: string) => {
        for (const row of db.prepare(`SELECT ${key}, body FROM ${table}`).all()) {
          const record = JSON.parse(String(row.body)) as { scope?: string; owner?: string };
          if (gone.has(JSON.stringify([record.scope, record.owner]))) db.prepare(`DELETE FROM ${table} WHERE ${key}=?`).run(String(row[key]));
        }
      };
      drop("memory_changes", "change_id");
      drop("memory_candidates", "candidate_id");
      drop("memory_pairs", "pair_id");
      for (const item of input.scopes) db.prepare("DELETE FROM memory_owners WHERE scope=? AND owner=?").run(item.scope, item.owner);
      db.prepare("DELETE FROM memory_owners WHERE project_id=?").run(input.project_id);
      for (const key of input.prefs_keys) db.prepare("DELETE FROM memory_prefs WHERE key=?").run(key);
      for (const key of input.marker_keys) if (!key.startsWith("memory-forgotten:")) db.prepare("DELETE FROM memory_markers WHERE key=?").run(key);
      for (const row of db.prepare("SELECT actor_id,key,body FROM memory_markers WHERE key LIKE 'memory-operation:%'").all()) {
        const mark = JSON.parse(String(row.body)) as { scope?: string; owner?: string };
        if (gone.has(JSON.stringify([mark.scope, mark.owner]))) db.prepare("UPDATE memory_markers SET body=? WHERE actor_id=? AND key=?")
          .run(JSON.stringify({ ...mark, phase: "closed" }), String(row.actor_id), String(row.key));
      }
      for (const prefix of input.signal_prefixes) db.prepare("DELETE FROM memory_signal_events WHERE substr(key, 1, ?)=?").run(prefix.length, prefix);
    }),
  };
}

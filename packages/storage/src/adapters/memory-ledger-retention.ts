import { isDeepStrictEqual } from "node:util";
import type { MemoryCandidateRecord, MemoryChangeRecord, MemoryForgettingFacts, MemoryLedgerPort } from "@molis-ai/molis-work-contracts/services/memory";
import type { openHomeSqliteDatabase } from "../home-sqlite.js";

/** Purge ledger copies and fence late receipts in the ledger's existing transaction. */
export function createMemoryLedgerRetention(db: ReturnType<typeof openHomeSqliteDatabase>, transaction: MemoryLedgerPort["transaction"],
  accepted?: () => MemoryForgettingFacts):
  Pick<MemoryLedgerPort, "forget" | "forgetScopes"> & { assertNotForgotten(memoryId: string): void; isForgotten(memoryId: string, facts?: MemoryForgettingFacts): boolean;
    forgottenIds(memoryIds: readonly string[], facts: MemoryForgettingFacts): Set<string>;
    assertCandidateWritable(record: MemoryCandidateRecord): void } {
  const mode = (memoryId: string, facts?: MemoryForgettingFacts) => {
    const decisions = (facts ?? accepted?.())?.decisions.filter(one => one.memories.some(item => item.memory_id === memoryId)) ?? [];
    return decisions.some(one => one.selection_mode === "related") ? "related" : decisions[0]?.selection_mode;
  };
  // A purged SDK identity is never reused. This existing marker carries no body and survives scope cleanup.
  const forgottenKey = (memoryId: string) => `memory-forgotten:${memoryId}`;
  let forgottenMarker: ReturnType<typeof db.prepare> | undefined;
  const isForgotten = (memoryId: string, facts?: MemoryForgettingFacts) => mode(memoryId, facts) !== undefined
    || !!(forgottenMarker ??= db.prepare("SELECT 1 FROM memory_markers WHERE actor_id='' AND key=?")).get(forgottenKey(memoryId));
  const assertNotForgotten = (memoryId: string) => {
    if (isForgotten(memoryId)) throw Object.assign(new Error("这条记忆已经删除，不能补回旧正文或使用记录"), { code: "memory.conflict" });
  };
  return {
    assertNotForgotten,
    isForgotten,
    forgottenIds: (memoryIds, facts) => {
      const requested = new Set(memoryIds), forgotten = new Set<string>();
      for (const decision of facts.decisions) for (const memory of decision.memories)
        if (requested.has(memory.memory_id)) forgotten.add(memory.memory_id);
      const identities = [...requested];
      // Stay below SQLite's binding limit; every identity participates, including accepted ones.
      for (let offset = 0; offset < identities.length; offset += 128) {
        const batch = identities.slice(offset, offset + 128);
        for (const row of db.prepare(`SELECT key FROM memory_markers WHERE actor_id='' AND key IN (${batch.map(() => "?").join(",")})`)
          .all(...batch.map(forgottenKey))) forgotten.add(String(row.key).slice("memory-forgotten:".length));
      }
      return forgotten;
    },
    assertCandidateWritable: record => {
      const row = db.prepare("SELECT body FROM memory_candidates WHERE candidate_id=?").get(record.candidate_id);
      const previous = row ? JSON.parse(String(row.body)) as MemoryCandidateRecord : undefined;
      if (accepted?.().decisions.some(one => [previous, record].some(candidate => candidate && one.scope === candidate.scope && one.owner === candidate.owner
        && one.candidates.some(item => item.candidate_id === candidate.candidate_id))))
        throw Object.assign(new Error("这条候选已被遗忘，不能补回旧正文"), { code: "memory.conflict" });
      // Only an unselected candidate's already-settled exact history may remain unchanged.
      // Related forgetting and a first late acceptance keep their original closed write gate.
      for (const memoryId of [previous?.memory_id, record.memory_id]) {
        if (!memoryId || !isForgotten(memoryId)) continue;
        if (mode(memoryId) !== "exact-identities" || !isDeepStrictEqual(previous, record)) assertNotForgotten(memoryId);
      }
    },
    forget: (memoryId, selection_mode, options) => transaction(() => {
      db.prepare("INSERT OR IGNORE INTO memory_markers(actor_id,key,at,body) VALUES ('',?,?,?)")
        .run(forgottenKey(memoryId), new Date().toISOString(), JSON.stringify({ memory_id: memoryId, state: "forgotten" }));
      db.prepare("DELETE FROM memory_revisions WHERE memory_id=?").run(memoryId);
      db.prepare("DELETE FROM memory_uses WHERE memory_id=?").run(memoryId);
      // Recent changes stay (what happened, when), but no longer carry the deleted text.
      for (const row of db.prepare("SELECT change_id, body FROM memory_changes WHERE memory_id=?").all(memoryId)) {
        const change = JSON.parse(String(row.body)) as MemoryChangeRecord;
        db.prepare("UPDATE memory_changes SET body=? WHERE change_id=?").run(JSON.stringify({ ...change, text: "", reason: null, undoable: false, undo: null, ...(options?.moved_to ? { moved_to: options.moved_to } : {}) }), String(row.change_id));
      }
      // A pair that named it shows no copy of it any more.
      for (const row of db.prepare("SELECT pair_id, body FROM memory_pairs").all()) {
        const pair = JSON.parse(String(row.body)) as { a: { memory_id: string }; b: { memory_id: string } };
        if (pair.a.memory_id === memoryId || pair.b.memory_id === memoryId) db.prepare("DELETE FROM memory_pairs WHERE pair_id=?").run(String(row.pair_id));
      }
      // Candidates that became this memory keep no copy of it either.
      for (const row of db.prepare("SELECT candidate_id, body FROM memory_candidates").all()) {
        const candidate = JSON.parse(String(row.body)) as MemoryCandidateRecord;
        if ((selection_mode === "related" || mode(memoryId) === "related") && candidate.memory_id === memoryId) db.prepare("UPDATE memory_candidates SET body=? WHERE candidate_id=?")
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

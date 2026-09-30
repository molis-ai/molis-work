import type {
  MemoryCandidateRecord,
  MemoryChangeRecord,
  MemoryLedgerPort,
  MemoryMetaRecord,
  MemoryPrefs,
  MemoryRevision,
  MemoryScope,
  MemoryUseRecord,
} from "@molis-ai/molis-work-contracts/services/memory";
import { openHomeSqliteDatabase } from "../home-sqlite.js";

/**
 * The Host's memory ledger (specs/memory-system §5.1): structured facts about Prologue memory entries, candidates,
 * recent changes, switches, interface-signal counts and uses. The text of a memory lives in Prologue Memory; the
 * ledger keeps an earlier version's text only as that entry's history, and forgets it with the entry.
 */
export const MEMORY_LEDGER_STORE = "memory";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memory_meta (
  memory_id TEXT PRIMARY KEY, scope TEXT NOT NULL, owner TEXT NOT NULL, body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS memory_meta_owner ON memory_meta(scope, owner);
CREATE TABLE IF NOT EXISTS memory_revisions (
  memory_id TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (memory_id, version)
);
CREATE TABLE IF NOT EXISTS memory_candidates (
  candidate_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, state TEXT NOT NULL, body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS memory_candidates_actor ON memory_candidates(actor_id);
CREATE TABLE IF NOT EXISTS memory_changes (
  change_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, memory_id TEXT, at TEXT NOT NULL, body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS memory_changes_actor ON memory_changes(actor_id, at);
CREATE INDEX IF NOT EXISTS memory_changes_memory ON memory_changes(memory_id);
CREATE TABLE IF NOT EXISTS memory_prefs (
  actor_id TEXT NOT NULL, key TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (actor_id, key)
);
CREATE TABLE IF NOT EXISTS memory_signal_events (
  event_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, key TEXT NOT NULL, occurrence TEXT NOT NULL, at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS memory_signal_key ON memory_signal_events(actor_id, key);
CREATE TABLE IF NOT EXISTS memory_uses (
  memory_id TEXT NOT NULL, receipt_id TEXT NOT NULL, at TEXT NOT NULL, work_id TEXT, state TEXT NOT NULL, body TEXT NOT NULL,
  PRIMARY KEY (memory_id, receipt_id)
);
CREATE INDEX IF NOT EXISTS memory_uses_receipt ON memory_uses(receipt_id);
CREATE INDEX IF NOT EXISTS memory_uses_work ON memory_uses(work_id);
CREATE TABLE IF NOT EXISTS memory_owners (
  scope TEXT NOT NULL, owner TEXT NOT NULL, project_id TEXT, title TEXT NOT NULL, PRIMARY KEY (scope, owner)
);
CREATE TABLE IF NOT EXISTS memory_pairs (
  pair_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, state TEXT NOT NULL, body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memory_migrations (
  actor_id TEXT NOT NULL, source TEXT NOT NULL, at TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (actor_id, source)
);
`;

const parse = <T>(row: Record<string, unknown> | undefined): T | null => row ? JSON.parse(String(row.body)) as T : null;

export function openMemoryLedger(options: { homeDirectory: string }): MemoryLedgerPort {
  const db = openHomeSqliteDatabase(options.homeDirectory, MEMORY_LEDGER_STORE);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  db.exec(SCHEMA);
  let depth = 0;
  const ledger: MemoryLedgerPort = {
    meta: memoryId => parse<MemoryMetaRecord>(db.prepare("SELECT body FROM memory_meta WHERE memory_id=?").get(memoryId)),
    metas: (scope: MemoryScope, owner: string) => db.prepare("SELECT body FROM memory_meta WHERE scope=? AND owner=?").all(scope, owner)
      .map(row => JSON.parse(String(row.body)) as MemoryMetaRecord),
    saveMeta: record => {
      db.prepare("INSERT INTO memory_meta(memory_id,scope,owner,body) VALUES (?,?,?,?) ON CONFLICT(memory_id) DO UPDATE SET scope=excluded.scope, owner=excluded.owner, body=excluded.body")
        .run(record.memory_id, record.scope, record.owner, JSON.stringify(record));
    },
    forget: memoryId => ledger.transaction(() => {
      db.prepare("DELETE FROM memory_meta WHERE memory_id=?").run(memoryId);
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
    }),
    revisions: memoryId => db.prepare("SELECT body FROM memory_revisions WHERE memory_id=? ORDER BY version").all(memoryId)
      .map(row => JSON.parse(String(row.body)) as MemoryRevision),
    addRevision: (memoryId, revision) => {
      db.prepare("INSERT INTO memory_revisions(memory_id,version,body) VALUES (?,?,?) ON CONFLICT(memory_id,version) DO UPDATE SET body=excluded.body")
        .run(memoryId, revision.version, JSON.stringify(revision));
    },
    candidates: actorId => db.prepare("SELECT body FROM memory_candidates WHERE actor_id=? ORDER BY rowid").all(actorId)
      .map(row => JSON.parse(String(row.body)) as MemoryCandidateRecord),
    saveCandidate: record => {
      db.prepare("INSERT INTO memory_candidates(candidate_id,actor_id,state,body) VALUES (?,?,?,?) ON CONFLICT(candidate_id) DO UPDATE SET state=excluded.state, body=excluded.body")
        .run(record.candidate_id, record.actor_id, record.state, JSON.stringify(record));
    },
    dropCandidate: candidateId => { db.prepare("DELETE FROM memory_candidates WHERE candidate_id=?").run(candidateId); },
    changes: (actorId, limit) => db.prepare("SELECT body FROM memory_changes WHERE actor_id=? ORDER BY at DESC, rowid DESC LIMIT ?").all(actorId, limit)
      .map(row => JSON.parse(String(row.body)) as MemoryChangeRecord),
    change: changeId => parse<MemoryChangeRecord>(db.prepare("SELECT body FROM memory_changes WHERE change_id=?").get(changeId)),
    saveChange: record => {
      db.prepare("INSERT INTO memory_changes(change_id,actor_id,memory_id,at,body) VALUES (?,?,?,?,?) ON CONFLICT(change_id) DO UPDATE SET memory_id=excluded.memory_id, body=excluded.body")
        .run(record.change_id, record.actor_id, record.memory_id, record.at, JSON.stringify(record));
    },
    prefs: (actorId, key) => parse<Partial<MemoryPrefs>>(db.prepare("SELECT body FROM memory_prefs WHERE actor_id=? AND key=?").get(actorId, key)),
    savePrefs: (actorId, key, prefs) => {
      db.prepare("INSERT INTO memory_prefs(actor_id,key,body) VALUES (?,?,?) ON CONFLICT(actor_id,key) DO UPDATE SET body=excluded.body").run(actorId, key, JSON.stringify(prefs));
    },
    countSignal: input => ledger.transaction(() => {
      const inserted = db.prepare("INSERT OR IGNORE INTO memory_signal_events(event_id,actor_id,key,occurrence,at) VALUES (?,?,?,?,?)")
        .run(input.event_id, input.actor_id, input.key, input.occurrence, input.at);
      const counts = db.prepare("SELECT COUNT(*) AS count, COUNT(DISTINCT occurrence) AS distinct_count FROM memory_signal_events WHERE actor_id=? AND key=?").get(input.actor_id, input.key)!;
      return { state: Number(inserted.changes) > 0 ? "counted" as const : "duplicate" as const, count: Number(counts.count), distinct: Number(counts.distinct_count) };
    }),
    recordUses: uses => ledger.transaction(() => {
      for (const use of uses) db.prepare("INSERT INTO memory_uses(memory_id,receipt_id,at,work_id,state,body) VALUES (?,?,?,?,?,?) ON CONFLICT(memory_id,receipt_id) DO UPDATE SET at=excluded.at, state=excluded.state, body=excluded.body")
        .run(use.memory_id, use.receipt_id, use.at, use.work_id, use.state, JSON.stringify(use));
    }),
    lastUse: memoryId => parse<MemoryUseRecord>(db.prepare("SELECT body FROM memory_uses WHERE memory_id=? AND state='used' ORDER BY at DESC, rowid DESC LIMIT 1").get(memoryId)),
    uses: filter => {
      const where: string[] = [], values: string[] = [];
      if (filter.receipt_id) { where.push("receipt_id=?"); values.push(filter.receipt_id); }
      if (filter.work_id) { where.push("work_id=?"); values.push(filter.work_id); }
      if (filter.memory_id) { where.push("memory_id=?"); values.push(filter.memory_id); }
      return db.prepare(`SELECT body FROM memory_uses ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY at DESC, rowid DESC LIMIT ${Math.max(1, Math.min(500, filter.limit ?? 100))}`)
        .all(...values).map(row => JSON.parse(String(row.body)) as MemoryUseRecord);
    },
    owners: projectId => db.prepare("SELECT scope, owner, title FROM memory_owners WHERE project_id=? ORDER BY rowid").all(projectId)
      .map(row => ({ scope: String(row.scope) as never, owner: String(row.owner), title: String(row.title) })),
    noteOwner: input => {
      db.prepare("INSERT INTO memory_owners(scope,owner,project_id,title) VALUES (?,?,?,?) ON CONFLICT(scope,owner) DO UPDATE SET project_id=excluded.project_id, title=excluded.title")
        .run(input.scope, input.owner, input.project_id, input.title);
    },
    pairs: actorId => db.prepare("SELECT body FROM memory_pairs WHERE actor_id=? ORDER BY rowid").all(actorId).map(row => JSON.parse(String(row.body)) as ReturnType<MemoryLedgerPort["pairs"]>[number]),
    savePair: (actorId, pair) => {
      db.prepare("INSERT INTO memory_pairs(pair_id,actor_id,state,body) VALUES (?,?,?,?) ON CONFLICT(pair_id) DO UPDATE SET state=excluded.state, body=excluded.body")
        .run(pair.pair_id, actorId, pair.state, JSON.stringify(pair));
    },
    migration: (actorId, source) => {
      const row = db.prepare("SELECT at, body FROM memory_migrations WHERE actor_id=? AND source=?").get(actorId, source);
      return row ? { at: String(row.at), body: JSON.parse(String(row.body)) as unknown } : null;
    },
    markMigration: (actorId, source, body, at) => {
      db.prepare("INSERT INTO memory_migrations(actor_id,source,at,body) VALUES (?,?,?,?) ON CONFLICT(actor_id,source) DO UPDATE SET at=excluded.at, body=excluded.body")
        .run(actorId, source, at, JSON.stringify(body));
    },
    transaction: <T>(work: () => T): T => {
      if (depth > 0) return work();
      depth += 1;
      db.exec("BEGIN IMMEDIATE");
      try { const result = work(); db.exec("COMMIT"); return result; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
      finally { depth -= 1; }
    },
    close: () => db.close(),
  };
  return ledger;
}

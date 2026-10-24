import type {
  MemoryCandidateRecord,
  MemoryChangeRecord,
  MemoryLedgerPort,
  MemoryPrefs,
  MemoryRevision,
  MemoryScope,
  MemoryUseRecord,
} from "@molis-ai/molis-work-contracts/services/memory";
import { isCompleteMemoryPrefs } from "@molis-ai/molis-work-contracts/services/memory";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { homeSqlitePath, openHomeSqliteDatabase, openReadOnlyHomeSqlite } from "../home-sqlite.js";
import { isDeepStrictEqual } from "node:util";
import { createMemoryLedgerRetention } from "./memory-ledger-retention.js";
import type { HomeStoreDeclaration } from "../home-stores.js";
import { applySqliteBaseline, describeSqliteBaseline, describeSqliteSchema, SqliteSchemaVersionError, type SqliteBaseline } from "../sqlite-baseline.js";

/**
 * The Host's memory ledger (specs/archive/memory-system §5.1): what the platform knows around Prologue memory entries —
 * history, notes on candidates, recent changes, switches, interface-signal counts, uses, owners, pairs and per-person
 * markers. The text and facts of a memory live on its Prologue entry; the ledger keeps an earlier version's text only as
 * that entry's history, and forgets it with the entry.
 */
export const MEMORY_LEDGER_STORE = "memory";

/** The memory ledger's one current schema (repository-anti-corruption §4.1). */
export const MEMORY_LEDGER_BASELINE: SqliteBaseline = { version: 4, schema: `
CREATE TABLE memory_revisions (
  memory_id TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (memory_id, version)
);
CREATE TABLE memory_candidates (
  candidate_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, state TEXT NOT NULL, body TEXT NOT NULL
);
CREATE INDEX memory_candidates_actor ON memory_candidates(actor_id);
CREATE TABLE memory_changes (
  change_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, memory_id TEXT, at TEXT NOT NULL, body TEXT NOT NULL
);
CREATE INDEX memory_changes_actor ON memory_changes(actor_id, at);
CREATE INDEX memory_changes_memory ON memory_changes(memory_id);
CREATE TABLE memory_prefs (
  actor_id TEXT NOT NULL, key TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (actor_id, key)
);
CREATE TABLE memory_signal_events (
  event_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, key TEXT NOT NULL, occurrence TEXT NOT NULL, at TEXT NOT NULL
);
CREATE INDEX memory_signal_key ON memory_signal_events(actor_id, key);
CREATE TABLE memory_uses (
  memory_id TEXT NOT NULL, receipt_id TEXT NOT NULL, at TEXT NOT NULL, work_id TEXT, state TEXT NOT NULL, body TEXT NOT NULL,
  PRIMARY KEY (memory_id, receipt_id)
);
CREATE INDEX memory_uses_receipt ON memory_uses(receipt_id);
CREATE INDEX memory_uses_work ON memory_uses(work_id);
CREATE TABLE memory_owners (
  scope TEXT NOT NULL, owner TEXT NOT NULL, project_id TEXT, title TEXT NOT NULL, subject TEXT, PRIMARY KEY (scope, owner)
);
CREATE TABLE memory_pairs (
  pair_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, state TEXT NOT NULL, body TEXT NOT NULL
);
CREATE TABLE memory_markers (
  actor_id TEXT NOT NULL, key TEXT NOT NULL, at TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (actor_id, key)
);
` };

const parse = <T>(row: Record<string, unknown> | undefined): T | null => row ? JSON.parse(String(row.body)) as T : null;

/** Startup inspects every stored profile before opening a writer; missing stores and other versions are never repaired. */
export function readMemoryLedgerProfiles(options: { homeDirectory: string }): readonly { actor_id: string; key: string; prefs: unknown }[] {
  const db = openReadOnlyHomeSqlite(options.homeDirectory, MEMORY_LEDGER_STORE);
  try {
    const found = Number(db.prepare("PRAGMA user_version").get()!.user_version);
    if (found !== MEMORY_LEDGER_BASELINE.version) throw new SqliteSchemaVersionError(
      homeSqlitePath(options.homeDirectory, MEMORY_LEDGER_STORE), found, MEMORY_LEDGER_BASELINE.version);
    return db.prepare("SELECT actor_id, key, body FROM memory_prefs ORDER BY actor_id, key").all()
      .map(row => ({ actor_id: String(row.actor_id), key: String(row.key), prefs: JSON.parse(String(row.body)) as unknown }));
  } finally { db.close(); }
}

/** A never-used new Home may contain only preferences. This is not a scope-list completeness claim. */
export function memoryLedgerHasOnlyPreferences(options: { homeDirectory: string }): boolean {
  const db = openReadOnlyHomeSqlite(options.homeDirectory, MEMORY_LEDGER_STORE);
  try {
    const version = Number(db.prepare("PRAGMA user_version").get()!.user_version);
    if (version !== MEMORY_LEDGER_BASELINE.version) throw new SqliteSchemaVersionError(
      homeSqlitePath(options.homeDirectory, MEMORY_LEDGER_STORE), version, MEMORY_LEDGER_BASELINE.version);
    if (!isDeepStrictEqual(describeSqliteSchema(db), describeSqliteBaseline(MEMORY_LEDGER_BASELINE))) return false;
    for (const table of ["memory_revisions", "memory_candidates", "memory_changes", "memory_signal_events", "memory_uses", "memory_owners", "memory_pairs"])
      if (db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get()) return false;
    const profiles = db.prepare("SELECT actor_id,key,body FROM memory_prefs").all();
    if (!profiles.every(row => row.actor_id === LOCAL_PERSON_ACTOR_ID
      && (row.key === "personal" || row.key === "project-default" || String(row.key).startsWith("project:"))
      && isCompleteMemoryPrefs(JSON.parse(String(row.body))))) return false;
    const markers = db.prepare("SELECT actor_id,key,body FROM memory_markers").all();
    if (markers.length !== 1 || markers[0]!.actor_id !== LOCAL_PERSON_ACTOR_ID || markers[0]!.key !== "strategy-adoption") return false;
    const marker: unknown = JSON.parse(String(markers[0]!.body));
    return !!marker && typeof marker === "object" && Object.keys(marker).length === 1 && "origin" in marker && marker.origin === "new-home";
  } finally { db.close(); }
}

export function openMemoryLedger(options: { homeDirectory: string }): MemoryLedgerPort {
  const db = openHomeSqliteDatabase(options.homeDirectory, MEMORY_LEDGER_STORE);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  try { applySqliteBaseline(db, homeSqlitePath(options.homeDirectory, MEMORY_LEDGER_STORE), MEMORY_LEDGER_BASELINE); } catch (error) { db.close(); throw error; }
  let depth = 0;
  const retention = createMemoryLedgerRetention(db, work => ledger.transaction(work));
  const ledger: MemoryLedgerPort = {
    forget: retention.forget,
    forgetScopes: retention.forgetScopes,
    revisions: memoryId => db.prepare("SELECT body FROM memory_revisions WHERE memory_id=? ORDER BY version").all(memoryId)
      .map(row => JSON.parse(String(row.body)) as MemoryRevision),
    addRevision: (memoryId, revision) => ledger.transaction(() => {
      retention.assertNotForgotten(memoryId);
      const before = parse<MemoryRevision>(db.prepare("SELECT body FROM memory_revisions WHERE memory_id=? AND version=?").get(memoryId, revision.version));
      if (before) {
        if (!isDeepStrictEqual({ text: before.text, kind: before.kind, applies: before.applies, snapshot: before.snapshot },
          { text: revision.text, kind: revision.kind, applies: revision.applies, snapshot: revision.snapshot })) {
          throw Object.assign(new Error("同一记忆版本的历史内容不能被重写"), { code: "memory.conflict" });
        }
        return;
      }
      db.prepare("INSERT INTO memory_revisions(memory_id,version,body) VALUES (?,?,?)")
        .run(memoryId, revision.version, JSON.stringify(revision));
    }),
    candidates: actorId => db.prepare("SELECT body FROM memory_candidates WHERE actor_id=? ORDER BY rowid").all(actorId)
      .map(row => JSON.parse(String(row.body)) as MemoryCandidateRecord),
    saveCandidate: record => ledger.transaction(() => {
      if (record.memory_id) retention.assertNotForgotten(record.memory_id);
      db.prepare("INSERT INTO memory_candidates(candidate_id,actor_id,state,body) VALUES (?,?,?,?) ON CONFLICT(candidate_id) DO UPDATE SET state=excluded.state, body=excluded.body")
        .run(record.candidate_id, record.actor_id, record.state, JSON.stringify(record));
    }),
    dropCandidate: candidateId => { db.prepare("DELETE FROM memory_candidates WHERE candidate_id=?").run(candidateId); },
    changes: (actorId, limit) => db.prepare("SELECT body FROM memory_changes WHERE actor_id=? ORDER BY at DESC, rowid DESC LIMIT ?").all(actorId, limit)
      .map(row => JSON.parse(String(row.body)) as MemoryChangeRecord),
    changesOf: memoryId => db.prepare("SELECT body FROM memory_changes WHERE memory_id=? ORDER BY at DESC, rowid DESC").all(memoryId)
      .map(row => JSON.parse(String(row.body)) as MemoryChangeRecord),
    change: changeId => parse<MemoryChangeRecord>(db.prepare("SELECT body FROM memory_changes WHERE change_id=?").get(changeId)),
    saveChange: record => ledger.transaction(() => {
      if (record.memory_id && (record.text || record.reason || record.undoable || record.undo)) retention.assertNotForgotten(record.memory_id);
      db.prepare("INSERT INTO memory_changes(change_id,actor_id,memory_id,at,body) VALUES (?,?,?,?,?) ON CONFLICT(change_id) DO UPDATE SET memory_id=excluded.memory_id, body=excluded.body")
        .run(record.change_id, record.actor_id, record.memory_id, record.at, JSON.stringify(record));
    }),
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
      for (const use of uses) {
        // A late multi-reference receipt must not resurrect a forgotten entry or hide the other entries' facts.
        if (retention.isForgotten(use.memory_id)) continue;
        const before = parse<MemoryUseRecord>(db.prepare("SELECT body FROM memory_uses WHERE memory_id=? AND receipt_id=?").get(use.memory_id, use.receipt_id));
        if (before?.source === "run-context") {
          if (use.source !== "run-context" || !isDeepStrictEqual([before.run, before.memory_version, before.at, before.consumer, before.work_id],
            [use.run, use.memory_version, use.at, use.consumer, use.work_id])) {
            throw Object.assign(new Error("同一记忆回执的执行与版本不能被替换"), { code: "memory.conflict" });
          }
          const rank = (state: MemoryUseRecord["state"]) => state === "response-observed" ? 3 : state === "dispatched-or-unknown" ? 2 : 1;
          if (rank(before.state) >= rank(use.state)) continue;
        }
        db.prepare("INSERT INTO memory_uses(memory_id,receipt_id,at,work_id,state,body) VALUES (?,?,?,?,?,?) ON CONFLICT(memory_id,receipt_id) DO UPDATE SET at=excluded.at, state=excluded.state, body=excluded.body")
          .run(use.memory_id, use.receipt_id, use.at, use.work_id, use.state, JSON.stringify(use));
      }
    }),
    lastUse: memoryId => parse<MemoryUseRecord>(db.prepare("SELECT body FROM memory_uses WHERE memory_id=? AND state='response-observed' ORDER BY at DESC, rowid DESC LIMIT 1").get(memoryId)),
    uses: filter => {
      const where: string[] = [], values: string[] = [];
      if (filter.receipt_id) { where.push("receipt_id=?"); values.push(filter.receipt_id); }
      if (filter.work_id) { where.push("work_id=?"); values.push(filter.work_id); }
      if (filter.memory_id) { where.push("memory_id=?"); values.push(filter.memory_id); }
      return db.prepare(`SELECT body FROM memory_uses ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY at DESC, rowid DESC LIMIT ${Math.max(1, Math.min(500, filter.limit ?? 100))}`)
        .all(...values).map(row => JSON.parse(String(row.body)) as MemoryUseRecord);
    },
    owners: projectId => db.prepare("SELECT scope, owner, title, subject FROM memory_owners WHERE project_id=? ORDER BY rowid").all(projectId)
      .map(row => ({ scope: String(row.scope) as never, owner: String(row.owner), title: String(row.title), subject: row.subject === null || row.subject === undefined ? null : String(row.subject) })),
    noteOwner: input => {
      db.prepare("INSERT INTO memory_owners(scope,owner,project_id,title,subject) VALUES (?,?,?,?,?) ON CONFLICT(scope,owner) DO UPDATE SET project_id=excluded.project_id, title=excluded.title, subject=COALESCE(excluded.subject, memory_owners.subject)")
        .run(input.scope, input.owner, input.project_id, input.title, input.subject ?? null);
    },
    candidateOwners: projectId => {
      const found = new Map<string, { scope: MemoryScope; owner: string }>();
      for (const row of db.prepare("SELECT body FROM memory_candidates").all()) {
        const note = JSON.parse(String(row.body)) as MemoryCandidateRecord;
        if (note.project_id === projectId) found.set(JSON.stringify([note.scope, note.owner]), { scope: note.scope, owner: note.owner });
      }
      return [...found.values()];
    },
    pairs: actorId => db.prepare("SELECT body FROM memory_pairs WHERE actor_id=? ORDER BY rowid").all(actorId).map(row => JSON.parse(String(row.body)) as ReturnType<MemoryLedgerPort["pairs"]>[number]),
    savePair: (actorId, pair) => ledger.transaction(() => {
      retention.assertNotForgotten(pair.a.memory_id); retention.assertNotForgotten(pair.b.memory_id);
      db.prepare("INSERT INTO memory_pairs(pair_id,actor_id,state,body) VALUES (?,?,?,?) ON CONFLICT(pair_id) DO UPDATE SET state=excluded.state, body=excluded.body")
        .run(pair.pair_id, actorId, pair.state, JSON.stringify(pair));
    }),
    marker: (actorId, key) => {
      const row = db.prepare("SELECT at, body FROM memory_markers WHERE actor_id=? AND key=?").get(actorId, key);
      return row ? { at: String(row.at), body: JSON.parse(String(row.body)) as unknown } : null;
    },
    setMarker: (actorId, key, body, at) => {
      db.prepare("INSERT INTO memory_markers(actor_id,key,at,body) VALUES (?,?,?,?) ON CONFLICT(actor_id,key) DO UPDATE SET at=excluded.at, body=excluded.body")
        .run(actorId, key, at, JSON.stringify(body));
    },
    transaction: <T>(work: () => T): T => {
      if (depth > 0) return work();
      db.exec("BEGIN IMMEDIATE");
      depth += 1;
      try { const result = work(); db.exec("COMMIT"); return result; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
      finally { depth -= 1; }
    },
    close: () => db.close(),
  };
  return ledger;
}

/** The memory ledger in the Home's store registry (W4-11). */
export const MEMORY_LEDGER_HOME_STORE: HomeStoreDeclaration = { path: MEMORY_LEDGER_STORE, library: { baseline: MEMORY_LEDGER_BASELINE } };

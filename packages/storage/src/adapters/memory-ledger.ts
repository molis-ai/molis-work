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
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { lstatSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { assertNoPendingHomeRestore } from "./home-restore-guard.js";
import { readSnapshotFile, snapshotFileStat } from "../snapshot-files.js";
import { describeSqliteBaseline, describeSqliteSchema } from "../sqlite-baseline.js";
import { snapshotProgramsMatch } from "../sqlite-baseline-inspection.js";
import { readDatabaseSpace, readStorageSpace, STORAGE_SPACE_SCHEMA_SQL } from "../space.js";
import { homeSqlitePath } from "../home-sqlite.js";
import { isDeepStrictEqual } from "node:util";
import { createMemoryLedgerRetention } from "./memory-ledger-retention.js";
import type { HomeStoreDeclaration } from "../home-stores.js";
import { openBaselineHomeSqlite, type SqliteBaseline } from "../sqlite-baseline.js";

/**
 * The Host's memory ledger (specs/archive/memory-system §5.1): what the platform knows around Prologue memory entries —
 * history, notes on candidates, recent changes, switches, interface-signal counts, uses, owners, pairs and per-person
 * markers. The text and facts of a memory live on its Prologue entry; the ledger keeps an earlier version's text only as
 * that entry's history, and forgets it with the entry.
 */
export const MEMORY_LEDGER_STORE = "memory";

/** The memory ledger's one current schema (repository-anti-corruption §4.1). */
export const MEMORY_LEDGER_BASELINE: SqliteBaseline = { version: /* @version database.memory_ledger_baseline */ 1, schema: `
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

const inspectionErrors = defineErrorCodes("storage.memory", { invalid: "invalid", changed: "conflict" });
export type MemoryLedgerInspection = { readonly state: "absent" } | { readonly state: "complete";
  readonly personal: MemoryPrefs; readonly project_default: MemoryPrefs };

function inspectionTemporaryParent(source: string): string {
  const parent = realpathSync(tmpdir()), distance = relative(realpathSync(source), parent);
  if (!lstatSync(parent).isDirectory() || !distance || distance !== ".." && !distance.startsWith(".." + sep) && !isAbsolute(distance))
    throw inspectionErrors.invalid("记忆只读检查的暂存父目录必须在源目录之外");
  return parent;
}

/** No SQLite connection touches the source: even WAL read marks belong only to a private disposable copy. */
export function inspectMemoryLedger(options: { homeDirectory: string; actorId: string }): MemoryLedgerInspection {
  if (!options.actorId) throw inspectionErrors.invalid("记忆资格检查需要可信操作者");
  const file = homeSqlitePath(options.homeDirectory, MEMORY_LEDGER_STORE);
  if (!lstatSync(file, { throwIfNoEntry: false })) return { state: "absent" };
  const paths = [file, file + "-wal", file + "-shm", file + "-journal"];
  const before = paths.map(path => lstatSync(path, { throwIfNoEntry: false }));
  const stage = mkdtempSync(join(inspectionTemporaryParent(options.homeDirectory), "molis-memory-inspection-"));
  let db: DatabaseSync | undefined;
  try {
    for (let at = 0; at < paths.length; at++) {
      if (!before[at]) continue;
      const source = paths[at]!;
      snapshotFileStat(source);
      // Shared-memory read marks are rebuilt only in the private copy; source SHM is never opened.
      if (at !== 2) writeFileSync(join(stage, "memory.db" + source.slice(file.length)), readSnapshotFile(source, before[at]!.size), { mode: 0o600 });
    }
    const unchanged = () => paths.every((path, at) => {
      const current = lstatSync(path, { throwIfNoEntry: false }), original = before[at];
      return original ? current && ["dev", "ino", "mode", "size", "mtimeMs", "ctimeMs", "nlink"].every(key =>
        Reflect.get(current, key) === Reflect.get(original, key)) : !current;
    });
    if (!unchanged()) throw inspectionErrors.changed("只读检查期间记忆账本已变化");
    db = new DatabaseSync(join(stage, "memory.db"), { readOnly: true });
    const version = db.prepare("PRAGMA user_version").get()?.user_version;
    const databaseSpace = readDatabaseSpace(db), homeSpace = readStorageSpace(options.homeDirectory);
    if (homeSpace && !isDeepStrictEqual(databaseSpace, homeSpace)) throw inspectionErrors.invalid("记忆账本的空间归属与 Home 不同");
    const expected = databaseSpace ? { ...MEMORY_LEDGER_BASELINE, schema: STORAGE_SPACE_SCHEMA_SQL + MEMORY_LEDGER_BASELINE.schema } : MEMORY_LEDGER_BASELINE;
    if (version !== MEMORY_LEDGER_BASELINE.version || !snapshotProgramsMatch(db,expected.schema,false) || !isDeepStrictEqual(describeSqliteSchema(db), describeSqliteBaseline(expected))
      || db.prepare("PRAGMA integrity_check").all().some(row => Object.values(row).some(value => value !== "ok"))
      || db.prepare("PRAGMA foreign_key_check").all().length) throw inspectionErrors.invalid("记忆账本不是完整的现行结构");
    const prefs = (key: string) => {
      const row = db!.prepare("SELECT body FROM memory_prefs WHERE actor_id = ? AND key = ?").get(options.actorId, key);
      let value: unknown;
      try { value = row ? JSON.parse(String(row.body)) : undefined; }
      catch { throw inspectionErrors.invalid("记忆设置不是有效的现行数据"); }
      if (!isCompleteMemoryPrefs(value)) throw inspectionErrors.invalid("记忆账本缺少完整的现行设置");
      return value;
    };
    const result = { state: "complete" as const, personal: prefs("personal"), project_default: prefs("project-default") };
    if (!unchanged()) throw inspectionErrors.changed("只读检查期间记忆账本已变化");
    return result;
  } finally { try { db?.close(); } finally { rmSync(stage, { recursive: true, force: true }); } }
}

export function openMemoryLedger(options: { homeDirectory: string }): MemoryLedgerPort {
  assertNoPendingHomeRestore(join(options.homeDirectory, "agent-runtime"));
  const db = openBaselineHomeSqlite(options.homeDirectory, MEMORY_LEDGER_STORE, MEMORY_LEDGER_BASELINE);
  try { db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;"); }
  catch (error) { db.close(); throw error; }
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

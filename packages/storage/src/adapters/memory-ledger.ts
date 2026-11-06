import type {
  MemoryCandidateRecord,
  MemoryChangeRecord,
  MemoryForgettingFacts,
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
import { inspectMemoryForgetting, openMemoryForgetting } from "./memory-forgetting.js";
import { readSnapshotFile, snapshotFileStat } from "../snapshot-files.js";
import { describeSqliteBaseline, describeSqliteSchema } from "../sqlite-baseline.js";
import { homeSqlitePath, openHomeSqliteDatabase } from "../home-sqlite.js";
import { isDeepStrictEqual } from "node:util";
import { createMemoryLedgerRetention } from "./memory-ledger-retention.js";
import type { HomeStoreDeclaration } from "../home-stores.js";
import { applySqliteBaseline, type SqliteBaseline } from "../sqlite-baseline.js";

/**
 * The Host's memory ledger (specs/archive/memory-system §5.1): what the platform knows around Prologue memory entries —
 * history, notes on candidates, recent changes, switches, interface-signal counts, uses, owners, pairs and per-person
 * markers. The text and facts of a memory live on its Prologue entry; the ledger keeps an earlier version's text only as
 * that entry's history, and forgets it with the entry.
 */
export const MEMORY_LEDGER_STORE = "memory";

/** The memory ledger's one current schema (repository-anti-corruption §4.1). */
export const MEMORY_LEDGER_BASELINE: SqliteBaseline = { version: 2, schema: `
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

/** Internal owner inspection: even WAL read marks belong only to a private disposable copy. */
export function inspectMemoryLedgerSnapshot<T>(homeDirectory: string, read: (db: DatabaseSync) => T): T | undefined {
  const file = homeSqlitePath(homeDirectory, MEMORY_LEDGER_STORE);
  if (!lstatSync(file, { throwIfNoEntry: false })) return undefined;
  const paths = [file, file + "-wal", file + "-shm", file + "-journal"];
  const before = paths.map(path => lstatSync(path, { throwIfNoEntry: false }));
  const stage = mkdtempSync(join(inspectionTemporaryParent(homeDirectory), "molis-memory-inspection-"));
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
    if (version !== MEMORY_LEDGER_BASELINE.version || !isDeepStrictEqual(describeSqliteSchema(db), describeSqliteBaseline(MEMORY_LEDGER_BASELINE))
      || db.prepare("PRAGMA integrity_check").all().some(row => Object.values(row).some(value => value !== "ok"))
      || db.prepare("PRAGMA foreign_key_check").all().length) throw inspectionErrors.invalid("记忆账本不是完整的现行结构");
    const result = read(db);
    if (!unchanged()) throw inspectionErrors.changed("只读检查期间记忆账本已变化");
    return result;
  } finally { try { db?.close(); } finally { rmSync(stage, { recursive: true, force: true }); } }
}

/** No SQLite connection touches the source: even WAL read marks belong only to a private disposable copy. */
export function inspectMemoryLedger(options: { homeDirectory: string; actorId: string }): MemoryLedgerInspection {
  if (!options.actorId) throw inspectionErrors.invalid("记忆资格检查需要可信操作者");
  return inspectMemoryLedgerSnapshot(options.homeDirectory, db => {
    const prefs = (key: string) => {
      const row = db.prepare("SELECT body FROM memory_prefs WHERE actor_id = ? AND key = ?").get(options.actorId, key);
      let value: unknown;
      try { value = row ? JSON.parse(String(row.body)) : undefined; }
      catch { throw inspectionErrors.invalid("记忆设置不是有效的现行数据"); }
      if (!isCompleteMemoryPrefs(value)) throw inspectionErrors.invalid("记忆账本缺少完整的现行设置");
      return value;
    };
    return { state: "complete" as const, personal: prefs("personal"), project_default: prefs("project-default") };
  }) ?? { state: "absent" };
}

export function openMemoryLedger(options: { homeDirectory: string; storageOwner?: import("./storage-owner.js").StorageOwner }): MemoryLedgerPort {
  assertNoPendingHomeRestore(join(options.homeDirectory, "agent-runtime"));
  const db = openHomeSqliteDatabase(options.homeDirectory, MEMORY_LEDGER_STORE);
  let depth = 0, closed = false;
  // Only receipt batches in the current transaction; cleared on either commit or rollback.
  let receiptFacts: MemoryForgettingFacts[] = [];
  let receiptFailure: { error: unknown } | undefined;
  let receiptPhase = 0;
  const assertReceiptFacts = (before: MemoryForgettingFacts, current: MemoryForgettingFacts) => {
    if (!isDeepStrictEqual(before, current)) throw Object.assign(new Error("记忆回执提交前遗忘事实已变化"), { code: "memory.conflict" });
  };
  let forgetting: ReturnType<typeof openMemoryForgetting> | undefined;
  try {
    applySqliteBaseline(db, homeSqlitePath(options.homeDirectory, MEMORY_LEDGER_STORE), MEMORY_LEDGER_BASELINE);
    db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    forgetting = options.storageOwner ? openMemoryForgetting({ homeDirectory: options.homeDirectory, storageOwner: options.storageOwner,
      assertCurrent: () => { if (closed) throw new Error("记忆账本已经关闭"); } }) : undefined;
  } catch (error) { db.close(); throw error; }
  const retention = createMemoryLedgerRetention(db, work => ledger.transaction(work), () => ledger.forgetting.read());
  const visibleChange = (record: MemoryChangeRecord): MemoryChangeRecord => record.memory_id && retention.isForgotten(record.memory_id)
    ? { ...record, text: "", reason: null, undoable: false, undo: null } : record;
  const ledger: MemoryLedgerPort = {
    forgetting: {
      read: () => { if (closed) throw new Error("记忆账本已经关闭"); return forgetting?.read() ?? inspectMemoryForgetting(options.homeDirectory); },
      accept: selection => {
        if (!forgetting) throw Object.assign(new Error("接受遗忘决定需要当前 Home 的原存储主人"), { code: "memory.unavailable" });
        return forgetting.accept(selection);
      },
    },
    forget: retention.forget,
    forgetScopes: retention.forgetScopes,
    revisions: memoryId => retention.isForgotten(memoryId) ? [] : db.prepare("SELECT body FROM memory_revisions WHERE memory_id=? ORDER BY version").all(memoryId)
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
      retention.assertCandidateWritable(record);
      db.prepare("INSERT INTO memory_candidates(candidate_id,actor_id,state,body) VALUES (?,?,?,?) ON CONFLICT(candidate_id) DO UPDATE SET state=excluded.state, body=excluded.body")
        .run(record.candidate_id, record.actor_id, record.state, JSON.stringify(record));
    }),
    dropCandidate: candidateId => { db.prepare("DELETE FROM memory_candidates WHERE candidate_id=?").run(candidateId); },
    changes: (actorId, limit) => db.prepare("SELECT body FROM memory_changes WHERE actor_id=? ORDER BY at DESC, rowid DESC LIMIT ?").all(actorId, limit)
      .map(row => visibleChange(JSON.parse(String(row.body)) as MemoryChangeRecord)),
    changesOf: memoryId => db.prepare("SELECT body FROM memory_changes WHERE memory_id=? ORDER BY at DESC, rowid DESC").all(memoryId)
      .map(row => visibleChange(JSON.parse(String(row.body)) as MemoryChangeRecord)),
    change: changeId => {
      const record = parse<MemoryChangeRecord>(db.prepare("SELECT body FROM memory_changes WHERE change_id=?").get(changeId));
      return record ? visibleChange(record) : null;
    },
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
    recordUses: uses => {
      const nested = depth > 0;
      return ledger.transaction(() => {
        try {
          const phase = ++receiptPhase;
          const facts = ledger.forgetting.read();
          receiptFacts.push(facts);
          // Freeze getter-backed inputs before querying identity sets. All caches die with this synchronous batch.
          const inputs = uses.map(use => ({ ...use })), memoryIds = inputs.map(use => use.memory_id);
          const forgotten = retention.forgottenIds(memoryIds, facts);
          const key = (use: Pick<MemoryUseRecord, "memory_id" | "receipt_id">) => JSON.stringify([use.memory_id, use.receipt_id]);
          const identities = [...new Map(inputs.filter(use => !forgotten.has(use.memory_id)).map(use => [key(use), use])).values()];
          const previous = new Map<string, MemoryUseRecord>();
          // Six write bindings per row remain below SQLite's binding limit; reads use the same bounded sets.
          const batchSize = 128;
          for (let offset = 0; offset < identities.length; offset += batchSize) {
            const batch = identities.slice(offset, offset + batchSize);
            for (const row of db.prepare(`WITH requested(memory_id,receipt_id) AS (VALUES ${batch.map(() => "(?,?)").join(",")})
              SELECT stored.memory_id,stored.receipt_id,stored.body FROM memory_uses AS stored JOIN requested
                ON stored.memory_id=requested.memory_id AND stored.receipt_id=requested.receipt_id`)
              .all(...batch.flatMap(use => [use.memory_id, use.receipt_id]))) {
              previous.set(key({ memory_id: String(row.memory_id), receipt_id: String(row.receipt_id) }), JSON.parse(String(row.body)) as MemoryUseRecord);
            }
          }
          const pending = new Map<string, { record: MemoryUseRecord; body: string; workId: string | null }>();
          for (const use of inputs) {
            // A late multi-reference receipt must not resurrect a forgotten entry or hide the other entries' facts.
            if (forgotten.has(use.memory_id)) continue;
            const identity = key(use), before = previous.get(identity);
            if (before?.source === "run-context") {
              if (use.source !== "run-context" || !isDeepStrictEqual([before.run, before.memory_version, before.at, before.consumer, before.work_id],
                [use.run, use.memory_version, use.at, use.consumer, use.work_id])) {
                throw Object.assign(new Error("同一记忆回执的执行与版本不能被替换"), { code: "memory.conflict" });
              }
              const rank = (state: MemoryUseRecord["state"]) => state === "response-observed" ? 3 : state === "dispatched-or-unknown" ? 2 : 1;
              if (rank(before.state) >= rank(use.state)) continue;
            }
            const body = JSON.stringify(use);
            // The next duplicate observes the same JSON record a per-row SQL read used to return.
            previous.set(identity, JSON.parse(body) as MemoryUseRecord);
            const staged = pending.get(identity);
            pending.set(identity, { record: use, body, workId: staged ? staged.workId : use.work_id });
          }
          const writes = [...pending.values()];
          for (let offset = 0; offset < writes.length; offset += batchSize) {
            const batch = writes.slice(offset, offset + batchSize);
            db.prepare(`INSERT INTO memory_uses(memory_id,receipt_id,at,work_id,state,body) VALUES ${batch.map(() => "(?,?,?,?,?,?)").join(",")}
              ON CONFLICT(memory_id,receipt_id) DO UPDATE SET at=excluded.at, state=excluded.state, body=excluded.body`)
              .run(...batch.flatMap(({ record, body, workId }) => [record.memory_id, record.receipt_id, record.at, workId, record.state, body]));
          }
          // Serialization or SQL hooks can reenter forgetting after the initial set query.
          if ([...retention.forgottenIds(memoryIds, facts)].some(memoryId => !forgotten.has(memoryId)))
            throw Object.assign(new Error("记忆回执提交前遗忘标记已变化"), { code: "memory.conflict" });
          // An outer caller may do more work after this phase; also recheck immediately before its COMMIT.
          if (nested) assertReceiptFacts(facts, ledger.forgetting.read());
          // A reentrant receipt writer invalidates prefetched rows, even if it touched no forgetting markers.
          if (phase !== receiptPhase)
            throw Object.assign(new Error("记忆回执批次期间有重入写入，原回执状态需要重新核验"), { code: "memory.conflict" });
        } catch (error) {
          receiptFailure ??= { error };
          throw error;
        }
      });
    },
    lastUse: memoryId => retention.isForgotten(memoryId) ? null : parse<MemoryUseRecord>(db.prepare("SELECT body FROM memory_uses WHERE memory_id=? AND state='response-observed' ORDER BY at DESC, rowid DESC LIMIT 1").get(memoryId)),
    uses: filter => {
      const where: string[] = [], values: string[] = [];
      if (filter.receipt_id) { where.push("receipt_id=?"); values.push(filter.receipt_id); }
      if (filter.work_id) { where.push("work_id=?"); values.push(filter.work_id); }
      if (filter.memory_id) { where.push("memory_id=?"); values.push(filter.memory_id); }
      return db.prepare(`SELECT body FROM memory_uses ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY at DESC, rowid DESC LIMIT ${Math.max(1, Math.min(500, filter.limit ?? 100))}`)
        .all(...values).map(row => JSON.parse(String(row.body)) as MemoryUseRecord).filter(one => !retention.isForgotten(one.memory_id));
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
    pairs: actorId => db.prepare("SELECT body FROM memory_pairs WHERE actor_id=? ORDER BY rowid").all(actorId).map(row => JSON.parse(String(row.body)) as ReturnType<MemoryLedgerPort["pairs"]>[number]).filter(one => !retention.isForgotten(one.a.memory_id) && !retention.isForgotten(one.b.memory_id)),
    savePair: (actorId, pair) => ledger.transaction(() => {
      retention.assertNotForgotten(pair.a.memory_id); retention.assertNotForgotten(pair.b.memory_id);
      db.prepare("INSERT INTO memory_pairs(pair_id,actor_id,state,body) VALUES (?,?,?,?) ON CONFLICT(pair_id) DO UPDATE SET state=excluded.state, body=excluded.body")
        .run(pair.pair_id, actorId, pair.state, JSON.stringify(pair));
    }),
    listMarkers: (actorId, input) => {
      if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 101 || !input.prefix.startsWith("memory-"))
        throw new Error("Memory marker discovery needs a bounded owner prefix");
      return db.prepare("SELECT key,at,body FROM memory_markers WHERE actor_id=? AND key>=? AND key<? AND key>? ORDER BY key LIMIT ?")
        .all(actorId, input.prefix, input.prefix + "\uffff", input.after ?? "", input.limit)
        .map(row => ({ key: String(row.key), at: String(row.at), body: JSON.parse(String(row.body)) as unknown }));
    },
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
      try {
        const result = work();
        if (receiptFailure) throw receiptFailure.error;
        if (receiptFacts.length) {
          const current = ledger.forgetting.read();
          for (const facts of receiptFacts) assertReceiptFacts(facts, current);
        }
        db.exec("COMMIT"); return result;
      }
      catch (error) { db.exec("ROLLBACK"); throw error; }
      finally { depth -= 1; receiptFacts = []; receiptFailure = undefined; receiptPhase = 0; }
    },
    close: () => { db.close(); closed = true; },
  };
  return ledger;
}

/** The memory ledger in the Home's store registry (W4-11). */
export const MEMORY_LEDGER_HOME_STORE: HomeStoreDeclaration = { path: MEMORY_LEDGER_STORE, library: { baseline: MEMORY_LEDGER_BASELINE } };

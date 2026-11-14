import { createHash } from "node:crypto";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import { openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import { OBSERVATION_LIMITS, type ObservationCoverageState } from "@molis-ai/molis-work-contracts/services/observation";
import { collectUnreferenced, resolveEvidence } from "./evidence.js";
import type { ObservationKeys } from "./keys.js";
import { clearProjectRows, purgePluginRows, type PluginPurge } from "./lifecycle.js";
import type { CoverageKey, ObservationEnvironment, PendingRecord } from "./records.js";
import { OBSERVATION_BASELINE, OBSERVATION_STORE } from "./schema.js";

export interface ObservationWriterOptions {
  readonly home: string;
  readonly env: ObservationEnvironment;
  /** The Home's evidence keys; `hasEvidence` tells them whether sealed bodies already exist. */
  readonly keys: (hasEvidence: () => boolean) => ObservationKeys;
  /** How long a record may wait before its batch is written (contract-design §9). */
  readonly flushDelayMs?: number;
  /** A batch is written at once when this many records wait. */
  readonly batchRows?: number;
  /** Records waiting beyond this are dropped and counted as lost: the queue never grows without bound. */
  readonly maxQueued?: number;
}

interface Gap { key: CoverageKey; state: ObservationCoverageState; reason: string; started: string; ended: string; count: number }
interface Tally { key: CoverageKey; truncated: number; redacted: number; by_rule: number }
interface Quota { day: string; facts: number; bytes: number; dirty: boolean }

const COALESCE_MS = 60_000;
/** Gaps of the same kind this close together are one stretch, so a flood of refusals is one row, not thousands. */
const GAP_JOIN_MS = 60_000;
const keyId = (key: CoverageKey) => JSON.stringify([key.owner, key.fact, key.entry, key.project_id]);
const WRITER_KEY: Omit<CoverageKey, "project_id"> = { owner: "observation", fact: "*", entry: "host" };

/**
 * The queue and its write batches (contract-design §6, §8, §9). `enqueue` only appends: it never reads, waits or throws, so no call is slowed
 * or failed by its record. A batch resolves the evidence, folds repeated reads, and updates the coverage register in one transaction; a batch
 * that cannot be written is counted as a `lost` stretch per coverage key, kept in memory until a later write succeeds.
 */
export class ObservationWriter {
  private db: DatabaseSync | undefined;
  private keys: ObservationKeys | undefined;
  private queue: PendingRecord[] = [];
  private gaps: Gap[] = [];
  private readonly folds = new Map<string, { record_id: string; at: number }>();
  private readonly quotas = new Map<string, Quota>();
  private readonly cleared = new Set<string>();
  private readonly statements = new Map<string, StatementSync>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;

  constructor(private readonly options: ObservationWriterOptions) {}

  enqueue(record: PendingRecord): void {
    if (this.closed) return;
    const project = record.row.project_id;
    if (project && this.cleared.has(project)) {
      if (this.options.env.projectClass(project) === undefined) return;
      this.cleared.delete(project);
    }
    if (this.queue.length >= (this.options.maxQueued ?? 10_000)) { this.gap(record.coverage, "lost", "queue_full", 1); return; }
    this.queue.push(record);
    if (this.queue.length >= (this.options.batchRows ?? 200)) this.flush();
    else this.schedule();
  }

  private schedule(): void {
    if (this.timer || this.closed) return;
    this.timer = setTimeout(() => { this.timer = undefined; this.flush(); }, this.options.flushDelayMs ?? 250);
    this.timer.unref?.();
  }

  /** Statements are prepared once per library connection. */
  private run(db: DatabaseSync, sql: string, ...values: (string | number | bigint | null | Uint8Array)[]) {
    let statement = this.statements.get(sql);
    if (!statement) this.statements.set(sql, statement = db.prepare(sql));
    return statement.run(...values);
  }

  /** A stretch of the register with no records, or records without content: joined with the last stretch of the same kind if close. */
  gap(key: CoverageKey, state: ObservationCoverageState, reason: string, count: number): void {
    const now = this.options.env.now().toISOString();
    const last = [...this.gaps].reverse().find(gap => keyId(gap.key) === keyId(key) && gap.state === state && gap.reason === reason);
    if (last && Date.parse(now) - Date.parse(last.ended) <= GAP_JOIN_MS) { last.ended = now; last.count += count; }
    else this.gaps.push({ key, state, reason, started: now, ended: now, count });
    this.schedule();
  }

  /**
   * Whether `reporter` may have `facts` more facts and `bytes` more content today (contract-design §4). Counted per UTC day in the library, so
   * a restart does not reset it. Past either limit the report is turned down and one `lost` stretch is kept for the reporter alone.
   */
  admit(reporter: string, key: CoverageKey, facts: number, bytes: number): boolean {
    const day = this.options.env.now().toISOString().slice(0, 10);
    let quota = this.quotas.get(reporter);
    if (!quota || quota.day !== day) {
      const row = this.tryOpen()?.prepare("SELECT facts, bytes FROM report_quota WHERE reporter = ? AND day = ?").get(reporter, day) as { facts: number; bytes: number } | undefined;
      quota = { day, facts: row?.facts ?? 0, bytes: row?.bytes ?? 0, dirty: false };
      this.quotas.set(reporter, quota);
    }
    if (quota.facts + facts > OBSERVATION_LIMITS.facts_per_reporter_day || quota.bytes + bytes > OBSERVATION_LIMITS.content_bytes_per_reporter_day) {
      this.gap(key, "lost", "report_quota", facts);
      return false;
    }
    quota.facts += facts; quota.bytes += bytes; quota.dirty = true;
    return true;
  }

  /** Write what waits. Never throws: a failure becomes a `lost` stretch for each key of the batch. */
  flush(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    const batch = this.queue; this.queue = [];
    const db = this.tryOpen();
    if (!db) { this.lose(batch, "store_unavailable"); return; }
    const now = this.options.env.now().toISOString(), gaps = this.gaps.splice(0);
    const quotas = [...this.quotas].filter(([, quota]) => quota.dirty);
    try {
      db.exec("BEGIN IMMEDIATE");
      const tallies = new Map<string, Tally>();
      for (const record of batch) this.write(db, record, now, tallies);
      for (const tally of tallies.values()) this.cover(db, tally, now);
      for (const gap of [...gaps, ...this.gaps.splice(0)]) this.writeGap(db, gap);
      for (const [reporter, quota] of quotas) this.run(db, "INSERT INTO report_quota (reporter, day, facts, bytes) VALUES (?, ?, ?, ?) ON CONFLICT (reporter, day) DO UPDATE SET facts = excluded.facts, bytes = excluded.bytes",
        reporter, quota.day, quota.facts, quota.bytes);
      this.run(db, "INSERT INTO writer_state (key, value) VALUES ('last_write_at', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", now);
      db.exec("COMMIT");
      for (const [, quota] of quotas) quota.dirty = false;
    } catch {
      try { db.exec("ROLLBACK"); } catch { /* the transaction was not open: nothing to roll back */ }
      // What was folded into a record of this batch would point at nothing; stretches already counted wait for the next write.
      this.folds.clear();
      this.gaps.unshift(...gaps);
      this.lose(batch, "write_failed");
    }
  }

  private write(db: DatabaseSync, record: PendingRecord, now: string, tallies: Map<string, Tally>): void {
    const keys = this.keys!;
    const resolved = resolveEvidence(db, keys, record.evidence, now);
    const tally = tallies.get(keyId(record.coverage)) ?? { key: record.coverage, truncated: 0, redacted: 0, by_rule: 0 };
    tally.truncated += resolved.truncated + (record.cut ? 1 : 0); tally.redacted += resolved.redacted; tally.by_rule += resolved.by_rule;
    tallies.set(keyId(record.coverage), tally);
    if (resolved.unavailable) this.gaps.push({ key: record.coverage, state: "unavailable", reason: "evidence_key", started: now, ended: now, count: resolved.unavailable });
    if (record.coalesce_key) {
      const fold = createHash("sha256").update(record.coalesce_key).update(resolved.digests.join(",")).digest("hex");
      const at = Date.parse(record.row.occurred_at), held = this.folds.get(fold);
      if (held && at - held.at <= COALESCE_MS) {
        this.run(db, "UPDATE records SET coalesced_count = COALESCE(coalesced_count, 1) + 1, coalesced_last_at = ? WHERE record_id = ?", record.row.occurred_at, held.record_id);
        return;
      }
      this.folds.set(fold, { record_id: record.row.record_id, at });
      if (this.folds.size > 4096) for (const [key, value] of this.folds) if (at - value.at > COALESCE_MS) this.folds.delete(key);
    }
    const row = { ...record.row, evidence: JSON.stringify(resolved.evidence) };
    const columns = Object.keys(row);
    const inserted = this.run(db, `INSERT INTO records (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`, ...Object.values(row));
    for (const digest of resolved.kept) this.run(db, "INSERT OR IGNORE INTO record_evidence (seq, digest) VALUES (?, ?)", inserted.lastInsertRowid, digest);
  }

  private cover(db: DatabaseSync, tally: Tally, now: string): void {
    const { key } = tally;
    this.run(db, `INSERT INTO coverage (owner, fact, entry, project_id, state, since, since_version, reason, truncated, redacted, by_rule, updated_at)
      VALUES (?, ?, ?, ?, 'complete', ?, ?, NULL, ?, ?, ?, ?)
      ON CONFLICT (owner, fact, entry, project_id) DO UPDATE SET state = 'complete', reason = NULL, truncated = truncated + excluded.truncated,
        redacted = redacted + excluded.redacted, by_rule = by_rule + excluded.by_rule, updated_at = excluded.updated_at`,
      key.owner, key.fact, key.entry, key.project_id, now, this.options.env.platformVersion, tally.truncated, tally.redacted, tally.by_rule, now);
  }

  private writeGap(db: DatabaseSync, gap: Gap): void {
    const { key } = gap;
    this.run(db, "INSERT INTO coverage_gaps (owner, fact, entry, project_id, state, started_at, ended_at, count, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      key.owner, key.fact, key.entry, key.project_id, gap.state, gap.started, gap.ended, gap.count, gap.reason);
    this.run(db, `INSERT INTO coverage (owner, fact, entry, project_id, state, since, since_version, reason, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (owner, fact, entry, project_id) DO UPDATE SET state = excluded.state, reason = excluded.reason, updated_at = excluded.updated_at`,
      key.owner, key.fact, key.entry, key.project_id, gap.state, gap.started, this.options.env.platformVersion, gap.reason, gap.ended);
  }

  /** Records that could not be written: counted per key and kept as stretches until a write succeeds (OCL-15). */
  private lose(batch: readonly PendingRecord[], reason: string): void {
    for (const record of batch) this.gap(record.coverage, "lost", reason, 1);
  }

  /**
   * The library, opened on first use. A run that ended without writing its queue is found here: `open` still says so, and the stretch from
   * the last write to now is kept as lost for an unknown reason (contract-design §8).
   */
  private tryOpen(): DatabaseSync | undefined {
    if (this.db) return this.db;
    try {
      const db = openBaselineHomeSqlite(this.options.home, OBSERVATION_STORE, OBSERVATION_BASELINE);
      const state = (key: string) => (db.prepare("SELECT value FROM writer_state WHERE key = ?").get(key) as { value: string } | undefined)?.value;
      const now = this.options.env.now().toISOString();
      if (state("open") === "1") this.gaps.push({ key: { ...WRITER_KEY, project_id: "" }, state: "lost", reason: "unknown_exit", started: state("last_write_at") ?? now, ended: now, count: 0 });
      db.prepare("INSERT INTO writer_state (key, value) VALUES ('open', '1') ON CONFLICT (key) DO UPDATE SET value = '1'").run();
      this.keys = this.options.keys(() => db.prepare("SELECT 1 FROM evidence_blobs LIMIT 1").get() !== undefined);
      return this.db = db;
    } catch {
      return undefined;
    }
  }

  /** The library for reads and the lifecycle hooks; undefined when it cannot be opened. */
  database(): { db: DatabaseSync; keys: ObservationKeys } | undefined {
    const db = this.tryOpen();
    return db ? { db, keys: this.keys! } : undefined;
  }

  /**
   * A project was deleted (contract-design §6, `ProjectDeletedOwner`): drop what waits for it, delete what is kept, and turn its writes away
   * until the catalog has a project of this id again. Idempotent; throws when the library cannot be written, so deletion retries it.
   */
  clearProject(projectId: string): void {
    this.cleared.add(projectId);
    this.queue = this.queue.filter(record => record.row.project_id !== projectId);
    this.gaps = this.gaps.filter(gap => gap.key.project_id !== projectId);
    for (const [fold] of this.folds) this.folds.delete(fold);
    this.flush();
    const db = this.tryOpen();
    if (!db) throw new Error("observation store unavailable");
    clearProjectRows(db, projectId);
    collectUnreferenced(db);
  }

  /** The person cleared a plugin's data (contract-design §6): its own records go, and the content of the calls it answered or made. */
  purgePlugin(purge: PluginPurge): void {
    // What waits is written first, so the clean-up below sees it: its calls keep their rows, their content goes like the rest.
    this.folds.clear();
    this.flush();
    const db = this.tryOpen();
    if (!db) throw new Error("observation store unavailable");
    purgePluginRows(db, purge, this.options.env.now().toISOString());
    collectUnreferenced(db);
  }

  /** Write what waits and mark the run as ended cleanly. */
  close(): void {
    if (this.closed) return;
    this.flush();
    this.closed = true;
    try { this.db?.prepare("UPDATE writer_state SET value = '0' WHERE key = 'open'").run(); } catch { /* a closing Home: the next start reports the stretch */ }
    this.statements.clear();
    this.db?.close();
    this.db = undefined;
  }
}

import type { DatabaseSync } from "node:sqlite";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  OBSERVATION_RETENTION_NEEDS,
  type ObservationHoldListInput,
  type ObservationHoldListOutput,
  type ObservationHoldPutInput,
  type ObservationHoldPutResult,
  type ObservationHoldReleaseInput,
  type ObservationHoldReleaseResult,
  type ObservationHoldView,
} from "@molis-ai/molis-work-contracts/services/observation";
import { assertPersonCaller, authorizeObservationUse, resolveLiveReadableProjects } from "./access.js";
import { observationErrors } from "./errors.js";
import { readStoredSettings } from "./management-state.js";
import { BLOB_STORED_BYTES_SQL, RECORD_ROW_BYTES_SQL, rowsAs } from "./queries.js";
import type { ObservationEnvironment } from "./records.js";
import type { ObservationWriter } from "./writer.js";

const DAY_MS = 86_400_000;
const DEFAULT_RETENTION_DAYS = OBSERVATION_RETENTION_NEEDS.evaluation_samples;

export interface HoldActionDeps {
  readonly env: ObservationEnvironment;
  readonly writer: ObservationWriter;
}

interface StoredHoldRow {
  readonly hold_id: string;
  readonly owner: string;
  readonly sample_id: string;
  readonly project_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly expires_at: string | null;
  readonly note: string | null;
}

interface HoldRecordJoinRow {
  readonly record_id: string;
  readonly seq: number | null;
  readonly live_seq: number | null;
}

function openForHolds(writer: ObservationWriter): DatabaseSync {
  writer.flush();
  const opened = writer.database();
  if (!opened) throw observationErrors.store_unavailable("工作记录库当前不可用");
  return opened.db;
}

function normalizeExpiresAt(raw: string | null | undefined, now: Date): string | null {
  if (raw === null) return null;
  if (raw === undefined) {
    return new Date(now.getTime() + DEFAULT_RETENTION_DAYS * DAY_MS).toISOString();
  }
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) {
    const ms = Date.parse(`${trimmed}T23:59:59.999Z`);
    if (!Number.isFinite(ms)) throw observationErrors.invalid_query("留存到期日期格式无效");
    return new Date(ms).toISOString();
  }
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) throw observationErrors.invalid_query("留存到期时间格式无效");
  return new Date(ms).toISOString();
}

function measureSeqsBytes(db: DatabaseSync, seqs: readonly number[]): number {
  if (seqs.length === 0) return 0;
  const uniqueSeqs = [...new Set(seqs)];
  const rowStmt = db.prepare(`SELECT ${RECORD_ROW_BYTES_SQL} AS row_bytes FROM records WHERE seq = ?`);
  const refStmt = db.prepare("SELECT digest FROM record_evidence WHERE seq = ?");
  const blobStmt = db.prepare(`SELECT ${BLOB_STORED_BYTES_SQL} AS stored_bytes FROM evidence_blobs WHERE digest = ?`);

  let bytes = 0;
  const digests = new Set<string>();
  for (const seq of uniqueSeqs) {
    const rec = rowStmt.get(seq) as { row_bytes: number } | undefined;
    if (rec) bytes += rec.row_bytes;
    for (const ref of rowsAs<{ digest: string }>(refStmt.all(seq))) digests.add(ref.digest);
  }
  for (const digest of digests) {
    const blob = blobStmt.get(digest) as { stored_bytes: number } | undefined;
    if (blob) bytes += blob.stored_bytes;
  }
  return bytes;
}

/** Return the set of live `records.seq` values currently protected by at least one unexpired evaluation hold. */
export function activeHeldSeqSet(db: DatabaseSync, nowIso: string): Set<number> {
  const rows = rowsAs<{ seq: number }>(db.prepare(`
    SELECT DISTINCT r.seq AS seq
    FROM evaluation_holds h
    JOIN evaluation_hold_records hr ON hr.hold_id = h.hold_id
    JOIN records r ON r.seq = hr.seq AND r.record_id = hr.record_id
    WHERE h.expires_at IS NULL OR h.expires_at > ?
  `).all(nowIso));
  return new Set(rows.map((row) => row.seq));
}

/** Count distinct active `sample_id`s whose held live records intersect `seqs` (used by clean-up preview). */
export function activeHeldSampleCountForSeqs(db: DatabaseSync, seqs: readonly number[], nowIso: string): number {
  if (seqs.length === 0) return 0;
  const target = new Set(seqs);
  const rows = rowsAs<{ sample_id: string; seq: number }>(db.prepare(`
    SELECT h.sample_id AS sample_id, r.seq AS seq
    FROM evaluation_holds h
    JOIN evaluation_hold_records hr ON hr.hold_id = h.hold_id
    JOIN records r ON r.seq = hr.seq AND r.record_id = hr.record_id
    WHERE h.expires_at IS NULL OR h.expires_at > ?
  `).all(nowIso));
  const samples = new Set<string>();
  for (const row of rows) {
    if (target.has(row.seq)) samples.add(row.sample_id);
  }
  return samples.size;
}

/** Compute the summary `{ count, bytes, retention_days }` of active evaluation sample holds across the Home (or readable projects). */
export function computeEvaluationHoldsSummary(
  db: DatabaseSync,
  nowIso: string,
  readableProjects?: ReadonlySet<string>,
): { readonly count: number; readonly bytes: number; readonly retention_days: number } {
  const rows = rowsAs<{ sample_id: string; seq: number; project_id: string | null }>(db.prepare(`
    SELECT h.sample_id AS sample_id, r.seq AS seq, r.project_id AS project_id
    FROM evaluation_holds h
    JOIN evaluation_hold_records hr ON hr.hold_id = h.hold_id
    JOIN records r ON r.seq = hr.seq AND r.record_id = hr.record_id
    WHERE (h.expires_at IS NULL OR h.expires_at > ?)
      AND (h.project_id IS NULL OR r.project_id = h.project_id)
  `).all(nowIso));

  const samples = new Set<string>();
  const seqs: number[] = [];
  for (const row of rows) {
    if (readableProjects && row.project_id !== null && !readableProjects.has(row.project_id)) continue;
    samples.add(row.sample_id);
    seqs.push(row.seq);
  }
  return {
    count: samples.size,
    bytes: measureSeqsBytes(db, seqs),
    retention_days: DEFAULT_RETENTION_DAYS,
  };
}

function buildHoldView(db: DatabaseSync, row: StoredHoldRow, nowIso: string): ObservationHoldView {
  const recRows = rowsAs<HoldRecordJoinRow>(db.prepare(`
    SELECT hr.record_id AS record_id, hr.seq AS seq, r.seq AS live_seq
    FROM evaluation_hold_records hr
    LEFT JOIN records r ON r.seq = hr.seq AND r.record_id = hr.record_id
    WHERE hr.hold_id = ?
    ORDER BY hr.rowid
  `).all(row.hold_id));

  const liveSeqs = recRows.map((item) => item.live_seq).filter((seq): seq is number => typeof seq === "number");
  const expired = row.expires_at !== null && row.expires_at <= nowIso;
  return {
    hold_id: row.hold_id,
    owner: row.owner,
    sample_id: row.sample_id,
    project_id: row.project_id,
    record_ids: recRows.map((item) => item.record_id),
    active_record_count: expired ? 0 : liveSeqs.length,
    bytes: measureSeqsBytes(db, liveSeqs),
    created_at: row.created_at,
    updated_at: row.updated_at,
    expires_at: row.expires_at,
    expired,
    ...(row.note !== null ? { note: row.note } : {}),
  };
}

export async function handleHoldsPut(
  deps: HoldActionDeps,
  caller: ActionCallContext,
  input: ObservationHoldPutInput,
): Promise<ObservationHoldPutResult> {
  assertPersonCaller(caller);
  const db = openForHolds(deps.writer);
  authorizeObservationUse(caller, "evaluation", readStoredSettings(db));

  const readable = await resolveLiveReadableProjects(deps.env);
  if (typeof input.project_id === "string" && readable && !readable.has(input.project_id)) {
    throw observationErrors.forbidden("所选项目不存在、已删除或正在关闭");
  }

  const now = deps.env.now();
  const nowIso = now.toISOString();
  const expiresAt = normalizeExpiresAt(input.expires_at, now);
  const owner = (input.owner ?? "system.evaluation").trim();
  const recordIds = [...new Set(input.record_ids)];

  const findRecord = db.prepare("SELECT seq, project_id FROM records WHERE record_id = ?");
  const held_record_ids: string[] = [];
  const missing_record_ids: string[] = [];
  const resolvedRecords: { readonly record_id: string; readonly seq: number | null }[] = [];
  const seenProjects = new Set<string | null>();

  for (const recordId of recordIds) {
    const found = findRecord.get(recordId) as { seq: number; project_id: string | null } | undefined;
    if (!found) {
      missing_record_ids.push(recordId);
      resolvedRecords.push({ record_id: recordId, seq: null });
      continue;
    }
    if (found.project_id !== null && readable && !readable.has(found.project_id)) {
      throw observationErrors.forbidden("留存记录所属项目已删除或正在关闭");
    }
    if (input.project_id !== undefined && found.project_id !== input.project_id) {
      throw observationErrors.forbidden("留存记录不属于指定的项目范围");
    }
    seenProjects.add(found.project_id);
    held_record_ids.push(recordId);
    resolvedRecords.push({ record_id: recordId, seq: found.seq });
  }

  const resolvedProjectId: string | null = input.project_id !== undefined
    ? input.project_id
    : (seenProjects.size === 1 ? [...seenProjects][0]! : null);

  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = db.prepare("SELECT created_at, owner, sample_id FROM evaluation_holds WHERE hold_id = ?")
      .get(input.hold_id) as Pick<StoredHoldRow, "created_at" | "owner" | "sample_id"> | undefined;
    if (input.require_same_identity && existing && (existing.owner !== owner || existing.sample_id !== input.sample_id)) {
      throw observationErrors.invalid_query("留存标识已属于其他主人或样本版本");
    }
    const createdAt = existing?.created_at ?? nowIso;
    db.prepare(`
      INSERT INTO evaluation_holds (hold_id, owner, sample_id, project_id, created_at, updated_at, expires_at, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (hold_id) DO UPDATE SET
        owner = excluded.owner,
        sample_id = excluded.sample_id,
        project_id = excluded.project_id,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at,
        note = excluded.note
    `).run(input.hold_id, owner, input.sample_id, resolvedProjectId, createdAt, nowIso, expiresAt, input.note ?? null);

    db.prepare("DELETE FROM evaluation_hold_records WHERE hold_id = ?").run(input.hold_id);
    const insertRec = db.prepare("INSERT INTO evaluation_hold_records (hold_id, record_id, seq) VALUES (?, ?, ?)");
    for (const item of resolvedRecords) {
      insertRec.run(input.hold_id, item.record_id, item.seq);
    }
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* already rolled back */ }
    throw error;
  }

  const storedRow = rowsAs<StoredHoldRow>(db.prepare("SELECT * FROM evaluation_holds WHERE hold_id = ?").all(input.hold_id))[0]!;
  return {
    hold: buildHoldView(db, storedRow, nowIso),
    held_record_ids,
    missing_record_ids,
  };
}

export function handleHoldsRelease(
  deps: HoldActionDeps,
  caller: ActionCallContext,
  input: ObservationHoldReleaseInput,
): ObservationHoldReleaseResult {
  assertPersonCaller(caller);
  if (input.hold_id === undefined && input.sample_id === undefined && input.targets === undefined) {
    throw observationErrors.invalid_query("释放留存需要指定保留标识、样本或确切的保留对象");
  }
  const db = openForHolds(deps.writer);
  const where: string[] = [];
  const params: string[] = [];
  if (input.hold_id !== undefined) {
    where.push("hold_id = ?");
    params.push(input.hold_id);
  }
  if (input.sample_id !== undefined) {
    where.push("sample_id = ?");
    params.push(input.sample_id);
  }

  if (input.targets !== undefined) {
    where.push(`(hold_id, owner, sample_id) IN (
      SELECT json_extract(value, '$.hold_id'), json_extract(value, '$.owner'), json_extract(value, '$.sample_id')
      FROM json_each(?)
    )`);
    params.push(JSON.stringify(input.targets));
  }
  let released_record_count = 0;
  const released_hold_ids: string[] = [];
  db.exec("BEGIN IMMEDIATE");
  try {
    const targets = rowsAs<{ hold_id: string }>(
      db.prepare(`SELECT hold_id FROM evaluation_holds WHERE ${where.join(" AND ")} ORDER BY hold_id`).all(...params),
    );
    const delRecs = db.prepare("DELETE FROM evaluation_hold_records WHERE hold_id = ?");
    const delHold = db.prepare("DELETE FROM evaluation_holds WHERE hold_id = ?");
    for (const target of targets) {
      released_record_count += Number(delRecs.run(target.hold_id).changes);
      delHold.run(target.hold_id);
      released_hold_ids.push(target.hold_id);
    }
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* already rolled back */ }
    throw error;
  }

  return {
    released_hold_ids,
    released_record_count,
  };
}

export async function handleHoldsList(
  deps: HoldActionDeps,
  caller: ActionCallContext,
  input: ObservationHoldListInput,
): Promise<ObservationHoldListOutput> {
  assertPersonCaller(caller);
  const db = openForHolds(deps.writer);
  authorizeObservationUse(caller, "evaluation", readStoredSettings(db));

  const readable = await resolveLiveReadableProjects(deps.env);
  if (typeof input.project_id === "string" && readable && !readable.has(input.project_id)) {
    throw observationErrors.forbidden("所选项目不存在、已删除或正在关闭");
  }

  const nowIso = deps.env.now().toISOString();
  const where: string[] = [];
  const params: string[] = [];
  if (input.project_id !== undefined) {
    if (input.project_id === null) where.push("project_id IS NULL");
    else { where.push("project_id = ?"); params.push(input.project_id); }
  }
  if (input.sample_id !== undefined) {
    where.push("sample_id = ?");
    params.push(input.sample_id);
  }
  if (input.include_expired !== true) {
    where.push("(expires_at IS NULL OR expires_at > ?)");
    params.push(nowIso);
  }

  const rows = rowsAs<StoredHoldRow>(
    db.prepare(`SELECT * FROM evaluation_holds ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC, hold_id ASC`).all(...params),
  ).filter((row) => !(readable && row.project_id !== null && !readable.has(row.project_id)));

  return {
    holds: rows.map((row) => buildHoldView(db, row, nowIso)),
    summary: computeEvaluationHoldsSummary(db, nowIso, readable),
  };
}

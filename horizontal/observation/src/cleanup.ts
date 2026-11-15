import type { DatabaseSync } from "node:sqlite";
import {
  OBSERVATION_RECORD_KINDS,
  OBSERVATION_RETENTION_NEEDS,
  type ObservationCleanupPreview,
  type ObservationCleanupResult,
  type ObservationCleanupScopeInput,
  type ObservationRecordKind,
} from "@molis-ai/molis-work-contracts/services/observation";
import { classifyRecordKind } from "./classification.js";
import { observationErrors } from "./errors.js";
import { collectUnreferenced } from "./evidence.js";
import { readStoredSettings, retentionDaysOf, writeStoredSettings } from "./management-state.js";
import { rowsAs } from "./queries.js";

const DAY_MS = 86_400_000;

export const RECORD_ROW_BYTES_SQL = `
  (64
   + LENGTH(CAST(record_id AS BLOB))
   + LENGTH(CAST(fact AS BLOB))
   + LENGTH(CAST(subjects AS BLOB))
   + LENGTH(CAST(conditions AS BLOB))
   + LENGTH(CAST(detail AS BLOB))
   + LENGTH(CAST(evidence AS BLOB)))
`;

export const BLOB_STORED_BYTES_SQL = `(32 + LENGTH(CAST(digest AS BLOB)) + LENGTH(body))`;

function parseIsoTimestamp(raw: string, endOfDayForDateOnly = false): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) {
    const expanded = endOfDayForDateOnly ? `${trimmed}T23:59:59.999Z` : `${trimmed}T00:00:00.000Z`;
    const ms = Date.parse(expanded);
    if (!Number.isFinite(ms)) throw observationErrors.invalid_query("日期格式无效");
    return new Date(ms).toISOString();
  }
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) throw observationErrors.invalid_query("时间格式无效");
  return new Date(ms).toISOString();
}

export interface ResolvedCleanupScope {
  readonly scope: ObservationCleanupPreview["scope"];
  readonly resolved_since?: string;
  readonly resolved_until: string;
  readonly inclusive_until: boolean;
  readonly kinds: readonly ObservationRecordKind[];
}

export function resolveCleanupScope(input: ObservationCleanupScopeInput, now: Date): ResolvedCleanupScope {
  const nowMs = now.getTime();
  let resolved_since: string | undefined;
  let resolved_until: string;
  let inclusive_until = false;

  if (input.time_range === "before_90d") {
    resolved_until = new Date(nowMs - 90 * DAY_MS).toISOString();
  } else if (input.time_range === "before_30d") {
    resolved_until = new Date(nowMs - 30 * DAY_MS).toISOString();
  } else if (input.time_range === "before_7d") {
    resolved_until = new Date(nowMs - 7 * DAY_MS).toISOString();
  } else {
    if (input.since !== undefined || input.until !== undefined) {
      if (!input.until) throw observationErrors.invalid_query("自定义时间段需要指定结束时间");
      resolved_until = parseIsoTimestamp(input.until, true);
      inclusive_until = true;
      if (input.since !== undefined) {
        resolved_since = parseIsoTimestamp(input.since, false);
        if (Date.parse(resolved_since) > Date.parse(resolved_until)) {
          throw observationErrors.invalid_query("起始时间不能晚于结束时间");
        }
      }
    } else if (input.before !== undefined) {
      resolved_until = parseIsoTimestamp(input.before, false);
    } else {
      throw observationErrors.invalid_query("自定义清理范围需要提供 before 或 until");
    }
  }

  const kinds: readonly ObservationRecordKind[] = input.kinds === undefined
    ? [...OBSERVATION_RECORD_KINDS]
    : [...new Set(input.kinds)];

  return {
    resolved_since,
    resolved_until,
    inclusive_until,
    kinds,
    scope: {
      ...input,
      ...(resolved_since ? { resolved_since } : {}),
      resolved_until,
      kinds,
    },
  };
}

interface CandidateRow {
  readonly seq: number;
  readonly owner_kind: "plugin" | "service" | "shell";
  readonly owner_id: string | null;
  readonly fact: string;
  readonly entry: string;
  readonly audience: string;
  readonly source_class: string;
  readonly provider_id: string | null;
  readonly operation: string | null;
  readonly occurred_at: string;
  readonly row_bytes: number;
}

function selectMatchingCandidates(db: DatabaseSync, resolved: ResolvedCleanupScope): CandidateRow[] {
  if (resolved.kinds.length === 0) return [];
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (resolved.resolved_since !== undefined) {
    where.push("occurred_at >= ?");
    params.push(resolved.resolved_since);
  }
  where.push(resolved.inclusive_until ? "occurred_at <= ?" : "occurred_at < ?");
  params.push(resolved.resolved_until);

  if (resolved.scope.project_id !== undefined) {
    if (resolved.scope.project_id === null) where.push("project_id IS NULL");
    else { where.push("project_id = ?"); params.push(resolved.scope.project_id); }
  }

  const rows = rowsAs<CandidateRow>(db.prepare(`
    SELECT seq, owner_kind, owner_id, fact, entry, audience, source_class, provider_id,
           json_extract(detail, '$.operation') AS operation, occurred_at, ${RECORD_ROW_BYTES_SQL} AS row_bytes
    FROM records
    WHERE ${where.join(" AND ")}
    ORDER BY seq
  `).all(...params));

  if (resolved.kinds.length === OBSERVATION_RECORD_KINDS.length) return rows;
  const kindSet = new Set<ObservationRecordKind>(resolved.kinds);
  return rows.filter((row) => kindSet.has(classifyRecordKind({
    owner_kind: row.owner_kind,
    owner_id: row.owner_id,
    fact: row.fact,
    entry: row.entry,
    audience: row.audience,
    source_class: row.source_class,
    provider_id: row.provider_id,
    ...(row.operation ? { operation: row.operation } : {}),
  })));
}

function measureUnreferencedBlobs(db: DatabaseSync, seqs: readonly number[]): { count: number; bytes: number } {
  if (seqs.length === 0) return { count: 0, bytes: 0 };
  const targetSeqs = new Set(seqs);
  const candidateDigests = new Set<string>();
  const stmt = db.prepare("SELECT digest FROM record_evidence WHERE seq = ?");
  for (const seq of seqs) {
    for (const row of rowsAs<{ digest: string }>(stmt.all(seq))) candidateDigests.add(row.digest);
  }
  if (candidateDigests.size === 0) return { count: 0, bytes: 0 };
  const refsStmt = db.prepare("SELECT seq FROM record_evidence WHERE digest = ?");
  const sizeStmt = db.prepare(`SELECT ${BLOB_STORED_BYTES_SQL} AS stored_bytes FROM evidence_blobs WHERE digest = ?`);
  let count = 0;
  let bytes = 0;
  for (const digest of candidateDigests) {
    const refs = rowsAs<{ seq: number }>(refsStmt.all(digest));
    if (refs.every((ref) => targetSeqs.has(ref.seq))) {
      const blob = sizeStmt.get(digest) as { stored_bytes: number } | undefined;
      if (blob) {
        count += 1;
        bytes += blob.stored_bytes;
      }
    }
  }
  return { count, bytes };
}

export function previewCleanup(db: DatabaseSync, input: ObservationCleanupScopeInput, now: Date): ObservationCleanupPreview {
  const resolved = resolveCleanupScope(input, now);
  const matching = selectMatchingCandidates(db, resolved);
  const recordBytes = matching.reduce((sum, row) => sum + row.row_bytes, 0);
  const unref = measureUnreferencedBlobs(db, matching.map((row) => row.seq));
  const stored = readStoredSettings(db);
  const compareCutoffMs = now.getTime() - OBSERVATION_RETENTION_NEEDS.cross_period_compare * DAY_MS;
  const comparisonAffected = matching.length > 0 && Date.parse(resolved.resolved_until) > compareCutoffMs;

  return {
    scope: resolved.scope,
    matching_records: matching.length,
    estimated_freed_bytes: recordBytes + unref.bytes,
    unreferenced_snapshots: unref.count,
    preserved: {
      business_objects: true,
      pages_versions: true,
      saved_briefs: true,
      evaluation_samples_count: 0,
    },
    impacts: [
      { impact: "timeline_expired_gap", affected: matching.length > 0 },
      { impact: "comparison_basis_lost", affected: comparisonAffected },
      { impact: "evaluation_samples_kept", affected: stored.uses.evaluation },
    ],
  };
}

function executeCleanupCandidates(
  db: DatabaseSync,
  matching: readonly CandidateRow[],
  options: {
    readonly project_id: string;
    readonly started_at: string;
    readonly ended_at: string;
    readonly reason: "manual_cleanup" | "retention_expired";
    readonly entry: "workbench" | "host";
    readonly cleaned_at: string;
  },
): ObservationCleanupResult {
  if (matching.length === 0) {
    return {
      deleted_records: 0,
      deleted_snapshots: 0,
      freed_bytes: 0,
      gap_recorded: false,
      cleaned_at: options.cleaned_at,
    };
  }
  const recordBytes = matching.reduce((sum, row) => sum + row.row_bytes, 0);
  const beforeBlobs = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(${BLOB_STORED_BYTES_SQL}), 0) AS bytes FROM evidence_blobs`).get() as { count: number; bytes: number };

  db.exec("BEGIN IMMEDIATE");
  try {
    const unlinkStmt = db.prepare("DELETE FROM record_evidence WHERE seq = ?");
    const deleteStmt = db.prepare("DELETE FROM records WHERE seq = ?");
    for (const row of matching) {
      unlinkStmt.run(row.seq);
      deleteStmt.run(row.seq);
    }
    collectUnreferenced(db);
    const afterBlobs = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(${BLOB_STORED_BYTES_SQL}), 0) AS bytes FROM evidence_blobs`).get() as { count: number; bytes: number };
    const deleted_snapshots = Math.max(0, beforeBlobs.count - afterBlobs.count);
    const freed_bytes = recordBytes + Math.max(0, beforeBlobs.bytes - afterBlobs.bytes);

    db.prepare(
      "INSERT INTO coverage_gaps (owner, fact, entry, project_id, state, started_at, ended_at, count, reason) VALUES ('observation', '*', ?, ?, 'expired', ?, ?, ?, ?)",
    ).run(options.entry, options.project_id, options.started_at, options.ended_at, matching.length, options.reason);

    const currentSettings = readStoredSettings(db);
    writeStoredSettings(db, {
      ...currentSettings,
      last_cleanup: {
        at: options.cleaned_at,
        deleted_records: matching.length,
        freed_bytes,
      },
    });
    db.exec("COMMIT");
    return {
      deleted_records: matching.length,
      deleted_snapshots,
      freed_bytes,
      gap_recorded: true,
      cleaned_at: options.cleaned_at,
    };
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* already rolled back */ }
    throw error;
  }
}

export function applyCleanup(db: DatabaseSync, input: ObservationCleanupScopeInput, now: Date): ObservationCleanupResult {
  const resolved = resolveCleanupScope(input, now);
  const matching = selectMatchingCandidates(db, resolved);
  const cleaned_at = now.toISOString();
  const earliestMatched = matching.reduce<string>((min, row) => (row.occurred_at < min ? row.occurred_at : min), resolved.resolved_until);
  return executeCleanupCandidates(db, matching, {
    project_id: input.project_id ?? "",
    started_at: resolved.resolved_since ?? earliestMatched,
    ended_at: resolved.resolved_until,
    reason: "manual_cleanup",
    entry: "workbench",
    cleaned_at,
  });
}

/**
 * Automatic retention sweep (OCL-12): when `retention_mode` is a day period (`365`, `180`, `90`, `30`), remove expired records
 * in one transaction, collect unreferenced snapshots, and record an `expired` stretch (`retention_expired`). Never runs for `keep` or `manual`.
 */
export function sweepExpiredRecords(db: DatabaseSync, now: Date): ObservationCleanupResult | null {
  const stored = readStoredSettings(db);
  const days = retentionDaysOf(stored.retention_mode);
  if (days === null) return null;
  const cutoff = new Date(now.getTime() - days * DAY_MS).toISOString();
  const resolved: ResolvedCleanupScope = {
    resolved_until: cutoff,
    inclusive_until: false,
    kinds: [...OBSERVATION_RECORD_KINDS],
    scope: { time_range: "custom", before: cutoff, resolved_until: cutoff, kinds: [...OBSERVATION_RECORD_KINDS] },
  };
  const matching = selectMatchingCandidates(db, resolved);
  if (matching.length === 0) return null;
  const earliestMatched = matching.reduce<string>((min, row) => (row.occurred_at < min ? row.occurred_at : min), cutoff);
  return executeCleanupCandidates(db, matching, {
    project_id: "",
    started_at: earliestMatched,
    ended_at: cutoff,
    reason: "retention_expired",
    entry: "host",
    cleaned_at: now.toISOString(),
  });
}

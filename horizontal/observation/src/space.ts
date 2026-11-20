import type { DatabaseSync } from "node:sqlite";
import {
  OBSERVATION_RECORD_KINDS,
  type ObservationRecordKind,
  type ObservationSpaceView,
} from "@molis-ai/molis-work-contracts/services/observation";
import { classifyRecordKind } from "./classification.js";
import { BLOB_STORED_BYTES_SQL, RECORD_ROW_BYTES_SQL } from "./cleanup.js";
import { readStoredSettings } from "./management-state.js";
import { rowsAs } from "./queries.js";

const NEAR_REMINDER_RATIO = 0.85;

interface SpaceRecordRow {
  readonly seq: number;
  readonly project_id: string | null;
  readonly owner_kind: "plugin" | "service" | "shell";
  readonly owner_id: string | null;
  readonly fact: string;
  readonly entry: string;
  readonly audience: string;
  readonly source_class: string;
  readonly provider_id: string | null;
  readonly operation: string | null;
  readonly row_bytes: number;
}

/**
 * Inspect actual space used by stored work records and sealed evidence snapshots (contract-design §16.2, OCL-12).
 * Reaching or passing `space_reminder_bytes` reports `"near"` or `"exceeded"`, never deleting records or blocking writes.
 */
export function computeObservationSpace(db: DatabaseSync, flowOwners?: ReadonlySet<string>): ObservationSpaceView {
  const stored = readStoredSettings(db);
  const kindTotals = new Map<ObservationRecordKind, { bytes: number; count: number }>(
    OBSERVATION_RECORD_KINDS.map((kind) => [kind, { bytes: 0, count: 0 }]),
  );
  const projectTotals = new Map<string, { bytes: number; count: number }>();
  const seqProject = new Map<number, string>();

  const rows = rowsAs<SpaceRecordRow>(db.prepare(`
    SELECT seq, project_id, owner_kind, owner_id, fact, entry, audience, source_class, provider_id,
           json_extract(detail, '$.operation') AS operation, ${RECORD_ROW_BYTES_SQL} AS row_bytes
    FROM records
  `).all());

  for (const row of rows) {
    const kind = classifyRecordKind({
      owner_kind: row.owner_kind,
      owner_id: row.owner_id,
      fact: row.fact,
      entry: row.entry,
      audience: row.audience,
      source_class: row.source_class,
      provider_id: row.provider_id,
      ...(row.operation ? { operation: row.operation } : {}),
    }, flowOwners);
    const bucket = kindTotals.get(kind)!;
    bucket.bytes += row.row_bytes;
    bucket.count += 1;

    if (row.project_id !== null) {
      seqProject.set(row.seq, row.project_id);
      const proj = projectTotals.get(row.project_id) ?? { bytes: 0, count: 0 };
      proj.bytes += row.row_bytes;
      proj.count += 1;
      projectTotals.set(row.project_id, proj);
    }
  }

  const blobs = rowsAs<{ digest: string; stored_bytes: number }>(
    db.prepare(`SELECT digest, ${BLOB_STORED_BYTES_SQL} AS stored_bytes FROM evidence_blobs`).all(),
  );
  const total_snapshots = blobs.length;
  let filesBytes = 0;

  if (blobs.length > 0) {
    const refsStmt = db.prepare("SELECT seq FROM record_evidence WHERE digest = ?");
    for (const blob of blobs) {
      filesBytes += blob.stored_bytes;
      const refs = rowsAs<{ seq: number }>(refsStmt.all(blob.digest));
      const projects = [...new Set(refs.map((ref) => seqProject.get(ref.seq)).filter((id): id is string => id !== undefined))];
      if (projects.length > 0) {
        const share = Math.floor(blob.stored_bytes / projects.length);
        let remainder = blob.stored_bytes - share * projects.length;
        for (const projectId of projects) {
          const proj = projectTotals.get(projectId) ?? { bytes: 0, count: 0 };
          proj.bytes += share + (remainder > 0 ? 1 : 0);
          if (remainder > 0) remainder -= 1;
          projectTotals.set(projectId, proj);
        }
      }
    }
  }

  const by_kind: ObservationSpaceView["by_kind"] = [
    ...OBSERVATION_RECORD_KINDS.map((kind) => ({
      kind,
      bytes: kindTotals.get(kind)!.bytes,
      count: kindTotals.get(kind)!.count,
    })),
    { kind: "files", bytes: filesBytes, count: total_snapshots },
  ];

  const total_bytes = by_kind.reduce((sum, item) => sum + item.bytes, 0);
  const by_project = [...projectTotals.entries()]
    .map(([project_id, stat]) => ({ project_id, bytes: stat.bytes, count: stat.count }))
    .sort((a, b) => b.bytes - a.bytes || a.project_id.localeCompare(b.project_id));

  const reminder_bytes = stored.space_reminder_bytes;
  const reminder_status: ObservationSpaceView["reminder_status"] = reminder_bytes === null
    ? "none"
    : total_bytes >= reminder_bytes
      ? "exceeded"
      : total_bytes >= reminder_bytes * NEAR_REMINDER_RATIO
        ? "near"
        : "ok";

  // This banner is the disk / write / queue failure notice. Record-assembly failures (`exit_failed`, `record_failed`) are shown in
  // Coverage & gaps with their own wording; they are not “disk or write failed”.
  const lossAgg = db.prepare(
    "SELECT COALESCE(SUM(count), 0) AS lost_count, COUNT(*) AS rows FROM coverage_gaps WHERE state = 'lost' AND reason IN ('write_failed', 'store_unavailable', 'queue_full')",
  ).get() as { lost_count: number; rows: number };
  const lastLoss = db.prepare(
    "SELECT reason, ended_at FROM coverage_gaps WHERE state = 'lost' AND reason IN ('write_failed', 'store_unavailable', 'queue_full') ORDER BY gap_id DESC LIMIT 1",
  ).get() as { reason: string; ended_at: string } | undefined;

  return {
    total_bytes,
    total_records: rows.length,
    total_snapshots,
    by_kind,
    by_project,
    reminder_bytes,
    reminder_status,
    write_failure: {
      has_recent_loss: lossAgg.rows > 0,
      lost_count: Math.max(lossAgg.lost_count, lossAgg.rows),
      ...(lastLoss ? { last_reason: lastLoss.reason, last_at: lastLoss.ended_at } : {}),
    },
  };
}

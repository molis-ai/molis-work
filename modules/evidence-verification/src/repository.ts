import type { StoredModuleEvent } from "@molis-ai/molis-work-contracts/platform/storage";
import type {
  EvidenceCorrectionRecord,
  EvidenceRecord,
  EvidenceProjectReferenceSource,
  EvidenceReviewReference,
} from "@molis-ai/molis-work-contracts/modules/evidence-verification";

type Row = Record<string, unknown>;

export interface EvidenceSqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid?: number | bigint };
}

export interface EvidenceSqliteDatabase {
  prepare(sql: string): EvidenceSqliteStatement;
  exec(sql: string): unknown;
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
  pragma(source: string): unknown;
}

export const EVIDENCE_SCHEMA_SQL = `
  CREATE TABLE evidence (
    evidence_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    contract_revision INTEGER NOT NULL DEFAULT 1,
    criterion_ids_json TEXT NOT NULL,
    producer_actor_id TEXT NOT NULL,
    run_id TEXT REFERENCES runs(run_id),
    review_id TEXT,
    kind TEXT NOT NULL,
    locator TEXT NOT NULL,
    locator_status TEXT NOT NULL DEFAULT 'unverified' CHECK (locator_status IN ('verified', 'unverified')),
    locator_validation_reason TEXT NOT NULL DEFAULT '历史 Evidence 未进行 locator 预检',
    locator_checked_at TEXT,
    locator_workspace_id TEXT,
    locator_workspace_root TEXT,
    digest TEXT,
    captured_at TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('passed', 'failed', 'inconclusive')),
    historical_unmapped INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX evidence_goal_idx ON evidence(goal_id, result);

  CREATE TABLE evidence_corrections (
    correction_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    target_evidence_id TEXT NOT NULL UNIQUE REFERENCES evidence(evidence_id),
    action TEXT NOT NULL CHECK (action IN ('supersede', 'retract')),
    replacement_evidence_id TEXT REFERENCES evidence(evidence_id),
    actor_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    CHECK (
      (action = 'supersede' AND replacement_evidence_id IS NOT NULL) OR
      (action = 'retract' AND replacement_evidence_id IS NULL)
    )
  );
  CREATE INDEX evidence_corrections_goal_idx
    ON evidence_corrections(board_id, goal_id, created_at, correction_id);
`;

export function createEvidenceSchema(db: EvidenceSqliteDatabase): void {
  db.exec(EVIDENCE_SCHEMA_SQL);
}

export class EvidenceRepository {
  constructor(readonly db: EvidenceSqliteDatabase) {}

  listLifecycleEvents(boardId: string): StoredModuleEvent[] {
    return (this.db.prepare(`SELECT seq, type, object_type, object_id, payload_json, at FROM events
      WHERE board_id = ? AND type IN ('evidence.submitted') ORDER BY seq`)
      .all(boardId) as Row[]).map(row => ({
      seq: Number(row.seq ?? 0), type: text(row.type), object_type: text(row.object_type), object_id: text(row.object_id),
      payload: parseJson<Record<string, unknown>>(row.payload_json, {}), at: text(row.at),
    }));
  }

  getEvidence(boardId: string, evidenceId: string): EvidenceRecord | null {
    const row = this.db
      .prepare("SELECT * FROM evidence WHERE board_id = ? AND evidence_id = ?")
      .get(boardId, evidenceId) as Row | undefined;
    if (!row) return null;
    return mapEvidence(row, this.getCorrectionForTarget(evidenceId));
  }

  getEvidenceById(evidenceId: string): EvidenceRecord | null {
    const row = this.db.prepare("SELECT * FROM evidence WHERE evidence_id = ?").get(evidenceId) as Row | undefined;
    if (!row) return null;
    return mapEvidence(row, this.getCorrectionForTarget(evidenceId));
  }

  listEvidence(boardId: string): EvidenceRecord[] {
    const corrections = this.listCorrections(boardId);
    const byTarget = new Map(corrections.map((item) => [item.target_evidence_id, item]));
    return (this.db
      .prepare("SELECT * FROM evidence WHERE board_id = ? ORDER BY captured_at DESC, evidence_id")
      .all(boardId) as Row[]).map((row) =>
        mapEvidence(row, byTarget.get(text(row.evidence_id)) ?? null)
      );
  }

  listCorrections(boardId: string): EvidenceCorrectionRecord[] {
    return (this.db
      .prepare("SELECT * FROM evidence_corrections WHERE board_id = ? ORDER BY created_at, correction_id")
      .all(boardId) as Row[]).map(mapEvidenceCorrection);
  }

  getCorrectionForTarget(evidenceId: string): EvidenceCorrectionRecord | null {
    const row = this.db
      .prepare("SELECT * FROM evidence_corrections WHERE target_evidence_id = ?")
      .get(evidenceId) as Row | undefined;
    return row ? mapEvidenceCorrection(row) : null;
  }

  getReviewReference(evidenceId: string): EvidenceReviewReference | null {
    const evidence = this.getEvidenceById(evidenceId);
    if (!evidence) return null;
    const row = this.db.prepare(`
      SELECT seq FROM events
      WHERE board_id = ? AND object_id = ? AND type = 'evidence.submitted'
      ORDER BY seq DESC LIMIT 1
    `).get(evidence.board_id, evidenceId) as Row | undefined;
    if (!row) return null;
    return { evidence, submitted_event_seq: number(row.seq) };
  }

  getProjectReferenceSource(
    boardId: string,
    evidenceId: string,
  ): EvidenceProjectReferenceSource | null {
    const row = this.db.prepare(`
      SELECT evidence_id, board_id, locator, locator_status, locator_workspace_root
      FROM evidence WHERE board_id = ? AND evidence_id = ?
    `).get(boardId, evidenceId) as Row | undefined;
    return row ? {
      evidence_id: text(row.evidence_id),
      board_id: text(row.board_id),
      locator: text(row.locator),
      locator_status: text(row.locator_status) as EvidenceProjectReferenceSource["locator_status"],
      locator_workspace_root: nullableText(row.locator_workspace_root),
    } : null;
  }

}

export function mapEvidenceCorrection(row: Row): EvidenceCorrectionRecord {
  return {
    correction_id: text(row.correction_id),
    board_id: text(row.board_id),
    goal_id: text(row.goal_id),
    target_evidence_id: text(row.target_evidence_id),
    action: text(row.action) as EvidenceCorrectionRecord["action"],
    replacement_evidence_id: nullableText(row.replacement_evidence_id),
    actor_id: text(row.actor_id),
    reason: text(row.reason),
    created_at: text(row.created_at),
  };
}

export function mapEvidence(
  row: Row,
  correction: EvidenceCorrectionRecord | null = null,
): EvidenceRecord {
  return {
    evidence_id: text(row.evidence_id),
    board_id: text(row.board_id),
    goal_id: text(row.goal_id),
    contract_revision: Math.max(1, number(row.contract_revision) || 1),
    criterion_ids: parseJson<string[]>(row.criterion_ids_json, []),
    producer_actor_id: text(row.producer_actor_id),
    run_id: nullableText(row.run_id),
    review_id: nullableText(row.review_id),
    kind: text(row.kind) as EvidenceRecord["kind"],
    locator: text(row.locator),
    locator_status: (text(row.locator_status) || "unverified") as EvidenceRecord["locator_status"],
    locator_validation_reason:
      text(row.locator_validation_reason) || "历史 Evidence 未进行 locator 预检",
    locator_checked_at: nullableText(row.locator_checked_at),
    locator_workspace_id: nullableText(row.locator_workspace_id),
    digest: nullableText(row.digest),
    captured_at: text(row.captured_at),
    result: text(row.result) as EvidenceRecord["result"],
    lifecycle_state: correction?.action === "supersede"
      ? "superseded"
      : correction?.action === "retract"
        ? "retracted"
        : "effective",
    correction,
    historical_unmapped: number(row.historical_unmapped) === 1,
  };
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function nullableText(value: unknown): string | null {
  return value == null ? null : String(value);
}

function number(value: unknown): number {
  return Number(value ?? 0);
}

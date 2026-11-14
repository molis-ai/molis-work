import type { DatabaseSync } from "node:sqlite";
import type {
  ObservationCoverageState, ObservationEntry, ObservationOutcome, ObservationRecord, ObservationSourceClass,
} from "@molis-ai/molis-work-contracts/services/observation";

/**
 * Package-internal reads of the library (contract-design §1): batch 29 turns these into read actions with their own audience rules. Until
 * then only tests call them; nothing here is offered to a plugin, an Agent or a page.
 */
export interface RecordFilter {
  readonly project_id?: string | null;
  readonly fact?: string;
  readonly call_id?: string;
  readonly invocation_id?: string;
  readonly run_id?: string;
  readonly provider_id?: string;
  readonly limit?: number;
}

interface RecordRowRead {
  record_id: string; owner_kind: "plugin" | "service" | "shell"; owner_id: string | null; fact: string; provider_id: string | null; stage: string | null;
  outcome: ObservationOutcome; actor_id: string; actor_kind: "user" | "runtime" | null; audience: string; delegated_by: string | null; entry: ObservationEntry;
  project_id: string | null; install_id: string | null; occurred_at: string; received_at: string; clock_adjusted: number; call_id: string | null;
  invocation_id: string | null; parent_invocation_id: string | null; runtime_session_id: string | null; run_id: string | null; work_ref: string | null;
  source_class: ObservationSourceClass; subjects: string; conditions: string; detail: string; evidence: string; coalesced_count: number | null; coalesced_last_at: string | null;
}

/** SQLite hands back loosely typed rows; the columns read here are this package's own (schema.ts). */
export const rowsAs = <T>(rows: readonly unknown[]): T[] => rows as T[];

const optional = <K extends string, V>(key: K, value: V | null): { [P in K]?: V } => (value === null ? {} : { [key]: value }) as { [P in K]?: V };

function recordOf(row: RecordRowRead): ObservationRecord {
  return {
    record_id: row.record_id,
    owner: row.owner_kind === "shell" ? { kind: "shell" } : { kind: row.owner_kind, id: row.owner_id! } as ObservationRecord["owner"],
    fact: row.fact, ...optional("stage", row.stage), outcome: row.outcome,
    actor: { actor_id: row.actor_id, actor_kind: row.actor_kind, audience: row.audience, ...optional("delegated_by", row.delegated_by) },
    entry: row.entry, project_id: row.project_id, ...optional("install_id", row.install_id),
    subjects: JSON.parse(row.subjects), occurred_at: row.occurred_at, received_at: row.received_at, ...(row.clock_adjusted ? { clock_adjusted: true as const } : {}),
    work: { call_id: row.call_id, ...optional("invocation_id", row.invocation_id), ...optional("parent_invocation_id", row.parent_invocation_id),
      ...optional("runtime_session_id", row.runtime_session_id), ...optional("run_id", row.run_id), ...optional("work_ref", row.work_ref) },
    source_class: row.source_class, conditions: JSON.parse(row.conditions), detail: JSON.parse(row.detail), evidence: JSON.parse(row.evidence),
    ...(row.coalesced_count ? { coalesced: { count: row.coalesced_count, last_at: row.coalesced_last_at! } } : {}),
  };
}

/** Records in the order they were written, filtered by exact values. */
export function readRecords(db: DatabaseSync, filter: RecordFilter = {}): ObservationRecord[] {
  const where: string[] = [], values: (string | number)[] = [];
  for (const key of ["fact", "call_id", "invocation_id", "run_id", "provider_id"] as const) {
    const value = filter[key];
    if (value !== undefined) { where.push(`${key} = ?`); values.push(value); }
  }
  if (filter.project_id !== undefined) {
    if (filter.project_id === null) where.push("project_id IS NULL");
    else { where.push("project_id = ?"); values.push(filter.project_id); }
  }
  const sql = `SELECT * FROM records ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY seq LIMIT ?`;
  return rowsAs<RecordRowRead>(db.prepare(sql).all(...values, filter.limit ?? 1000)).map(recordOf);
}

export interface CoverageRow {
  readonly owner: string; readonly fact: string; readonly entry: string; readonly project_id: string; readonly state: ObservationCoverageState;
  readonly since: string; readonly since_version: string; readonly reason: string | null; readonly truncated: number; readonly redacted: number; readonly by_rule: number;
}
export interface CoverageGapRow {
  readonly owner: string; readonly fact: string; readonly entry: string; readonly project_id: string; readonly state: ObservationCoverageState;
  readonly started_at: string; readonly ended_at: string; readonly count: number; readonly reason: string;
}

export const readCoverage = (db: DatabaseSync): CoverageRow[] =>
  rowsAs<CoverageRow>(db.prepare("SELECT owner, fact, entry, project_id, state, since, since_version, reason, truncated, redacted, by_rule FROM coverage ORDER BY owner, fact, entry, project_id").all());

export const readCoverageGaps = (db: DatabaseSync): CoverageGapRow[] =>
  rowsAs<CoverageGapRow>(db.prepare("SELECT owner, fact, entry, project_id, state, started_at, ended_at, count, reason FROM coverage_gaps ORDER BY gap_id").all());

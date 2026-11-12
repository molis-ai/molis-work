export type SourceStatus = "active" | "paused" | "error" | "disconnected";
/** Identity for the Sources owner's portable project section, not a plugin or authorization. */
export const SOURCE_CONTENT_REPLICA_ID = 'sources_content';
export type SourceSyncKind = "public_source" | "github" | "gmail" | "connector" | "manual";

export function isAccountConnectorSyncKind(
  kind: string,
): kind is Extract<SourceSyncKind, "github" | "gmail" | "connector"> {
  return kind === "github" || kind === "gmail" || kind === "connector";
}
export type SourceHistoryDecision = "retain_history" | "delete_local_history";
export type SourceSchedule =
  | { mode: "manual" }
  | {
      mode: "interval";
      enabled: boolean;
      interval_minutes: number;
      next_pull_at: string | null;
    };

/** Durable desired state. Listener cursor, lease and retry state are deliberately absent. */
export interface SourceRecord {
  project_id: string;
  source_id: string;
  kind: string;
  definition_id: string | null;
  sync_kind: SourceSyncKind;
  name: string;
  description: string;
  status: SourceStatus;
  enabled: boolean;
  origin: "molis_work";
  config: Record<string, unknown>;
  schedule: SourceSchedule;
  connection_ref: string | null;
  account_label: string | null;
  last_sync_at: string | null;
  last_outcome: string | null;
  last_error_code: string | null;
  imported_at: string;
  updated_at: string;
}

export interface SourceQuery {
  list(projectId: string): SourceRecord[];
  get(projectId: string, sourceId: string): SourceRecord;
  find(
    projectId: string,
    syncKind: SourceSyncKind,
    definitionId: string | null,
    configFingerprint?: string,
  ): SourceRecord | null;
}

export interface SourceCommands {
  save(source: SourceRecord): SourceRecord;
  setEnabled(projectId: string, sourceId: string, enabled: boolean, at?: string): SourceRecord;
  retire(
    projectId: string,
    sourceId: string,
    historyDecision: SourceHistoryDecision,
    at?: string,
  ): SourceRecord;
}

export interface SourceEvent {
  event_id: string;
  project_id: string;
  source_id: string;
  type: "source.created" | "source.updated" | "source.status_changed" | "source.retired";
  payload: Record<string, unknown>;
  at: string;
}

export interface SourceEvents {
  list(projectId: string, sourceId?: string): SourceEvent[];
}

/** A scheduled pull that came up more than the grace late (Molis Work was not running): not pulled then, kept for the person (resident runtime §2.1). */
export interface MissedPullRecord {
  run_id: string;
  source_id: string;
  title: string;
  due_at: string;
  missed_at: string;
  decision: "run_now" | "skip" | null;
}

export interface SourceMissedPulls {
  /** Once per occurrence: the same run id is written once. Decided rows older than a month go at the same time. */
  record(projectId: string, entry: Omit<MissedPullRecord, "decision">): void;
  /** The undecided ones, latest first. */
  list(projectId: string, limit: number): MissedPullRecord[];
  get(projectId: string, runId: string): MissedPullRecord | null;
  decide(projectId: string, runId: string, decision: "run_now" | "skip", at: string): void;
}

export interface SourcesApi {
  readonly query: SourceQuery;
  readonly commands: SourceCommands;
  readonly events: SourceEvents;
  readonly missed: SourceMissedPulls;
}

export function sourceDeletedAt(source: Pick<SourceRecord, "config">): string | null {
  const lifecycle = source.config._molis_work_lifecycle;
  if (!lifecycle || typeof lifecycle !== "object" || Array.isArray(lifecycle)) return null;
  const value = (lifecycle as Record<string, unknown>).deleted_at;
  return typeof value === "string" && value ? value : null;
}

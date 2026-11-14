import type { DatabaseSync } from "node:sqlite";
import {
  OBSERVATION_RETENTION_MODES,
  OBSERVATION_RETENTION_NEEDS,
  type ObservationRecordingState,
  type ObservationRetentionConsumer,
  type ObservationRetentionMode,
  type ObservationRetentionRequirement,
  type ObservationSettingsView,
  type ObservationUses,
} from "@molis-ai/molis-work-contracts/services/observation";
import { currentObservationSource } from "./source-scope.js";

const SETTINGS_STATE_KEY = "settings";
const DEFAULT_EVALUATION_RETENTION_DAYS = OBSERVATION_RETENTION_NEEDS.evaluation_samples;

export interface StoredObservationSettings {
  readonly paused: boolean;
  readonly paused_at?: string;
  readonly uses: {
    readonly assistant: boolean;
    readonly evaluation: boolean;
    readonly export: boolean;
  };
  readonly retention_mode: ObservationRetentionMode;
  readonly space_reminder_bytes: number | null;
  readonly last_cleanup?: {
    readonly at: string;
    readonly deleted_records: number;
    readonly freed_bytes: number;
  };
}

export const DEFAULT_STORED_SETTINGS: StoredObservationSettings = {
  paused: false,
  uses: { assistant: true, evaluation: true, export: false },
  retention_mode: "keep",
  space_reminder_bytes: null,
};

export function readStoredSettings(db: DatabaseSync): StoredObservationSettings {
  const row = db.prepare("SELECT value FROM writer_state WHERE key = ?").get(SETTINGS_STATE_KEY) as { value: string } | undefined;
  if (!row) return DEFAULT_STORED_SETTINGS;
  const parsed = JSON.parse(row.value) as Partial<StoredObservationSettings>;
  const mode = parsed.retention_mode && (OBSERVATION_RETENTION_MODES as readonly string[]).includes(parsed.retention_mode)
    ? parsed.retention_mode
    : "keep";
  return {
    paused: parsed.paused === true,
    ...(parsed.paused === true && typeof parsed.paused_at === "string" ? { paused_at: parsed.paused_at } : {}),
    uses: {
      assistant: parsed.uses?.assistant !== false,
      evaluation: parsed.uses?.evaluation !== false,
      export: parsed.uses?.export === true,
    },
    retention_mode: mode,
    space_reminder_bytes: typeof parsed.space_reminder_bytes === "number" && parsed.space_reminder_bytes >= 0
      ? Math.round(parsed.space_reminder_bytes)
      : null,
    ...(parsed.last_cleanup && typeof parsed.last_cleanup.at === "string" ? {
      last_cleanup: {
        at: parsed.last_cleanup.at,
        deleted_records: Math.max(0, Math.round(parsed.last_cleanup.deleted_records ?? 0)),
        freed_bytes: Math.max(0, Math.round(parsed.last_cleanup.freed_bytes ?? 0)),
      },
    } : {}),
  };
}

export function writeStoredSettings(db: DatabaseSync, settings: StoredObservationSettings): void {
  db.prepare("INSERT INTO writer_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .run(SETTINGS_STATE_KEY, JSON.stringify(settings));
}

export function usesViewOf(stored: StoredObservationSettings): ObservationUses {
  return {
    lookback: true,
    assistant: stored.uses.assistant,
    evaluation: stored.uses.evaluation,
    export: stored.uses.export,
    upload: false,
  };
}

export function retentionDaysOf(mode: ObservationRetentionMode): number | null {
  switch (mode) {
    case "365": return 365;
    case "180": return 180;
    case "90": return 90;
    case "30": return 30;
    case "keep":
    case "manual":
      return null;
  }
}

export function retentionRequirementsOf(mode: ObservationRetentionMode): {
  readonly requirements: readonly ObservationRetentionRequirement[];
  readonly shortfall: boolean;
} {
  const days = retentionDaysOf(mode);
  const consumers: readonly ObservationRetentionConsumer[] = ["weekly_report", "cross_period_compare", "evaluation_samples"];
  const requirements = consumers.map((consumer) => {
    const need_days = OBSERVATION_RETENTION_NEEDS[consumer];
    return { consumer, need_days, kept: days === null || days >= need_days };
  });
  return { requirements, shortfall: requirements.some((item) => !item.kept) };
}

/**
 * Compute the current `ObservationRecordingState` for a given project filter (or the whole Home when `projectWhere` is empty).
 * `earliest_record_at` is the earliest `occurred_at` currently stored; `complete_since` advances past any `expired` stretch when
 * earlier records were cleared by retention or manual clean-up.
 */
export function recordingStateOf(
  db: DatabaseSync,
  stored: StoredObservationSettings,
  projectFilter?: { readonly sql: string; readonly params: readonly (string | number)[] },
): ObservationRecordingState {
  const recWhere = projectFilter?.sql ? `WHERE ${projectFilter.sql}` : "";
  const recParams = projectFilter?.params ?? [];
  const earliest = (db.prepare(`SELECT MIN(occurred_at) AS earliest FROM records ${recWhere}`).get(...recParams) as { earliest: string | null } | undefined)?.earliest ?? null;

  const gapWhere = projectFilter?.sql
    ? `WHERE state = 'expired' AND (${projectFilter.sql.replace(/\bproject_id\s+IS\s+NULL\b/gu, "project_id = ''")} OR project_id = '')`
    : "WHERE state = 'expired'";
  const expiredEnded = (db.prepare(`SELECT MAX(ended_at) AS ended FROM coverage_gaps ${gapWhere}`).get(...recParams) as { ended: string | null } | undefined)?.ended ?? null;

  let complete_since: string | null = earliest;
  if (expiredEnded !== null) {
    complete_since = earliest === null || expiredEnded > earliest ? expiredEnded : earliest;
  }

  const activeSource = currentObservationSource();
  const catchingUp = !stored.paused && (activeSource === "first_read" || activeSource === "catch_up");
  if (stored.paused) {
    return {
      state: "paused",
      ...(stored.paused_at ? { paused_at: stored.paused_at } : {}),
      complete_since,
      earliest_record_at: earliest,
    };
  }
  if (catchingUp) {
    const catchWhere = projectFilter?.sql
      ? `WHERE (${projectFilter.sql}) AND source_class IN ('first_read', 'catch_up')`
      : "WHERE source_class IN ('first_read', 'catch_up')";
    const readCount = (db.prepare(`SELECT COUNT(*) AS count FROM records ${catchWhere}`).get(...recParams) as { count: number } | undefined)?.count ?? 0;
    return {
      state: "catching_up",
      complete_since,
      earliest_record_at: earliest,
      catch_up_progress: { read_count: readCount },
    };
  }
  return {
    state: "recording",
    complete_since,
    earliest_record_at: earliest,
  };
}

export function settingsViewOf(db: DatabaseSync, stored: StoredObservationSettings): ObservationSettingsView {
  const { requirements, shortfall } = retentionRequirementsOf(stored.retention_mode);
  return {
    recording: recordingStateOf(db, stored),
    uses: usesViewOf(stored),
    retention: {
      mode: stored.retention_mode,
      requirements,
      shortfall,
      ...(stored.last_cleanup ? {
        last_cleanup_at: stored.last_cleanup.at,
        last_cleanup_deleted_records: stored.last_cleanup.deleted_records,
        last_cleanup_freed_bytes: stored.last_cleanup.freed_bytes,
      } : {}),
    },
    space_reminder_bytes: stored.space_reminder_bytes,
    evaluation_holds: { count: 0, bytes: 0, retention_days: DEFAULT_EVALUATION_RETENTION_DAYS },
  };
}

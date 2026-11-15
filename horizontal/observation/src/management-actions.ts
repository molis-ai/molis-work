import type { DatabaseSync } from "node:sqlite";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  ObservationCleanupPreview,
  ObservationCleanupResult,
  ObservationCleanupScopeInput,
  ObservationSettingsUpdateInput,
  ObservationSettingsView,
  ObservationSpaceView,
} from "@molis-ai/molis-work-contracts/services/observation";
import { assertPersonCaller, resolveLiveReadableProjects } from "./access.js";
import { applyCleanup, previewCleanup, sweepExpiredRecords } from "./cleanup.js";
import { observationErrors } from "./errors.js";
import {
  readStoredSettings,
  retentionDaysOf,
  settingsViewOf,
  writeStoredSettings,
  type StoredObservationSettings,
} from "./management-state.js";
import type { ObservationEnvironment } from "./records.js";
import { computeObservationSpace } from "./space.js";
import type { ObservationWriter } from "./writer.js";

export interface ManagementActionDeps {
  readonly env: ObservationEnvironment;
  readonly writer: ObservationWriter;
}

function openForManagement(writer: ObservationWriter): DatabaseSync {
  writer.flush();
  const opened = writer.database();
  if (!opened) throw observationErrors.store_unavailable("工作记录库当前不可用");
  return opened.db;
}

export function handleSettingsGet(deps: ManagementActionDeps, caller: ActionCallContext): ObservationSettingsView {
  assertPersonCaller(caller);
  const db = openForManagement(deps.writer);
  return settingsViewOf(db, readStoredSettings(db));
}

export function handleSettingsSet(
  deps: ManagementActionDeps,
  caller: ActionCallContext,
  input: ObservationSettingsUpdateInput,
): ObservationSettingsView {
  assertPersonCaller(caller);
  // Flush queued records BEFORE applying a pause so everything that occurred prior to pausing is preserved.
  const db = openForManagement(deps.writer);
  const now = deps.env.now();
  const nowIso = now.toISOString();
  const previous = readStoredSettings(db);

  const nextPaused = input.paused !== undefined ? input.paused : previous.paused;
  const nextPausedAt = nextPaused
    ? (previous.paused ? previous.paused_at ?? nowIso : nowIso)
    : undefined;

  const next: StoredObservationSettings = {
    paused: nextPaused,
    ...(nextPausedAt ? { paused_at: nextPausedAt } : {}),
    uses: {
      assistant: input.uses?.assistant !== undefined ? input.uses.assistant : previous.uses.assistant,
      evaluation: input.uses?.evaluation !== undefined ? input.uses.evaluation : previous.uses.evaluation,
      export: input.uses?.export !== undefined ? input.uses.export : previous.uses.export,
    },
    retention_mode: input.retention_mode !== undefined ? input.retention_mode : previous.retention_mode,
    space_reminder_bytes: input.space_reminder_bytes !== undefined ? input.space_reminder_bytes : previous.space_reminder_bytes,
    ...(previous.last_cleanup ? { last_cleanup: previous.last_cleanup } : {}),
  };

  db.exec("BEGIN IMMEDIATE");
  try {
    writeStoredSettings(db, next);
    if (previous.paused && !nextPaused) {
      db.prepare(
        "INSERT INTO coverage_gaps (owner, fact, entry, project_id, state, started_at, ended_at, count, reason) VALUES ('observation', '*', 'workbench', '', 'by_rule', ?, ?, 0, 'recording_paused')",
      ).run(previous.paused_at ?? nowIso, nowIso);
    }
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* already closed */ }
    throw error;
  }

  deps.writer.setPaused(nextPaused);

  // When a bounded automatic retention period is saved, apply the cutoff immediately without silently extending it (OCL-12).
  if (input.retention_mode !== undefined && retentionDaysOf(next.retention_mode) !== null) {
    sweepExpiredRecords(db, now);
  }

  return settingsViewOf(db, readStoredSettings(db));
}

export function handleSpaceGet(deps: ManagementActionDeps, caller: ActionCallContext): ObservationSpaceView {
  assertPersonCaller(caller);
  const db = openForManagement(deps.writer);
  return computeObservationSpace(db);
}

export async function handleCleanupPreview(
  deps: ManagementActionDeps,
  caller: ActionCallContext,
  input: ObservationCleanupScopeInput,
): Promise<ObservationCleanupPreview> {
  assertPersonCaller(caller);
  if (typeof input.project_id === "string") {
    const readable = await resolveLiveReadableProjects(deps.env);
    if (readable && !readable.has(input.project_id)) {
      throw observationErrors.forbidden("所选项目不存在、已删除或正在关闭");
    }
  }
  const db = openForManagement(deps.writer);
  return previewCleanup(db, input, deps.env.now());
}

export async function handleCleanupApply(
  deps: ManagementActionDeps,
  caller: ActionCallContext,
  input: ObservationCleanupScopeInput,
): Promise<ObservationCleanupResult> {
  assertPersonCaller(caller);
  if (typeof input.project_id === "string") {
    const readable = await resolveLiveReadableProjects(deps.env);
    if (readable && !readable.has(input.project_id)) {
      throw observationErrors.forbidden("所选项目不存在、已删除或正在关闭");
    }
  }
  const db = openForManagement(deps.writer);
  return applyCleanup(db, input, deps.env.now());
}

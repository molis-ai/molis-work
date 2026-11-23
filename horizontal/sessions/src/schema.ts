import { existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { ProjectDataDeclaration } from "@molis-ai/molis-work-contracts/modules/projects";
import { homeSqlitePath, openBaselineHomeSqlite, type HomeStoreDeclaration, type SqliteBaseline } from "@molis-ai/molis-work-storage";

/** The Home store of external AI tool sessions: `<Home>/external-sessions/external-sessions.db` (contract-design §9.2). */
export const EXTERNAL_SESSIONS_STORE = "external-sessions";

/**
 * Index, directory cache, source progress, the person's read scopes, per-project AI read permits, per-session filing decisions
 * and model attribution suggestions (contract-design §9.2). Transcripts are never stored here. `session_attributions` carries no
 * foreign key so filing decisions survive index rebuilds, and its `revision` never resets to 0 on `clear`.
 */
export const EXTERNAL_SESSIONS_BASELINE: SqliteBaseline = {
  version: /* @version database.external_sessions_database */ 2,
  schema: `
  CREATE TABLE external_sessions (
    session_key TEXT PRIMARY KEY,
    entry_id TEXT NOT NULL,
    location_key TEXT NOT NULL,
    native_id TEXT NOT NULL,
    seen_via TEXT NOT NULL,
    title TEXT,
    directory_key TEXT,
    directory_path TEXT,
    activity TEXT NOT NULL DEFAULT 'unknown',
    return_target_kind TEXT,
    return_target_label TEXT,
    reported_project_id TEXT,
    last_activity_at TEXT NOT NULL,
    forked_from TEXT,
    gone_at TEXT,
    subagent INTEGER NOT NULL DEFAULT 0,
    UNIQUE (entry_id, location_key, native_id)
  );
  CREATE INDEX external_sessions_activity_idx
    ON external_sessions (last_activity_at DESC, session_key ASC);
  CREATE INDEX external_sessions_directory_idx
    ON external_sessions (directory_key, last_activity_at DESC, session_key ASC);
  CREATE INDEX external_sessions_reported_idx
    ON external_sessions (reported_project_id, last_activity_at DESC, session_key ASC);
  CREATE INDEX external_sessions_source_idx
    ON external_sessions (entry_id, location_key);
  CREATE TABLE session_directories (
    directory_key TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    kind TEXT NOT NULL,
    realpath_verified INTEGER NOT NULL,
    repository_key TEXT,
    worktree_relative TEXT,
    derived_state TEXT NOT NULL,
    derived_project_id TEXT,
    evidence_kind TEXT,
    evidence_path TEXT,
    candidates TEXT NOT NULL,
    directory_digest TEXT NOT NULL
  );
  CREATE INDEX session_directories_project_idx
    ON session_directories (derived_project_id);
  CREATE TABLE session_sources (
    entry_id TEXT NOT NULL,
    location_key TEXT NOT NULL,
    state TEXT NOT NULL,
    reason TEXT,
    progress_cursor TEXT,
    progress_read INTEGER NOT NULL DEFAULT 0,
    progress_total INTEGER,
    session_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    checked_at TEXT NOT NULL,
    PRIMARY KEY (entry_id, location_key)
  );
  CREATE TABLE session_read_scopes (
    entry_id TEXT NOT NULL,
    location_key TEXT NOT NULL,
    allowed INTEGER NOT NULL,
    directories TEXT NOT NULL,
    connection_id TEXT,
    revision INTEGER NOT NULL,
    decided_at TEXT NOT NULL,
    PRIMARY KEY (entry_id, location_key)
  );
  CREATE TABLE session_project_ai_reads (
    project_id TEXT PRIMARY KEY,
    allowed INTEGER NOT NULL,
    revision INTEGER NOT NULL,
    decided_by TEXT NOT NULL,
    decided_at TEXT NOT NULL
  );
  CREATE TABLE session_attributions (
    session_key TEXT PRIMARY KEY,
    decision TEXT NOT NULL,
    project_id TEXT,
    basis TEXT,
    revision INTEGER NOT NULL,
    decided_by TEXT NOT NULL,
    decided_at TEXT NOT NULL
  );
  CREATE INDEX session_attributions_project_idx
    ON session_attributions (project_id);
  CREATE TABLE session_suggestions (
    session_key TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    project_id TEXT,
    alternatives TEXT NOT NULL,
    reason TEXT NOT NULL,
    evidence TEXT NOT NULL,
    input_digest TEXT NOT NULL,
    prompt_version INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE session_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`,
  upgrades: [
    // 1 → 2: subagent trajectories are recorded with their session and left out of the list. Every row so far is a session.
    { from: 1, sql: "ALTER TABLE external_sessions ADD COLUMN subagent INTEGER NOT NULL DEFAULT 0;" },
  ],
};

export const EXTERNAL_SESSIONS_HOME_STORE: HomeStoreDeclaration = {
  path: EXTERNAL_SESSIONS_STORE,
  library: { baseline: EXTERNAL_SESSIONS_BASELINE },
};

/**
 * Deletes a removed project's AI read permit and suggestions pointing at that project (contract-design §8.5).
 * `session_attributions` is deliberately preserved so sessions the person filed there show `project_gone` and can be refiled.
 * Callers must invoke inside an active transaction (`store.inTransaction` or `clearExternalSessionsProjectFile`).
 */
export function clearExternalSessionsProjectRows(db: DatabaseSync, projectId: string): void {
  db.prepare("DELETE FROM session_project_ai_reads WHERE project_id = ?").run(projectId);
  db.prepare("DELETE FROM session_suggestions WHERE project_id = ?").run(projectId);
  const rows = db.prepare("SELECT session_key, alternatives FROM session_suggestions").all() as Array<{ session_key: string; alternatives: string }>;
  const remove = db.prepare("DELETE FROM session_suggestions WHERE session_key = ?");
  for (const row of rows) {
    try {
      const alternatives = JSON.parse(row.alternatives) as unknown;
      if (Array.isArray(alternatives) && alternatives.includes(projectId)) remove.run(row.session_key);
    } catch {
      remove.run(row.session_key);
    }
  }
}

export function clearExternalSessionsProjectFile(home: string, projectId: string): void {
  if (!existsSync(homeSqlitePath(home, EXTERNAL_SESSIONS_STORE))) return;
  const db = openBaselineHomeSqlite(home, EXTERNAL_SESSIONS_STORE, EXTERNAL_SESSIONS_BASELINE);
  try {
    db.exec("BEGIN IMMEDIATE");
    try {
      clearExternalSessionsProjectRows(db, projectId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
  }
}

export const sessionsProjectData: ProjectDataDeclaration = {
  label: { key: "workbench.project-deletion.external-sessions" },
  purge(home, projectId) {
    clearExternalSessionsProjectFile(home, projectId);
  },
};

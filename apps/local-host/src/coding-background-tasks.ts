import { existsSync } from "node:fs";
import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import type { WebProjectNavigation } from "@molis-ai/molis-work-app-workbench";

/** Coding session states that mean a round is under way or waiting on the person. */
const ACTIVE_STATES = ["running", "paused", "waiting-answer", "waiting-approval", "reconcile-required"] as const;

export interface CodingBackgroundTask {
  project_id: string;
  project_name: string;
  session_id: string;
  title: string;
  state: (typeof ACTIVE_STATES)[number];
  updated_at: string;
  /**
   * Recorded as under way before this service started. No round survives a restart, so the session is really waiting
   * to be checked; opening it shows what happened.
   */
  before_restart: boolean;
}

const SERVICE_STARTED_AT = new Date(Date.now() - process.uptime() * 1000).toISOString();

/**
 * Coding sessions that are running or waiting on the person, across every project, newest first.
 *
 * Read from each project's recorded session states, which Coding keeps current while a round runs; nothing here
 * opens a project or asks a runtime. A project that never used Coding, or whose store cannot be read, lists nothing
 * rather than a guess.
 */
export function codingBackgroundTasks(projects: readonly WebProjectNavigation[], startedAt = SERVICE_STARTED_AT): CodingBackgroundTask[] {
  const tasks: CodingBackgroundTask[] = [];
  for (const project of projects) {
    if (!project.database_path || !existsSync(project.database_path)) continue;
    let store: LocalSqliteStorage | undefined;
    try {
      store = new LocalSqliteStorage(project.database_path, { readonly: true });
      const rows = store.db.prepare(`SELECT session_id, title, state, updated_at FROM coding_sessions
        WHERE archived = 0 AND state IN (${ACTIVE_STATES.map(() => "?").join(", ")}) ORDER BY updated_at DESC`).all(...ACTIVE_STATES) as Array<{
        session_id: string; title: string; state: CodingBackgroundTask["state"]; updated_at: string }>;
      for (const row of rows) tasks.push({ project_id: project.project_id, project_name: project.display_name, session_id: row.session_id,
        title: row.title, state: row.state, updated_at: row.updated_at,
        before_restart: row.state !== "reconcile-required" && row.updated_at < startedAt });
    } catch {
      // No Coding table yet, or a store this service cannot read: nothing is listed for that project.
    } finally { store?.close(); }
  }
  return tasks.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.project_id.localeCompare(b.project_id));
}

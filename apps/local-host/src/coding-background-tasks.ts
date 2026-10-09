import { existsSync } from "node:fs";
import { LocalSqliteStorage, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import type { WebProjectNavigation } from "@molis-ai/molis-work-app-workbench";

export interface CodingBackgroundTask {
  project_id: string;
  project_name: string;
  session_id: string;
  title: string;
  /** A round under way or waiting, or any state when the person holds open plan steps. */
  state: string;
  updated_at: string;
  /** Who holds the open plan steps, as Coding last read them: the person, subtasks, no one. */
  steps?: { mine: number; subtasks: number; unowned: number };
  /** Background commands the session left running, as Coding last read them. */
  commands?: Array<{ task_id: string; summary: string; started_at_ms: number }>;
  /**
   * Recorded as under way before this service started. No round survives a restart, so the session is really waiting
   * to be checked; opening it shows what happened.
   */
  before_restart: boolean;
}

/**
 * How one project database is asked for its Coding sessions. Coding owns that table and its reader, `listCodingBackgroundSessions`;
 * the caller that wires the route passes it in, so this file names no plugin and reads no table.
 */
export type CodingSessionReader = (db: SqliteDatabase) => ReadonlyArray<Omit<CodingBackgroundTask, "project_id" | "project_name" | "before_restart"> & { active: boolean }>;

const SERVICE_STARTED_AT = new Date(Date.now() - process.uptime() * 1000).toISOString();

/**
 * Coding sessions that are running or waiting on the person, across every project, newest first. A session whose round
 * has ended is listed too while the person holds one of its open plan steps: that step waits on them.
 *
 * Read from each project's recorded session states, which Coding keeps current while a round runs and reads back itself;
 * nothing here opens a project or asks a runtime. A project that never used Coding, or whose store cannot be read, lists
 * nothing rather than a guess.
 */
export function codingBackgroundTasks(projects: readonly WebProjectNavigation[], readSessions: CodingSessionReader, startedAt = SERVICE_STARTED_AT): CodingBackgroundTask[] {
  const tasks: CodingBackgroundTask[] = [];
  for (const project of projects) {
    if (!project.database_path || !existsSync(project.database_path)) continue;
    let store: LocalSqliteStorage | undefined;
    try {
      store = new LocalSqliteStorage(project.database_path, { readonly: true });
      for (const session of readSessions(store.db)) {
        tasks.push({ project_id: project.project_id, project_name: project.display_name, session_id: session.session_id,
          title: session.title, state: session.state, updated_at: session.updated_at, ...(session.steps ? { steps: session.steps } : {}),
          ...(session.commands ? { commands: session.commands } : {}),
          // A queued round has not started, so a restart did not cut it off.
          before_restart: session.active && !["reconcile-required", "queued"].includes(session.state) && session.updated_at < startedAt });
      }
    } catch {
      // No Coding table yet, or a store this service cannot read: nothing is listed for that project.
    } finally { store?.close(); }
  }
  return tasks.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.project_id.localeCompare(b.project_id));
}

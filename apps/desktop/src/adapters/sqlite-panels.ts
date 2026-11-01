import type { SqliteDatabase } from "@molis-ai/molis-work-storage";

/** The two tables the retired desktop panels kept (T-148): nothing reads or writes them; whether they go in this catalog version or the next is decided with #1633. */
export function createDesktopPanelTables(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS goal_desktop_panels (
      panel_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(project_id),
      goal_id TEXT NOT NULL,
      runtime_kind TEXT NOT NULL,
      launch_command TEXT NOT NULL,
      launch_args TEXT NOT NULL,
      cwd TEXT,
      work_context_id TEXT NOT NULL,
      host_session_id TEXT,
      tab_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('open', 'exited')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS goal_desktop_panels_goal_idx
      ON goal_desktop_panels(project_id, goal_id, tab_index);
    CREATE TABLE IF NOT EXISTS goal_desktop_panel_aliases (
      panel_id TEXT NOT NULL REFERENCES goal_desktop_panels(panel_id) ON DELETE CASCADE,
      runtime_id TEXT NOT NULL,
      stable_work_context_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (runtime_id, stable_work_context_id)
    );
  `);
}

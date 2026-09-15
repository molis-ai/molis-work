import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import type { DesktopPanelRecord, DesktopPanelRepository } from "@molis-ai/molis-work-contracts/platform/app-host";

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

export class SqliteDesktopPanelRepository implements DesktopPanelRepository {
  constructor(private readonly db: SqliteDatabase) {}

  transaction<T>(operation: () => T): T {
    return this.db.transaction(operation)();
  }

  nextTabIndex(projectId: string, goalId: string): number {
    const row = this.db.prepare(`
      SELECT COALESCE(MAX(tab_index), -1) AS tab_index
      FROM goal_desktop_panels
      WHERE project_id = ? AND goal_id = ?
    `).get(projectId, goalId) as { tab_index?: unknown };
    return Number(row.tab_index) + 1;
  }

  insert(record: DesktopPanelRecord): void {
    this.db.prepare(`
      INSERT INTO goal_desktop_panels (
        panel_id, project_id, goal_id, runtime_kind, launch_command, launch_args,
        cwd, work_context_id, host_session_id, tab_index, title, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.panel_id,
      record.project_id,
      record.goal_id,
      record.runtime_kind,
      record.launch_command,
      JSON.stringify(record.launch_args),
      record.cwd,
      record.work_context_id,
      record.host_session_id,
      record.tab_index,
      record.title,
      record.status,
      record.created_at,
      record.updated_at,
    );
  }

  addAlias(panelId: string, runtimeId: string, workContextId: string, createdAt: string): void {
    this.db.prepare(`
      INSERT INTO goal_desktop_panel_aliases (
        panel_id, runtime_id, stable_work_context_id, created_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(runtime_id, stable_work_context_id) DO UPDATE SET panel_id = excluded.panel_id
    `).run(panelId, runtimeId, workContextId, createdAt);
  }

  list(projectId: string, goalId?: string): DesktopPanelRecord[] {
    const rows = goalId
      ? this.db.prepare(`
          SELECT * FROM goal_desktop_panels
          WHERE project_id = ? AND goal_id = ?
          ORDER BY tab_index, created_at, panel_id
        `).all(projectId, goalId)
      : this.db.prepare(`
          SELECT * FROM goal_desktop_panels
          WHERE project_id = ?
          ORDER BY goal_id, tab_index, created_at, panel_id
        `).all(projectId);
    return (rows as Array<Record<string, unknown>>).map(mapDesktopPanel);
  }

  get(panelId: string): DesktopPanelRecord | null {
    const row = this.db.prepare("SELECT * FROM goal_desktop_panels WHERE panel_id = ?")
      .get(panelId) as Record<string, unknown> | undefined;
    return row ? mapDesktopPanel(row) : null;
  }

  updateStatus(panelId: string, status: DesktopPanelRecord["status"], updatedAt: string): void {
    this.db.prepare("UPDATE goal_desktop_panels SET status = ?, updated_at = ? WHERE panel_id = ?")
      .run(status, updatedAt, panelId);
  }

  updateHostSession(panelId: string, hostSessionId: string, updatedAt: string): void {
    this.db.prepare("UPDATE goal_desktop_panels SET host_session_id = ?, updated_at = ? WHERE panel_id = ?")
      .run(hostSessionId, updatedAt, panelId);
  }

  delete(panelId: string): void {
    this.db.prepare("DELETE FROM goal_desktop_panel_aliases WHERE panel_id = ?").run(panelId);
    this.db.prepare("DELETE FROM goal_desktop_panels WHERE panel_id = ?").run(panelId);
  }

  findByWorkContext(runtimeId: string, workContextId: string): DesktopPanelRecord | null {
    const row = this.db.prepare(`
      SELECT panels.* FROM goal_desktop_panel_aliases AS aliases
      INNER JOIN goal_desktop_panels AS panels ON panels.panel_id = aliases.panel_id
      WHERE aliases.runtime_id = ? AND aliases.stable_work_context_id = ?
    `).get(runtimeId, workContextId) as Record<string, unknown> | undefined;
    return row ? mapDesktopPanel(row) : null;
  }

  deleteForProject(projectId: string): void {
    this.db.prepare(`
      DELETE FROM goal_desktop_panel_aliases
      WHERE panel_id IN (SELECT panel_id FROM goal_desktop_panels WHERE project_id = ?)
    `).run(projectId);
    this.db.prepare("DELETE FROM goal_desktop_panels WHERE project_id = ?").run(projectId);
  }
}

function mapDesktopPanel(row: Record<string, unknown>): DesktopPanelRecord {
  let launchArgs: string[] = [];
  try {
    const parsed = JSON.parse(String(row.launch_args ?? "[]")) as unknown;
    if (Array.isArray(parsed)) launchArgs = parsed.map(String);
  } catch {
    launchArgs = [];
  }
  return {
    panel_id: String(row.panel_id),
    project_id: String(row.project_id),
    goal_id: String(row.goal_id),
    runtime_kind: String(row.runtime_kind),
    launch_command: String(row.launch_command),
    launch_args: launchArgs,
    cwd: row.cwd == null ? null : String(row.cwd),
    work_context_id: String(row.work_context_id),
    host_session_id: row.host_session_id == null ? null : String(row.host_session_id),
    tab_index: Number(row.tab_index),
    title: String(row.title),
    status: String(row.status) === "exited" ? "exited" : "open",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

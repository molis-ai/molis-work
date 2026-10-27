import type { ProjectPluginId, ProjectRecord } from "@molis-ai/molis-work-contracts/modules/projects";

import { text, type ProjectsSqliteDatabase, type Row } from "./sqlite.js";

/** The rows that are the project itself: `projects`, the plugins it has and hides, and its events. */
export class ProjectRecordsRepository {
  constructor(private readonly db: ProjectsSqliteDatabase) {}

  listProjects(): ProjectRecord[] {
    return (this.db.prepare(
      "SELECT * FROM projects WHERE NOT EXISTS (SELECT 1 FROM project_deletions d WHERE d.project_id=projects.project_id AND d.cleanup_state='pending') ORDER BY display_name COLLATE NOCASE, created_at, project_id",
    ).all() as Row[]).map(mapProject);
  }

  getProject(projectId: string, includePending = false): ProjectRecord | null {
    const row = this.db.prepare("SELECT * FROM projects WHERE project_id = ? AND (? OR NOT EXISTS (SELECT 1 FROM project_deletions d WHERE d.project_id=projects.project_id AND d.cleanup_state='pending'))").get(projectId, includePending ? 1 : 0) as Row | undefined;
    return row ? mapProject(row) : null;
  }

  insertProject(record: ProjectRecord): void {
    this.db.prepare(`
      INSERT INTO projects (
        project_id, display_name, database_path, source,
        data_class, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.project_id,
      record.display_name,
      record.database_path,
      "created",
      record.data_class,
      record.created_at,
      record.updated_at,
    );
  }

  removeProject(projectId: string): number {
    return Number(this.db.prepare("DELETE FROM projects WHERE project_id = ?").run(projectId).changes);
  }

  listProjectPlugins(projectId: string): ProjectPluginId[] {
    return (this.db.prepare("SELECT plugin_id FROM project_plugins WHERE project_id = ? ORDER BY plugin_id")
      .all(projectId) as { plugin_id: ProjectPluginId }[]).map(row => row.plugin_id);
  }

  addProjectPlugin(projectId: string, pluginId: ProjectPluginId, at: string): boolean {
    return Number(this.db.prepare("INSERT INTO project_plugins (project_id, plugin_id, added_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
      .run(projectId, pluginId, at).changes) > 0;
  }

  removeProjectPlugin(projectId: string, pluginId: ProjectPluginId): boolean {
    return Number(this.db.prepare("DELETE FROM project_plugins WHERE project_id = ? AND plugin_id = ?")
      .run(projectId, pluginId).changes) > 0;
  }

  listHiddenPlugins(projectId: string): ProjectPluginId[] {
    return (this.db.prepare("SELECT plugin_id FROM project_plugin_exclusions WHERE project_id = ? ORDER BY plugin_id")
      .all(projectId) as { plugin_id: ProjectPluginId }[]).map(row => row.plugin_id);
  }

  hideProjectPlugin(projectId: string, pluginId: ProjectPluginId, at: string): boolean {
    return Number(this.db.prepare("INSERT INTO project_plugin_exclusions (project_id, plugin_id, removed_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
      .run(projectId, pluginId, at).changes) > 0;
  }

  showProjectPlugin(projectId: string, pluginId: ProjectPluginId): boolean {
    return Number(this.db.prepare("DELETE FROM project_plugin_exclusions WHERE project_id = ? AND plugin_id = ?")
      .run(projectId, pluginId).changes) > 0;
  }

  renameProject(projectId: string, displayName: string, updatedAt: string): void {
    this.db.prepare("UPDATE projects SET display_name = ?, updated_at = ? WHERE project_id = ?")
      .run(displayName, updatedAt, projectId);
  }

  updateDatabasePath(projectId: string, databasePath: string, updatedAt: string): void {
    this.db.prepare("UPDATE projects SET database_path = ?, updated_at = ? WHERE project_id = ?")
      .run(databasePath, updatedAt, projectId);
  }

  touchProject(projectId: string, updatedAt: string): void {
    this.db.prepare("UPDATE projects SET updated_at = ? WHERE project_id = ?").run(updatedAt, projectId);
  }

  appendEvent(input: {
    event_id: string;
    project_id: string;
    type: string;
    actor_id: string;
    payload: Record<string, unknown>;
    created_at: string;
  }): void {
    this.db.prepare(`
      INSERT INTO project_events (event_id, project_id, type, actor_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      input.event_id,
      input.project_id,
      input.type,
      input.actor_id,
      JSON.stringify(input.payload),
      input.created_at,
    );
  }
}

function projectDataClass(value: unknown): ProjectRecord["data_class"] {
  return text(value) === "regenerable_demo" ? "regenerable_demo" : "user";
}

function mapProject(row: Row): ProjectRecord {
  return {
    project_id: text(row.project_id),
    display_name: text(row.display_name),
    database_path: text(row.database_path),
    source: "created",
    data_class: projectDataClass(row.data_class),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
}

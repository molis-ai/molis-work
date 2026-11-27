import type { ProjectPluginId, ProjectRecord } from "@molis-ai/molis-work-contracts/modules/projects";

import { PERSONAL_SPACE_PROJECT_ID } from "@molis-ai/molis-work-contracts/platform/actions";

import { projectDatabasePath } from "./project-paths.js";
import { text, type ProjectsSqliteDatabase, type Row } from "./sqlite.js";

export interface StoredPluginMembershipFacts {
  plugins: ProjectPluginId[];
  latest_event_id: string | null;
}

/** The rows that are the project itself: `projects`, the plugins it has and hides, and its events. */
export class ProjectRecordsRepository {
  constructor(private readonly db: ProjectsSqliteDatabase, private readonly projectsDirectory: string, readonly spaceId?: string) {}

  /** The person's projects: every live partition but the personal space (specs/unified-partition-plugins C2). */
  listProjects(): ProjectRecord[] {
    return this.listPartitions().filter(row => row.project_id !== PERSONAL_SPACE_PROJECT_ID);
  }

  /** Every live partition, the personal space first: what a platform loop walks (sync, search, schedules, backups, upgrades, clean-up). */
  listPartitions(): ProjectRecord[] {
    return (this.db.prepare(
      "SELECT * FROM projects WHERE project_id NOT IN (SELECT project_id FROM project_recycle WHERE recycled=1) ORDER BY project_id <> ?, display_name COLLATE NOCASE, created_at, project_id",
    ).all(PERSONAL_SPACE_PROJECT_ID) as Row[]).map(row => ({ ...mapProject(row, this.projectsDirectory), ...(this.spaceId ? { spaceId: this.spaceId } : {}) }));
  }

  getProject(projectId: string): ProjectRecord | null {
    const row = this.db.prepare("SELECT * FROM projects WHERE project_id = ? AND project_id NOT IN (SELECT project_id FROM project_recycle WHERE recycled=1)").get(projectId) as Row | undefined;
    return row ? ({ ...mapProject(row, this.projectsDirectory), ...(this.spaceId ? { spaceId: this.spaceId } : {}) }) : null;
  }

  insertProject(record: ProjectRecord): void {
    if (record.spaceId && record.spaceId !== this.spaceId) throw new Error("SPACE_OWNERSHIP_MISMATCH");
    this.db.prepare(`
      INSERT INTO projects (
        project_id, display_name, source,
        data_class, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      record.project_id,
      record.display_name,
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
    return (this.db.prepare("SELECT plugin_id FROM partition_plugins WHERE partition_id = ? ORDER BY plugin_id")
      .all(projectId) as { plugin_id: ProjectPluginId }[]).map(row => row.plugin_id);
  }

  addProjectPlugin(projectId: string, pluginId: ProjectPluginId, at: string, actorId: string): boolean {
    const portableChanged = Number(this.db.prepare('INSERT INTO project_portable_plugins(project_id,plugin_id) VALUES(?,?) ON CONFLICT DO NOTHING').run(projectId,pluginId).changes)>0;
    const activeChanged = Number(this.db.prepare("INSERT INTO partition_plugins (partition_id, plugin_id, enabled_at, enabled_by) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING")
      .run(projectId, pluginId, at, actorId).changes) > 0;
    return portableChanged || activeChanged;
  }

  removeProjectPlugin(projectId: string, pluginId: ProjectPluginId): boolean {
    const portableChanged = Number(this.db.prepare('DELETE FROM project_portable_plugins WHERE project_id=? AND plugin_id=?').run(projectId,pluginId).changes)>0;
    const activeChanged = Number(this.db.prepare("DELETE FROM partition_plugins WHERE partition_id = ? AND plugin_id = ?")
      .run(projectId, pluginId).changes) > 0;
    return portableChanged || activeChanged;
  }

  /**
   * A live project's stored members and latest member add or remove, in one statement; null when there is no such
   * project. The latest event is what lets a revision tell an add-then-remove from no change. Both lists keep `ORDER BY plugin_id`.
   */
  pluginMembershipFacts(projectId: string): StoredPluginMembershipFacts | null {
    // The append order (rowid) is independent of the supplied clock and event id.
    const rows = this.db.prepare(`
      SELECT 'project' AS kind, (
        SELECT event_id FROM project_events
        WHERE project_id = ?1 AND type IN ('project.plugin_added', 'project.plugin_removed')
        ORDER BY rowid DESC LIMIT 1
      ) AS value
      FROM projects WHERE project_id = ?1 AND project_id NOT IN (SELECT project_id FROM project_recycle WHERE recycled=1)
      UNION ALL SELECT 'plugin', plugin_id FROM partition_plugins WHERE partition_id = ?1
      ORDER BY kind, value
    `).all(projectId) as { kind: "project" | "plugin"; value: string | null }[];
    const project = rows.find(row => row.kind === "project");
    if (!project) return null;
    return { plugins: rows.filter(row => row.kind === "plugin").map(row => text(row.value)), latest_event_id: project.value == null ? null : text(project.value) };
  }

  renameProject(projectId: string, displayName: string, updatedAt: string): void {
    this.db.prepare("UPDATE projects SET display_name = ?, updated_at = ? WHERE project_id = ?")
      .run(displayName, updatedAt, projectId);
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

function mapProject(row: Row, projectsDirectory: string): ProjectRecord {
  return {
    project_id: text(row.project_id),
    display_name: text(row.display_name),
    database_path: projectDatabasePath(projectsDirectory, text(row.project_id)),
    source: "created",
    data_class: projectDataClass(row.data_class),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
}

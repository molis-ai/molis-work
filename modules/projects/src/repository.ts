import type {
  ProjectPluginId,
  ProjectDeletionRecord,
  ProjectRecord,
  ProjectSelection,
  ProjectWorkspaceDirectoryRecord,
  ProjectWorkspaceMembership,
  ProjectWorkspaceRef,
} from "@molis-ai/molis-work-contracts/modules/projects";

type Row = Record<string, unknown>;

export interface ProjectsSqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid?: number | bigint };
}

export interface ProjectsSqliteDatabase {
  prepare(sql: string): ProjectsSqliteStatement;
  exec(sql: string): void;
  pragma(source: string): unknown;
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
}

export interface StoredProjectDeletion extends ProjectDeletionRecord {
  idempotency_key: string;
  request_fingerprint: string;
  staged_directory: string;
}

export class ProjectsRepository {
  constructor(readonly db: ProjectsSqliteDatabase) {}

  transaction<T>(operation: () => T): T {
    return this.db.transaction(operation)();
  }

  listProjects(): ProjectRecord[] {
    return (this.db.prepare(
      "SELECT * FROM projects ORDER BY display_name COLLATE NOCASE, created_at, project_id",
    ).all() as Row[]).map(mapProject);
  }

  getProject(projectId: string): ProjectRecord | null {
    const row = this.db.prepare("SELECT * FROM projects WHERE project_id = ?").get(projectId) as Row | undefined;
    return row ? mapProject(row) : null;
  }

  insertProject(record: ProjectRecord): void {
    this.db.prepare(`
      INSERT INTO projects (
        project_id, display_name, board_id, database_path, source,
        data_class, migrated_from_path, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.project_id,
      record.display_name,
      record.board_id,
      record.database_path,
      "created",
      record.data_class,
      null,
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

  listWorkspaceMemberships(): ProjectWorkspaceMembership[] {
    return (this.db.prepare(`
      SELECT membership.membership_id, membership.workspace_id,
        workspace.display_name AS workspace_name, workspace.realpath_verified,
        membership.project_id, membership.is_default, membership.bound_by,
        membership.created_at, membership.updated_at
      FROM workspace_project_memberships AS membership
      INNER JOIN workspaces AS workspace ON workspace.workspace_id = membership.workspace_id
      ORDER BY workspace.display_name COLLATE NOCASE, membership.is_default DESC,
        membership.updated_at DESC, membership.project_id
    `).all() as Row[]).map(mapWorkspaceMembership);
  }

  listWorkspaceDirectory(projectId?: string): ProjectWorkspaceDirectoryRecord[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT workspace.workspace_id, workspace.canonical_path,
        workspace.realpath_verified, workspace.display_name,
        workspace.created_at, workspace.updated_at
      FROM workspaces AS workspace
      ${projectId ? "INNER JOIN workspace_project_memberships AS selected_membership ON selected_membership.workspace_id = workspace.workspace_id" : ""}
      ${projectId ? "WHERE selected_membership.project_id = ?" : ""}
      ORDER BY workspace.display_name COLLATE NOCASE, workspace.canonical_path
    `).all(...(projectId ? [projectId] : [])) as Row[];
    const memberships = this.listWorkspaceMemberships();
    return rows.map((row) => ({
      workspace_id: text(row.workspace_id),
      canonical_path: text(row.canonical_path),
      realpath_verified: booleanInt(row.realpath_verified),
      display_name: text(row.display_name),
      project_ids: memberships
        .filter((membership) => membership.workspace_id === text(row.workspace_id))
        .map((membership) => membership.project_id),
      created_at: text(row.created_at),
      updated_at: text(row.updated_at),
    }));
  }

  preferredWorkspacePath(projectId: string): string | null {
    const row = this.db.prepare(`
      SELECT workspace.canonical_path AS canonical_path
      FROM workspace_project_memberships AS membership
      INNER JOIN workspaces AS workspace ON workspace.workspace_id = membership.workspace_id
      WHERE membership.project_id = ?
      ORDER BY membership.is_default DESC, membership.updated_at DESC, membership.membership_id
      LIMIT 1
    `).get(projectId) as Row | undefined;
    return row?.canonical_path == null ? null : text(row.canonical_path);
  }

  workspaceProjectSelections(workspaceId: string): ProjectSelection[] {
    return (this.db.prepare(`
      SELECT project.project_id, project.display_name
      FROM workspace_project_memberships AS membership
      INNER JOIN projects AS project ON project.project_id = membership.project_id
      WHERE membership.workspace_id = ?
      ORDER BY membership.updated_at DESC, project.display_name COLLATE NOCASE
    `).all(workspaceId) as Row[]).map((row) => ({
      project_id: text(row.project_id),
      display_name: text(row.display_name),
    }));
  }

  upsertWorkspace(workspace: ProjectWorkspaceRef, now: string): void {
    this.db.prepare(`
      INSERT INTO workspaces (
        workspace_id, canonical_path, realpath_verified, display_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        canonical_path = excluded.canonical_path,
        realpath_verified = excluded.realpath_verified,
        display_name = excluded.display_name,
        updated_at = excluded.updated_at
    `).run(
      workspace.workspace_id,
      workspace.canonical_path,
      workspace.realpath_verified ? 1 : 0,
      workspace.display_name,
      now,
      now,
    );
  }

  upsertWorkspaceMembership(input: {
    membership_id: string;
    workspace_id: string;
    project_id: string;
    actor_id: string;
    now: string;
  }): void {
    this.db.prepare(`
      INSERT INTO workspace_project_memberships (
        membership_id, workspace_id, project_id, is_default, bound_by, created_at, updated_at
      ) VALUES (?, ?, ?, 0, ?, ?, ?)
      ON CONFLICT(workspace_id, project_id) DO UPDATE SET
        is_default = 0,
        bound_by = excluded.bound_by,
        updated_at = excluded.updated_at
    `).run(
      input.membership_id,
      input.workspace_id,
      input.project_id,
      input.actor_id,
      input.now,
      input.now,
    );
  }

  removeWorkspaceMembership(workspaceId: string, projectId: string): number {
    return Number(this.db.prepare(
      "DELETE FROM workspace_project_memberships WHERE workspace_id = ? AND project_id = ?",
    ).run(workspaceId, projectId).changes);
  }

  removeWorkspaceMembershipsForProject(projectId: string): number {
    return Number(this.db.prepare(
      "DELETE FROM workspace_project_memberships WHERE project_id = ?",
    ).run(projectId).changes);
  }

  removeWorkspaceIfEmpty(workspaceId: string): void {
    this.db.prepare(`
      DELETE FROM workspaces
      WHERE workspace_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM workspace_project_memberships
          WHERE workspace_project_memberships.workspace_id = workspaces.workspace_id
        )
    `).run(workspaceId);
  }

  findDeletion(actorId: string, idempotencyKey: string): StoredProjectDeletion | null {
    const row = this.db.prepare(
      "SELECT * FROM project_deletions WHERE actor_id = ? AND idempotency_key = ?",
    ).get(actorId, idempotencyKey) as Row | undefined;
    return row ? mapStoredProjectDeletion(row) : null;
  }

  getDeletion(deletionId: string): StoredProjectDeletion | null {
    const row = this.db.prepare("SELECT * FROM project_deletions WHERE deletion_id = ?")
      .get(deletionId) as Row | undefined;
    return row ? mapStoredProjectDeletion(row) : null;
  }

  listProjectDeletions(): ProjectDeletionRecord[] {
    return (this.db.prepare(
      "SELECT * FROM project_deletions ORDER BY deleted_at DESC, deletion_id DESC",
    ).all() as Row[]).map((row) => deletionRecord(mapStoredProjectDeletion(row)));
  }

  insertDeletion(record: StoredProjectDeletion): void {
    this.db.prepare(`
      INSERT INTO project_deletions (
        deletion_id, actor_id, idempotency_key, request_fingerprint,
        project_id, display_name, board_id, staged_directory, deleted_binding_count,
        cleanup_state, cleanup_error, deleted_at, cleaned_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.deletion_id,
      record.actor_id,
      record.idempotency_key,
      record.request_fingerprint,
      record.project_id,
      record.display_name,
      record.board_id,
      record.staged_directory,
      record.deleted_binding_count,
      record.cleanup_state,
      record.cleanup_error,
      record.deleted_at,
      record.cleaned_at,
    );
  }

  updateDeletionCleanup(
    deletionId: string,
    input: { state: "complete" | "pending"; error: string | null; cleaned_at: string | null },
  ): void {
    this.db.prepare(`
      UPDATE project_deletions
      SET cleanup_state = ?, cleanup_error = ?, cleaned_at = ?
      WHERE deletion_id = ?
    `).run(input.state, input.error, input.cleaned_at, deletionId);
  }
}

export function createProjectsSchema(db: ProjectsSqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      project_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      board_id TEXT NOT NULL,
      database_path TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL CHECK (source IN ('created')),
      data_class TEXT NOT NULL CHECK (data_class IN ('user', 'regenerable_demo')),
      migrated_from_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS projects_display_name_idx
      ON projects(display_name COLLATE NOCASE, project_id);
    CREATE TABLE IF NOT EXISTS project_plugins (
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      plugin_id TEXT NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (project_id, plugin_id)
    );
    CREATE TABLE IF NOT EXISTS project_plugin_exclusions (
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      plugin_id TEXT NOT NULL,
      removed_at TEXT NOT NULL,
      PRIMARY KEY (project_id, plugin_id)
    );
    CREATE TABLE IF NOT EXISTS project_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS project_events_project_idx
      ON project_events(project_id, created_at, event_id);
    CREATE TABLE IF NOT EXISTS workspaces (
      workspace_id TEXT PRIMARY KEY,
      canonical_path TEXT NOT NULL UNIQUE,
      realpath_verified INTEGER NOT NULL CHECK (realpath_verified IN (0, 1)),
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workspace_project_memberships (
      membership_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      is_default INTEGER NOT NULL CHECK (is_default IN (0, 1)),
      bound_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(workspace_id, project_id)
    );
    CREATE INDEX IF NOT EXISTS workspace_project_memberships_project_idx
      ON workspace_project_memberships(project_id, workspace_id);
    CREATE UNIQUE INDEX IF NOT EXISTS workspace_project_memberships_one_default_idx
      ON workspace_project_memberships(workspace_id) WHERE is_default = 1;
    CREATE TABLE IF NOT EXISTS project_deletions (
      deletion_id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      project_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      board_id TEXT NOT NULL,
      staged_directory TEXT NOT NULL,
      deleted_binding_count INTEGER NOT NULL,
      cleanup_state TEXT NOT NULL CHECK (cleanup_state IN ('complete', 'pending')),
      cleanup_error TEXT,
      deleted_at TEXT NOT NULL,
      cleaned_at TEXT,
      UNIQUE(actor_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS project_deletions_project_idx
      ON project_deletions(project_id, deleted_at, deletion_id);
  `);
}

/**
 * Drop the closed plugin-id CHECK. Which Plugins exist is a runtime registry
 * question, so installing one must never require another table rebuild.
 * Existing rows are carried over unchanged.
 */
export function migrateProjectOpenPluginSchema(db: ProjectsSqliteDatabase): void {
  db.exec(`
    CREATE TABLE project_plugins_open_next (
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      plugin_id TEXT NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (project_id, plugin_id)
    );
    INSERT INTO project_plugins_open_next SELECT project_id, plugin_id, added_at FROM project_plugins;
    DROP TABLE project_plugins;
    ALTER TABLE project_plugins_open_next RENAME TO project_plugins;
  `);
}

export function migrateProjectInboxPluginSchema(db: ProjectsSqliteDatabase): void {
  db.exec(`
    CREATE TABLE project_plugins_inbox_next (
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      plugin_id TEXT NOT NULL CHECK (plugin_id IN ('goals', 'task', 'sessions', 'inbox', 'feed', 'artifacts')),
      added_at TEXT NOT NULL,
      PRIMARY KEY (project_id, plugin_id)
    );
    INSERT INTO project_plugins_inbox_next SELECT project_id, plugin_id, added_at FROM project_plugins;
    DROP TABLE project_plugins;
    ALTER TABLE project_plugins_inbox_next RENAME TO project_plugins;
    INSERT OR IGNORE INTO project_plugins (project_id, plugin_id, added_at)
    SELECT project_id, 'inbox', added_at FROM project_plugins WHERE plugin_id = 'feed';
  `);
}

export function migrateProjectTaskPluginSchema(db: ProjectsSqliteDatabase): void {
  db.exec(`
    CREATE TABLE project_plugins_task_next (
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      plugin_id TEXT NOT NULL CHECK (plugin_id IN ('goals', 'task', 'sessions', 'inbox', 'feed', 'artifacts')),
      added_at TEXT NOT NULL,
      PRIMARY KEY (project_id, plugin_id)
    );
    INSERT INTO project_plugins_task_next SELECT project_id, plugin_id, added_at FROM project_plugins;
    DROP TABLE project_plugins;
    ALTER TABLE project_plugins_task_next RENAME TO project_plugins;
    INSERT OR IGNORE INTO project_plugins (project_id, plugin_id, added_at)
    SELECT project_id, 'task', added_at FROM project_plugins WHERE plugin_id = 'goals';
  `);
}

/** A project can hide an always-on plugin without deleting that plugin's own data. */
export function migrateProjectPluginExclusionSchema(db: ProjectsSqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_plugin_exclusions (
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      plugin_id TEXT NOT NULL,
      removed_at TEXT NOT NULL,
      PRIMARY KEY (project_id, plugin_id)
    );
  `);
}

export function migrateProjectDropTaskPluginSchema(db: ProjectsSqliteDatabase): void {
  db.exec(`
    CREATE TABLE project_plugins_drop_task (
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      plugin_id TEXT NOT NULL CHECK (plugin_id IN ('goals', 'sessions', 'inbox', 'feed', 'artifacts')),
      added_at TEXT NOT NULL,
      PRIMARY KEY (project_id, plugin_id)
    );
    INSERT INTO project_plugins_drop_task
      SELECT project_id, plugin_id, added_at FROM project_plugins WHERE plugin_id != 'task';
    DROP TABLE project_plugins;
    ALTER TABLE project_plugins_drop_task RENAME TO project_plugins;
  `);
}

export function migrateProjectDataClassSchema(db: ProjectsSqliteDatabase): void {
  const columns = db.pragma("table_info(projects)") as Array<{ name?: unknown }>;
  if (!columns.some((column) => column.name === "data_class")) {
    db.exec(`
      ALTER TABLE projects ADD COLUMN data_class TEXT NOT NULL DEFAULT 'user'
        CHECK (data_class IN ('user', 'migrated_user', 'regenerable_demo'));
    `);
  }
  db.exec(`
    UPDATE projects
    SET data_class = CASE WHEN source = 'migrated' THEN 'migrated_user' ELSE 'user' END
    WHERE data_class <> 'regenerable_demo';
  `);
}

export function migrateProjectDropLegacyImportSchema(db: ProjectsSqliteDatabase): void {
  db.exec(`
    UPDATE projects SET data_class = 'user' WHERE data_class = 'migrated_user';
    UPDATE projects SET source = 'created', migrated_from_path = NULL WHERE source = 'migrated';
  `);
}

function projectDataClass(value: unknown): ProjectRecord["data_class"] {
  return text(value) === "regenerable_demo" ? "regenerable_demo" : "user";
}

function mapProject(row: Row): ProjectRecord {
  return {
    project_id: text(row.project_id),
    display_name: text(row.display_name),
    board_id: text(row.board_id),
    database_path: text(row.database_path),
    source: "created",
    data_class: projectDataClass(row.data_class),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
}

function mapWorkspaceMembership(row: Row): ProjectWorkspaceMembership {
  return {
    membership_id: text(row.membership_id),
    workspace_id: text(row.workspace_id),
    workspace_name: text(row.workspace_name),
    realpath_verified: booleanInt(row.realpath_verified),
    project_id: text(row.project_id),
    is_default: booleanInt(row.is_default),
    bound_by: text(row.bound_by),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
}

function mapStoredProjectDeletion(row: Row): StoredProjectDeletion {
  return {
    deletion_id: text(row.deletion_id),
    actor_id: text(row.actor_id),
    idempotency_key: text(row.idempotency_key),
    request_fingerprint: text(row.request_fingerprint),
    project_id: text(row.project_id),
    display_name: text(row.display_name),
    board_id: text(row.board_id),
    staged_directory: text(row.staged_directory),
    deleted_binding_count: numeric(row.deleted_binding_count),
    cleanup_state: text(row.cleanup_state) as StoredProjectDeletion["cleanup_state"],
    cleanup_error: nullableText(row.cleanup_error),
    deleted_at: text(row.deleted_at),
    cleaned_at: nullableText(row.cleaned_at),
  };
}

function deletionRecord(record: StoredProjectDeletion): ProjectDeletionRecord {
  return {
    deletion_id: record.deletion_id,
    project_id: record.project_id,
    display_name: record.display_name,
    board_id: record.board_id,
    actor_id: record.actor_id,
    deleted_binding_count: record.deleted_binding_count,
    cleanup_state: record.cleanup_state,
    cleanup_error: record.cleanup_error,
    deleted_at: record.deleted_at,
    cleaned_at: record.cleaned_at,
  };
}

const text = (value: unknown) => String(value);
const nullableText = (value: unknown) => value == null ? null : String(value);
const booleanInt = (value: unknown) => Number(value) === 1;
const numeric = (value: unknown) => Number(value);

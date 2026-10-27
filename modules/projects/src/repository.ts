import { ProjectDeletionRepository } from "./deletion-repository.js";
import { createDeletionStepsSchema } from "./deletion-steps.js";
import { ProjectRecordsRepository } from "./project-records-repository.js";
import type { ProjectsSqliteDatabase } from "./sqlite.js";
import { WorkspaceRepository } from "./workspace-repository.js";

/** The catalog database's three table families, each read and written by its own class; the transaction spans them. */
export class ProjectsRepository {
  readonly projects: ProjectRecordsRepository;
  readonly workspaces: WorkspaceRepository;
  readonly deletions: ProjectDeletionRepository;

  constructor(readonly db: ProjectsSqliteDatabase) {
    this.projects = new ProjectRecordsRepository(db);
    this.workspaces = new WorkspaceRepository(db);
    this.deletions = new ProjectDeletionRepository(db);
  }

  transaction<T>(operation: () => T): T {
    return this.db.transaction(operation)();
  }
}

export function createProjectsSchema(db: ProjectsSqliteDatabase): void {
  createDeletionStepsSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      project_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      database_path TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL CHECK (source IN ('created')),
      data_class TEXT NOT NULL CHECK (data_class IN ('user', 'regenerable_demo')),
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
      staged_directory TEXT NOT NULL,
      deleted_binding_count INTEGER NOT NULL,
      cleanup_state TEXT NOT NULL CHECK (cleanup_state IN ('complete', 'pending')),
      cleanup_error TEXT,
      deleted_at TEXT NOT NULL,
      cleaned_at TEXT,
      recovery_plan TEXT,
      UNIQUE(actor_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS project_deletions_project_idx
      ON project_deletions(project_id, deleted_at, deletion_id);
  `);
}

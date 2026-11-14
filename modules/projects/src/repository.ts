import { ProjectDeletionRepository } from "./deletion-repository.js";
import { createProjectRecycleSchema } from "./recycle.js";
import { createDeletionStepsSchema } from "./deletion-steps.js";
import { ProjectRecordsRepository } from "./project-records-repository.js";
import type { ProjectsSqliteDatabase } from "./sqlite.js";
import { WorkspaceRepository } from "./workspace-repository.js";

/** The catalog database's table families, each read and written by its own class; the transaction spans them. */
export class ProjectsRepository {
  readonly projects: ProjectRecordsRepository;
  readonly workspaces: WorkspaceRepository;
  readonly deletions: ProjectDeletionRepository;

  constructor(readonly db: ProjectsSqliteDatabase, projectsDirectory: string, outputsDirectory: string, spaceId?: string) {
    this.projects = new ProjectRecordsRepository(db, projectsDirectory, spaceId);
    this.workspaces = new WorkspaceRepository(db, outputsDirectory);
    this.deletions = new ProjectDeletionRepository(db);
  }

  transaction<T>(operation: () => T): T {
    return this.db.transaction(operation)();
  }
}

/**
 * A folder's link to a project and what it is there (specs/shared-sources-and-surfaces §3): an input, the output, or both. One link per
 * project carries the output. The catalog upgrade to version 2 builds this table from the same text (`catalog-upgrade.ts`).
 */
export const WORKSPACE_MEMBERSHIPS_SQL = `
    CREATE TABLE IF NOT EXISTS workspace_project_memberships (
      membership_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      role_input INTEGER NOT NULL CHECK (role_input IN (0, 1)),
      role_output INTEGER NOT NULL CHECK (role_output IN (0, 1)),
      bound_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(workspace_id, project_id),
      CHECK (role_input = 1 OR role_output = 1)
    );
    CREATE INDEX IF NOT EXISTS workspace_project_memberships_project_idx
      ON workspace_project_memberships(project_id, workspace_id);
    CREATE UNIQUE INDEX IF NOT EXISTS workspace_project_memberships_one_output_idx
      ON workspace_project_memberships(project_id) WHERE role_output = 1;
`;

/**
 * Which folder of this project stands for another device's directory id (§3 「另一台设备上的引用」). Kept on this device alone: the project's
 * synced projection (`portable-project.ts`) does not carry it.
 */
export const WORKSPACE_SOURCE_LINKS_SQL = `
    CREATE TABLE IF NOT EXISTS workspace_source_links (
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      source_workspace_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      bound_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, source_workspace_id)
    );
    CREATE INDEX IF NOT EXISTS workspace_source_links_workspace_idx
      ON workspace_source_links(workspace_id);
`;

/**
 * Whether a project's rounds read the repository's instruction files, and which output the person confirmed for it (batch12-design §3.3).
 * No row is the default: read, nothing confirmed. A device fact, beside the output it is about: never in the synced projection. The
 * catalog upgrade to version 4 makes this table from the same text (`catalog-upgrade.ts`).
 */
export const PROJECT_INSTRUCTION_SETTINGS_SQL = `
    CREATE TABLE IF NOT EXISTS project_instruction_settings (
      project_id TEXT PRIMARY KEY REFERENCES projects(project_id) ON DELETE CASCADE,
      off INTEGER NOT NULL CHECK (off IN (0, 1)),
      confirmed_workspace_id TEXT,
      updated_at TEXT NOT NULL
    );
`;

export function createProjectsSchema(db: ProjectsSqliteDatabase): void {
  createDeletionStepsSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      project_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
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
    CREATE TABLE IF NOT EXISTS project_portable_plugins (
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      plugin_id TEXT NOT NULL,
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
      UNIQUE(actor_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS project_deletions_project_idx
      ON project_deletions(project_id, deleted_at, deletion_id);
  `);
  db.exec(WORKSPACE_MEMBERSHIPS_SQL);
  db.exec(WORKSPACE_SOURCE_LINKS_SQL);
  db.exec(PROJECT_INSTRUCTION_SETTINGS_SQL);
  createProjectRecycleSchema(db);
}

// The project itself inside its own library (PG-021, specs/plugin-project-database §2.4). The library is the project's, so its
// identity is one row here, not Goals' board: every table of the library that belongs to a project points its foreign key at it,
// a plugin's declared tables included. The title is not kept: the Catalog's display name is the one truth.
import { randomUUID } from "node:crypto";
import { projectCatalogErrors } from "@molis-ai/molis-work-contracts/modules/projects";

/** Made first in the project library's baseline. A library holds exactly one row, checked when a project is made or validated. */
export const PROJECT_ROOT_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS project_root (
      project_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      data_instance_id TEXT NOT NULL CHECK (length(trim(data_instance_id)) > 0)
    );
`;

export interface ProjectRootRow {
  readonly project_id: string;
  readonly created_at: string;
  /** Persistent identity of this data instance; never a replacement for the business project_id. */
  readonly data_instance_id: string;
}

export interface ProjectRootDatabase {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number | bigint };
    all(...params: unknown[]): unknown[];
  };
}

/** Write the project's root row; for a project that has one already, nothing changes. True when this call wrote it. */
export function writeProjectRoot(db: ProjectRootDatabase, projectId: string, createdAt: string): boolean {
  const result = db.prepare("INSERT INTO project_root (project_id, created_at, data_instance_id) VALUES (?, ?, ?) ON CONFLICT(project_id) DO NOTHING")
    .run(projectId, createdAt, randomUUID());
  return Number(result.changes) === 1;
}

/** The root rows of a library, oldest first. */
export function listProjectRoots(db: ProjectRootDatabase): ProjectRootRow[] {
  return (db.prepare("SELECT project_id, created_at, data_instance_id FROM project_root ORDER BY created_at, project_id").all() as Array<Record<string, unknown>>)
    .map(row => {
      if (typeof row.data_instance_id !== "string" || !row.data_instance_id.trim())
        throw projectCatalogErrors.project_storage_invalid("项目数据实例身份缺失或形状不符");
      return { project_id: String(row.project_id), created_at: String(row.created_at), data_instance_id: row.data_instance_id };
    });
}

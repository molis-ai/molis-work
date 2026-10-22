// The project itself inside its own library (PG-021, specs/plugin-project-database §2.4). The library is the project's, so its
// identity is one row here, not Goals' board: every table of the library that belongs to a project points its foreign key at it,
// a plugin's declared tables included. The title is not kept: the Catalog's display name is the one truth.

/** Made first in the project library's baseline. A library holds exactly one row, checked when a project is made or validated. */
export const PROJECT_ROOT_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS project_root (
      project_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );
`;

export interface ProjectRootRow {
  readonly project_id: string;
  readonly created_at: string;
}

export interface ProjectRootDatabase {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number | bigint };
    all(...params: unknown[]): unknown[];
  };
}

/** Write the project's root row; for a project that has one already, nothing changes. True when this call wrote it. */
export function writeProjectRoot(db: ProjectRootDatabase, projectId: string, createdAt: string): boolean {
  const result = db.prepare("INSERT INTO project_root (project_id, created_at) VALUES (?, ?) ON CONFLICT(project_id) DO NOTHING").run(projectId, createdAt);
  return Number(result.changes) === 1;
}

/** The root rows of a library, oldest first. */
export function listProjectRoots(db: ProjectRootDatabase): ProjectRootRow[] {
  return (db.prepare("SELECT project_id, created_at FROM project_root ORDER BY created_at, project_id").all() as Array<Record<string, unknown>>)
    .map(row => ({ project_id: String(row.project_id), created_at: String(row.created_at) }));
}

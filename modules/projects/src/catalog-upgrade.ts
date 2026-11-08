import { insertProjectOutput } from "./project-output.js";
import { WORKSPACE_MEMBERSHIPS_SQL, WORKSPACE_SOURCE_LINKS_SQL } from "./repository.js";
import type { Row } from "./sqlite.js";

/**
 * The catalog from version 1 to 2, the Projects tables' part (specs/shared-sources-and-surfaces §8, upgrade-chain-design §14). It is the
 * first real upgrade, and changes in one step what version 1 had, without keeping the old column for a version (user 2026-11-08): no
 * program older than version 2 opens it anyway.
 *
 * - `is_default` gives way to the two role columns. The table is rebuilt so the table-level check fits; no other table refers to it.
 *   A project with exactly one folder makes it its output (and still an input), so a project that worked in its own folder keeps writing
 *   there; with several, every folder is an input (user 2026-11-08).
 * - `workspace_source_links` starts empty.
 */
export const PROJECTS_CATALOG_UPGRADE_1_SQL = `
DROP INDEX workspace_project_memberships_one_default_idx;
DROP INDEX workspace_project_memberships_project_idx;
ALTER TABLE workspace_project_memberships RENAME TO workspace_project_memberships_v1;
${WORKSPACE_MEMBERSHIPS_SQL}
INSERT INTO workspace_project_memberships (membership_id, workspace_id, project_id, role_input, role_output, bound_by, created_at, updated_at)
  SELECT old.membership_id, old.workspace_id, old.project_id, 1,
    CASE WHEN (SELECT COUNT(*) FROM workspace_project_memberships_v1 AS other WHERE other.project_id = old.project_id) = 1 THEN 1 ELSE 0 END,
    old.bound_by, old.created_at, old.updated_at
  FROM workspace_project_memberships_v1 AS old;
DROP TABLE workspace_project_memberships_v1;
${WORKSPACE_SOURCE_LINKS_SQL}
`;

const UPGRADE_ACTOR = "molis-work-upgrade";

/** The upgrade step's connection (`SqliteBaselineDatabase`), as far as these functions use it. */
interface CatalogUpgradeDatabase { prepare(sql: string): { get(...params: unknown[]): unknown; all(...params: unknown[]): unknown[]; run(...params: unknown[]): unknown } }

/**
 * Every project with no output yet gets its default output directory: a row and a membership, from the project's id and its earliest event,
 * at the project's own `created_at`. The recycle bin's projects too, or a restored one would have no output. It reads and writes the
 * catalog only, never the Home: the folder is made the first time it is used. A project with no event cannot be given one and fails the
 * upgrade, which puts the catalog back (upgrade-chain-design §8.1).
 */
export function fillProjectOutputs(db: CatalogUpgradeDatabase): void {
  const projects = db.prepare(`SELECT project_id, created_at FROM projects
    WHERE project_id NOT IN (SELECT project_id FROM workspace_project_memberships WHERE role_output = 1) ORDER BY project_id`).all() as Row[];
  for (const project of projects) insertProjectOutput(db, String(project.project_id), String(project.created_at), UPGRADE_ACTOR);
}

/** After the step: every project has exactly one output, and the old column is gone. */
export function verifyProjectOutputs(db: CatalogUpgradeDatabase): void {
  const without = db.prepare("SELECT project_id FROM projects WHERE project_id NOT IN (SELECT project_id FROM workspace_project_memberships WHERE role_output = 1)").all();
  if (without.length) throw new Error(`${without.length} 个项目升级后没有输出目录`);
  const columns = (db.prepare("PRAGMA table_info(workspace_project_memberships)").all() as Row[]).map(row => String(row.name));
  if (columns.includes("is_default")) throw new Error("升级后成员表还有 is_default");
}

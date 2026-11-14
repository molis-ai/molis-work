import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";

import { insertProjectOutput } from "./project-output.js";
import { PROJECT_INSTRUCTION_SETTINGS_SQL, WORKSPACE_MEMBERSHIPS_SQL, WORKSPACE_SOURCE_LINKS_SQL } from "./repository.js";
import type { Row } from "./sqlite.js";
import { projectHasPersonMembership } from "./workspace-repository.js";

/**
 * The catalog from version 1 to 2, the Projects tables' part (specs/shared-sources-and-surfaces §8, upgrade-chain-design §14). It is the
 * first real upgrade, and changes in one step what version 1 had, without keeping the old column for a version (user 2026-11-08): no
 * program older than version 2 opens it anyway.
 *
 * - `is_default` gives way to the two role columns. The table is rebuilt so the table-level check fits; no other table refers to it.
 *   The old rows are copied aside and the table made anew (no rename, so no table is patched in place: upgrade-chain-design §11.4).
 *   A project with exactly one folder makes it its output (and still an input), so a project that worked in its own folder keeps writing
 *   there; with several, every folder is an input (user 2026-11-08).
 * - `workspace_source_links` starts empty.
 */
export const PROJECTS_CATALOG_UPGRADE_1_SQL = `
CREATE TABLE workspace_project_memberships_v1 AS SELECT * FROM workspace_project_memberships;
DROP TABLE workspace_project_memberships;
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
interface CatalogUpgradeDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): { get(...params: unknown[]): unknown; all(...params: unknown[]): unknown[]; run(...params: unknown[]): unknown };
}

/**
 * Whether `path` is a worktree the Host made for a writer of one of `others`, the other folders linked to the same project. The Host's
 * own rule (where it makes them), so the catalog never guesses one from a name.
 */
export type HostWorktreeTest = (path: string, others: readonly string[]) => boolean;

/**
 * The step from version 1 to 2, in order. First the links a Host before version 2 made for writers' worktrees go: they are not folders
 * the person linked (a worktree is now named by its own id and never linked, plan A, coordinator 2026-11-08), and left in they would make
 * a project that works in one folder count as several, and show inputs nobody added. Then the roles (`PROJECTS_CATALOG_UPGRADE_1_SQL`),
 * then every project's default output.
 */
export function upgradeProjectsCatalog1(isHostWorktree: HostWorktreeTest): (db: CatalogUpgradeDatabase) => void {
  return db => {
    dropHostWorktreeLinks(db, isHostWorktree);
    db.exec(PROJECTS_CATALOG_UPGRADE_1_SQL);
    fillProjectOutputs(db);
  };
}

/**
 * Removes, from a version-1 catalog, each link whose folder the Host recognises as a writer's worktree of another folder of the same
 * project, and the folder's row when no project links it any more (as unlinking does). Every other link stays as it was.
 */
export function dropHostWorktreeLinks(db: CatalogUpgradeDatabase, isHostWorktree: HostWorktreeTest): void {
  const links = db.prepare(`SELECT memberships.membership_id, memberships.project_id, memberships.workspace_id, workspaces.canonical_path
    FROM workspace_project_memberships AS memberships JOIN workspaces ON workspaces.workspace_id = memberships.workspace_id
    ORDER BY memberships.project_id, memberships.membership_id`).all() as Row[];
  const byProject = new Map<string, Row[]>();
  for (const link of links) byProject.set(String(link.project_id), [...byProject.get(String(link.project_id)) ?? [], link]);
  for (const project of byProject.values()) {
    const paths = project.map(link => String(link.canonical_path));
    for (const link of project) {
      const path = String(link.canonical_path);
      if (!isHostWorktree(path, paths.filter(other => other !== path))) continue;
      db.prepare("DELETE FROM workspace_project_memberships WHERE membership_id = ?").run(link.membership_id);
      db.prepare("DELETE FROM workspaces WHERE workspace_id = ? AND NOT EXISTS (SELECT 1 FROM workspace_project_memberships WHERE workspace_id = ?)").run(link.workspace_id, link.workspace_id);
    }
  }
}

/**
 * Every project with no output yet gets its default output directory: a row and a membership, from the project's id and its earliest event,
 * at the project's own `created_at`. The recycle bin's projects too, or a restored one would have no output. It reads and writes the
 * catalog only, never the Home: the folder is made the first time it is used. A project with no event cannot be given one and fails the
 * upgrade, which puts the catalog back (upgrade-chain-design §8.1).
 */
export function fillProjectOutputs(db: CatalogUpgradeDatabase): void {
  const projects = db.prepare(`SELECT project_id, created_at FROM projects
    WHERE project_id NOT IN (SELECT project_id FROM workspace_project_memberships WHERE role_output = 1) ORDER BY project_id`).all() as Row[];
  for (const project of projects) {
    const projectId = String(project.project_id);
    insertProjectOutput(db, projectId, String(project.created_at), outputBoundBy(db, projectId));
  }
}

/**
 * Who a filled-in default output is recorded as made by: as for a project made now, whose default output carries whoever registered it
 * (user 2026-11-09, A). A version-1 project has no record of who registered it, so its own links stand in for it: if the person made any one
 * of them (`bound_by` exactly the person's id, the allow-list of `projectHasPersonMembership`), the person, since a project the person linked
 * a folder to is one they work in; which one does not matter, one is enough. Otherwise the upgrade's mark, which does not count as the
 * person's. The links read are the ones left by now: the writers' worktree links the Host wrote with the person's id are dropped first, as
 * they are not folders the person linked. A project with no link at all keeps the upgrade's mark.
 */
function outputBoundBy(db: CatalogUpgradeDatabase, projectId: string): string {
  return projectHasPersonMembership(db, projectId) ? LOCAL_PERSON_ACTOR_ID : UPGRADE_ACTOR;
}

/** After the step: every project has exactly one output, and the old column is gone. */
export function verifyProjectOutputs(db: CatalogUpgradeDatabase): void {
  const without = db.prepare("SELECT project_id FROM projects WHERE project_id NOT IN (SELECT project_id FROM workspace_project_memberships WHERE role_output = 1)").all();
  if (without.length) throw new Error(`${without.length} 个项目升级后没有输出目录`);
  const columns = (db.prepare("PRAGMA table_info(workspace_project_memberships)").all() as Row[]).map(row => String(row.name));
  if (columns.includes("is_default")) throw new Error("升级后成员表还有 is_default");
}

/**
 * The catalog from version 3 to 4, the Projects tables' part (specs/coding-harness-optimization/batch12-design.md §3.3): the table for
 * the repository's instruction files only. It starts empty, which reads as the default for every project (read, nothing confirmed), so no
 * row is filled in and no other table changes.
 */
export function upgradeProjectsCatalog3(db: CatalogUpgradeDatabase): void {
  db.exec(PROJECT_INSTRUCTION_SETTINGS_SQL);
}

import { realpathSync } from "node:fs";
import path from "node:path";

import type {
  DirectoryRole,
  ProjectSelection,
  ProjectWorkspaceDirectoryRecord,
  ProjectWorkspaceMembership,
  ProjectWorkspaceRef,
} from "@molis-ai/molis-work-contracts/modules/projects";
import { projectCatalogErrors as catalogErrors } from "@molis-ai/molis-work-contracts/modules/projects";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";

import { PROJECT_OUTPUT_PATH_PREFIX, projectOutputDirectoryPath } from "./project-output.js";
import { booleanInt, text, type ProjectsSqliteDatabase, type Row } from "./sqlite.js";

/** One row of `workspace_project_memberships` with the folder it names, as this project sees it. */
export interface ProjectDirectoryRow extends ProjectWorkspaceRef {
  roles: DirectoryRole[];
  /** The stored `canonical_path`: an absolute path, or `project-output:<project_id>` for a default output directory. */
  stored_path: string;
  updated_at: string;
}

/**
 * Where a path falls, by the rules of specs/shared-sources-and-surfaces §3 「路径到行」: a folder outside `outputs/` is found by its
 * `canonical_path`; `outputs/<project_id>` is that project's default output directory, whose row stores no path; anywhere else in
 * `outputs/` has no row.
 */
export type WorkspacePathPlace =
  | { kind: "folder"; canonical_path: string; row: ProjectWorkspaceRef | null }
  | { kind: "project-output"; project_id: string; row: ProjectWorkspaceRef | null }
  | { kind: "inside-outputs" };

/**
 * The path by `realpathSync.native`, through the nearest part of it that exists: a default output directory that is not made yet is still
 * found under `outputs` when the path names `outputs` in another case or through a link. What does not exist is kept as given.
 */
function resolveThroughExistingParent(absolute: string): string {
  const rest: string[] = [];
  for (let at = absolute; ; at = path.dirname(at)) {
    try { return path.join(realpathSync.native(at), ...rest.reverse()); } catch { /* not there: try its parent */ }
    if (path.dirname(at) === at) return absolute;
    rest.push(path.basename(at));
  }
}

/**
 * `bound_by` of a relation a tool binding brought in. Which relations are the person's is an allow-list, `bound_by` equal to the person's id:
 * this mark tells a terminal the person opened from a relation the person made, and a value nobody marked still counts as not theirs.
 */
export const toolBoundBy = (actorId: string): string => `binding:${actorId}`;

const role = (row: Row): DirectoryRole[] => [...(booleanInt(row.role_input) ? ["input" as const] : []), ...(booleanInt(row.role_output) ? ["output" as const] : [])];

/**
 * The rows that tie a directory to its projects: `workspaces`, `workspace_project_memberships` and `workspace_source_links`. This is the one
 * place that reads `canonical_path`: a default output directory's row stores `project-output:<project_id>` and leaves here as the absolute
 * path under this Home's `outputs` (`outputsDirectory`, the Host's realpath of the Home joined with `outputs`), so a Home copied elsewhere
 * reads its own folder and no row ever names another Home.
 */
export class WorkspaceRepository {
  constructor(private readonly db: ProjectsSqliteDatabase, private readonly outputsDirectory: string) {}

  /** A stored row as callers see it: the default output directory's path is derived here, and counts as verified (its folder may not exist yet). */
  private ref(row: Row): ProjectWorkspaceRef {
    const stored = text(row.canonical_path);
    const output = this.outputPath(stored);
    return {
      workspace_id: text(row.workspace_id),
      canonical_path: output ?? stored,
      realpath_verified: output !== null || booleanInt(row.realpath_verified),
      display_name: output !== null ? "默认输出目录" : text(row.display_name),
    };
  }

  /** The absolute path a `project-output:<id>` row stands for, or null for a folder the person chose. Only that project's own membership may name it. */
  private outputPath(stored: string): string | null {
    if (!stored.startsWith(PROJECT_OUTPUT_PATH_PREFIX)) return null;
    return projectOutputDirectoryPath(this.outputsDirectory, stored.slice(PROJECT_OUTPUT_PATH_PREFIX.length));
  }

  listWorkspaceMemberships(): ProjectWorkspaceMembership[] {
    return (this.db.prepare(`
      SELECT membership.membership_id, membership.workspace_id, workspace.canonical_path,
        workspace.display_name, workspace.realpath_verified,
        membership.project_id, membership.role_input, membership.role_output, membership.bound_by,
        membership.created_at, membership.updated_at
      FROM workspace_project_memberships AS membership
      INNER JOIN workspaces AS workspace ON workspace.workspace_id = membership.workspace_id
      WHERE membership.project_id NOT IN (SELECT project_id FROM project_recycle WHERE recycled=1)
      ORDER BY workspace.display_name COLLATE NOCASE, membership.role_output DESC,
        membership.updated_at DESC, membership.project_id
    `).all() as Row[]).map((row) => {
      this.assertOutputMember(row);
      const ref = this.ref(row);
      return {
        membership_id: text(row.membership_id),
        workspace_id: ref.workspace_id,
        workspace_name: ref.display_name,
        realpath_verified: ref.realpath_verified,
        project_id: text(row.project_id),
        roles: role(row),
        bound_by: text(row.bound_by),
        created_at: text(row.created_at),
        updated_at: text(row.updated_at),
      };
    });
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
    return rows.map((row) => {
      const own = memberships.filter((membership) => membership.workspace_id === text(row.workspace_id));
      return {
        ...this.ref(row),
        project_ids: own.map((membership) => membership.project_id),
        person_project_ids: own.filter((membership) => membership.bound_by === LOCAL_PERSON_ACTOR_ID).map((membership) => membership.project_id),
        created_at: text(row.created_at),
        updated_at: text(row.updated_at),
      };
    });
  }

  /** This project's folders with their roles; a project in the recycle bin has none, as it has no other membership. */
  projectDirectoryRows(projectId: string): ProjectDirectoryRow[] {
    return (this.db.prepare(`
      SELECT workspace.workspace_id, workspace.canonical_path, workspace.realpath_verified, workspace.display_name,
        membership.project_id, membership.role_input, membership.role_output, membership.updated_at
      FROM workspace_project_memberships AS membership
      INNER JOIN workspaces AS workspace ON workspace.workspace_id = membership.workspace_id
      WHERE membership.project_id = ? AND membership.project_id NOT IN (SELECT project_id FROM project_recycle WHERE recycled=1)
      ORDER BY membership.role_output DESC, workspace.display_name COLLATE NOCASE, workspace.workspace_id
    `).all(projectId) as Row[]).map((row) => {
      this.assertOutputMember(row);
      return { ...this.ref(row), roles: role(row), stored_path: text(row.canonical_path), updated_at: text(row.updated_at) };
    });
  }

  /** A `project-output:<id>` row belongs to that one project: a membership of any other project means the catalog was edited by hand. */
  private assertOutputMember(row: Row): void {
    const stored = text(row.canonical_path);
    if (stored.startsWith(PROJECT_OUTPUT_PATH_PREFIX) && stored.slice(PROJECT_OUTPUT_PATH_PREFIX.length) !== text(row.project_id)) {
      throw catalogErrors.project_storage_invalid("目录库里一个项目的默认输出目录关联到了别的项目，不会按它读写文件");
    }
  }

  workspaceProjectSelections(workspaceId: string): ProjectSelection[] {
    return (this.db.prepare(`
      SELECT project.project_id, project.display_name
      FROM workspace_project_memberships AS membership
      INNER JOIN projects AS project ON project.project_id = membership.project_id
      WHERE membership.workspace_id = ? AND project.project_id NOT IN (SELECT project_id FROM project_recycle WHERE recycled=1)
      ORDER BY membership.updated_at DESC, project.display_name COLLATE NOCASE
    `).all(workspaceId) as Row[]).map((row) => ({
      project_id: text(row.project_id),
      display_name: text(row.display_name),
    }));
  }

  /** The `canonical_path` as stored, or null when there is no such folder. */
  storedPath(workspaceId: string): string | null {
    const row = this.db.prepare("SELECT canonical_path FROM workspaces WHERE workspace_id = ?").get(workspaceId) as Row | undefined;
    return row ? text(row.canonical_path) : null;
  }

  workspace(workspaceId: string): ProjectWorkspaceRef | null {
    const row = this.db.prepare("SELECT workspace_id, canonical_path, realpath_verified, display_name FROM workspaces WHERE workspace_id = ?").get(workspaceId) as Row | undefined;
    return row ? this.ref(row) : null;
  }

  /**
   * Where a path falls (§3 「路径到行」). The path is resolved by `realpathSync.native`, which also folds case, and compared with this Home's
   * `outputs`; a path that cannot be resolved is looked up as given, and only `add`, `repair` and the other explicit links insist it resolves.
   */
  placeOf(candidate: string): WorkspacePathPlace {
    const resolved = resolveThroughExistingParent(path.resolve(candidate));
    const relative = path.relative(this.outputsDirectory, resolved);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
      const parts = relative.split(path.sep);
      if (parts.length !== 1 || parts[0] === "") return { kind: "inside-outputs" };
      const projectId = parts[0]!;
      const row = this.db.prepare("SELECT workspace_id, canonical_path, realpath_verified, display_name FROM workspaces WHERE canonical_path = ?").get(`${PROJECT_OUTPUT_PATH_PREFIX}${projectId}`) as Row | undefined;
      return { kind: "project-output", project_id: projectId, row: row ? this.ref(row) : null };
    }
    const row = this.db.prepare("SELECT workspace_id, canonical_path, realpath_verified, display_name FROM workspaces WHERE canonical_path = ?").get(resolved) as Row | undefined;
    return { kind: "folder", canonical_path: resolved, row: row ? this.ref(row) : null };
  }

  /**
   * Inserts a folder's row. A path inside this Home's `outputs` is never written here (a default output directory's row stores no path, and
   * nowhere else in `outputs` has one), so a path read back from a row and passed in again leaves the row as it was.
   */
  upsertWorkspace(workspace: ProjectWorkspaceRef, now: string): void {
    const stored = workspace.canonical_path;
    if (!stored.startsWith(PROJECT_OUTPUT_PATH_PREFIX) && this.placeOf(stored).kind !== "folder") return;
    this.db.prepare(`
      INSERT INTO workspaces (
        workspace_id, canonical_path, realpath_verified, display_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        realpath_verified = excluded.realpath_verified,
        display_name = excluded.display_name,
        updated_at = excluded.updated_at
    `).run(
      workspace.workspace_id,
      stored,
      stored.startsWith(PROJECT_OUTPUT_PATH_PREFIX) ? 0 : workspace.realpath_verified ? 1 : 0,
      stored.startsWith(PROJECT_OUTPUT_PATH_PREFIX) ? "project-output" : workspace.display_name,
      now,
      now,
    );
  }

  /** A folder found again somewhere else: the row keeps its id, so every project linked to it and every reference to it follow. */
  repairWorkspacePath(workspaceId: string, canonicalPath: string, displayName: string, now: string): void {
    this.db.prepare("UPDATE workspaces SET canonical_path = ?, realpath_verified = 1, display_name = ?, updated_at = ? WHERE workspace_id = ?")
      .run(canonicalPath, displayName, now, workspaceId);
  }

  /**
   * Links a folder to a project; an existing link keeps its roles. A new link is an input unless `roles` says otherwise. A relation the person
   * made stays theirs whoever writes it again.
   */
  upsertWorkspaceMembership(input: {
    membership_id: string;
    workspace_id: string;
    project_id: string;
    bound_by: string;
    now: string;
    roles?: readonly DirectoryRole[];
  }): void {
    const roles = input.roles ?? ["input"];
    this.db.prepare(`
      INSERT INTO workspace_project_memberships (
        membership_id, workspace_id, project_id, role_input, role_output, bound_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, project_id) DO UPDATE SET
        bound_by = CASE WHEN bound_by = ? THEN bound_by ELSE excluded.bound_by END,
        updated_at = excluded.updated_at
    `).run(
      input.membership_id,
      input.workspace_id,
      input.project_id,
      roles.includes("input") ? 1 : 0,
      roles.includes("output") ? 1 : 0,
      input.bound_by,
      input.now,
      input.now,
      LOCAL_PERSON_ACTOR_ID,
    );
  }

  /** The person linking a folder that is already linked makes the relation theirs; any other writer leaves the recorded value as it is. */
  claimMembership(workspaceId: string, projectId: string, boundBy: string): void {
    this.db.prepare("UPDATE workspace_project_memberships SET bound_by = ? WHERE workspace_id = ? AND project_id = ? AND ? = ? AND bound_by <> ?")
      .run(boundBy, workspaceId, projectId, boundBy, LOCAL_PERSON_ACTOR_ID, LOCAL_PERSON_ACTOR_ID);
  }

  /** Whether the person made this relation: the one place that reads `bound_by` as a decision. */
  isPersonMembership(workspaceId: string, projectId: string): boolean {
    return this.db.prepare("SELECT 1 FROM workspace_project_memberships WHERE workspace_id = ? AND project_id = ? AND bound_by = ?")
      .get(workspaceId, projectId, LOCAL_PERSON_ACTOR_ID) !== undefined;
  }

  setMembershipRoles(workspaceId: string, projectId: string, roles: readonly DirectoryRole[], now: string): void {
    this.db.prepare("UPDATE workspace_project_memberships SET role_input = ?, role_output = ?, updated_at = ? WHERE workspace_id = ? AND project_id = ?")
      .run(roles.includes("input") ? 1 : 0, roles.includes("output") ? 1 : 0, now, workspaceId, projectId);
  }

  /** Unlinks a folder from a project, with the source links that named it in that project. */
  removeWorkspaceMembership(workspaceId: string, projectId: string): number {
    this.db.prepare("DELETE FROM workspace_source_links WHERE project_id = ? AND workspace_id = ?").run(projectId, workspaceId);
    return Number(this.db.prepare(
      "DELETE FROM workspace_project_memberships WHERE workspace_id = ? AND project_id = ?",
    ).run(workspaceId, projectId).changes);
  }

  /**
   * Removes every membership of the project, and with them the directory records it leaves with no member (the same rule as
   * unlinking one directory). A directory another project still belongs to stays, and so does any record that had no member
   * before this call: only the directories this project was in are looked at. Returns the memberships removed.
   */
  removeWorkspaceMembershipsForProject(projectId: string): number {
    return this.db.transaction(() => {
      const workspaceIds = (this.db.prepare(
        "SELECT workspace_id FROM workspace_project_memberships WHERE project_id = ?",
      ).all(projectId) as Array<{ workspace_id: string }>).map(row => row.workspace_id);
      this.db.prepare("DELETE FROM workspace_source_links WHERE project_id = ?").run(projectId);
      const removed = Number(this.db.prepare(
        "DELETE FROM workspace_project_memberships WHERE project_id = ?",
      ).run(projectId).changes);
      for (const workspaceId of workspaceIds) this.removeWorkspaceIfEmpty(workspaceId);
      return removed;
    })();
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

  /** The projects a folder is linked to, the recycle bin included: a repair moves the folder for every one of them. */
  projectsOf(workspaceId: string): string[] {
    return (this.db.prepare("SELECT project_id FROM workspace_project_memberships WHERE workspace_id = ? ORDER BY project_id").all(workspaceId) as Row[]).map(row => text(row.project_id));
  }

  hasSourceLinks(workspaceId: string): boolean {
    return this.db.prepare("SELECT 1 FROM workspace_source_links WHERE workspace_id = ? LIMIT 1").get(workspaceId) !== undefined;
  }

  sourceLinks(projectId: string): { source_workspace_id: string; workspace_id: string }[] {
    return (this.db.prepare("SELECT source_workspace_id, workspace_id FROM workspace_source_links WHERE project_id = ? ORDER BY source_workspace_id")
      .all(projectId) as Row[]).map(row => ({ source_workspace_id: text(row.source_workspace_id), workspace_id: text(row.workspace_id) }));
  }

  /** Names this project's folder for another device's directory id; an existing link for that id is replaced. */
  upsertSourceLink(input: { project_id: string; source_workspace_id: string; workspace_id: string; actor_id: string; now: string }): void {
    this.db.prepare(`
      INSERT INTO workspace_source_links (project_id, source_workspace_id, workspace_id, bound_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, source_workspace_id) DO UPDATE SET
        workspace_id = excluded.workspace_id, bound_by = excluded.bound_by, updated_at = excluded.updated_at
    `).run(input.project_id, input.source_workspace_id, input.workspace_id, input.actor_id, input.now, input.now);
  }

  removeSourceLink(projectId: string, sourceWorkspaceId: string): number {
    return Number(this.db.prepare("DELETE FROM workspace_source_links WHERE project_id = ? AND source_workspace_id = ?").run(projectId, sourceWorkspaceId).changes);
  }
}

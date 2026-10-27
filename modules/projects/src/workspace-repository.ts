import type {
  ProjectSelection,
  ProjectWorkspaceDirectoryRecord,
  ProjectWorkspaceMembership,
  ProjectWorkspaceRef,
} from "@molis-ai/molis-work-contracts/modules/projects";

import { booleanInt, text, type ProjectsSqliteDatabase, type Row } from "./sqlite.js";

/** The rows that tie a directory to its projects: `workspaces` and `workspace_project_memberships`. */
export class WorkspaceRepository {
  constructor(private readonly db: ProjectsSqliteDatabase) {}

  listWorkspaceMemberships(): ProjectWorkspaceMembership[] {
    return (this.db.prepare(`
      SELECT membership.membership_id, membership.workspace_id,
        workspace.display_name AS workspace_name, workspace.realpath_verified,
        membership.project_id, membership.is_default, membership.bound_by,
        membership.created_at, membership.updated_at
      FROM workspace_project_memberships AS membership
      INNER JOIN workspaces AS workspace ON workspace.workspace_id = membership.workspace_id
      WHERE NOT EXISTS (SELECT 1 FROM project_deletions d WHERE d.project_id=membership.project_id AND d.cleanup_state='pending')
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
      ${projectId ? "WHERE selected_membership.project_id = ? AND NOT EXISTS (SELECT 1 FROM project_deletions d WHERE d.project_id=selected_membership.project_id AND d.cleanup_state='pending')" : ""}
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
      WHERE membership.project_id = ? AND NOT EXISTS (SELECT 1 FROM project_deletions d WHERE d.project_id=membership.project_id AND d.cleanup_state='pending')
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
      WHERE membership.workspace_id = ? AND NOT EXISTS (SELECT 1 FROM project_deletions d WHERE d.project_id=membership.project_id AND d.cleanup_state='pending')
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

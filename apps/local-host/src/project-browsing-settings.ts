import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { projectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginPrivateStorageDatabase } from "@molis-ai/molis-work-plugin-runtime";

/** The browsing preference table, as one current schema; the host composes it into the project database baseline. */
export const PROJECT_BROWSING_SETTINGS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS project_browsing_settings (
    project_id TEXT PRIMARY KEY, workspace_id TEXT
  );
`;

/** Host-owned preference only. Directory membership remains exclusively in the catalog. */
export class ProjectBrowsingSettings {
  constructor(private readonly db: PluginPrivateStorageDatabase) {
    db.exec(PROJECT_BROWSING_SETTINGS_SCHEMA_SQL);
  }

  read(projectId: string, workspaces: readonly ProjectWorkspaceRef[]): ProjectWorkspaceRef | null {
    const row = this.db.prepare("SELECT workspace_id FROM project_browsing_settings WHERE project_id = ?").get(projectId) as { workspace_id: string | null } | undefined;
    const workspaceId = row?.workspace_id ?? null;
    const selected = workspaces.find(item => item.workspace_id === workspaceId)
      ?? (workspaceId === null && workspaces.length === 1 ? workspaces[0] : null);
    return selected?.realpath_verified ? projectWorkspaceRef(selected) : null;
  }

  select(projectId: string, workspaceId: unknown, workspaces: readonly ProjectWorkspaceRef[]): ProjectWorkspaceRef {
    const selected = workspaces.find(item => item.workspace_id === workspaceId && item.realpath_verified);
    if (!selected) throw new Error("请选择当前项目已关联且可用的工作目录");
    this.db.prepare(`INSERT INTO project_browsing_settings (project_id, workspace_id) VALUES (?, ?)
      ON CONFLICT (project_id) DO UPDATE SET workspace_id = excluded.workspace_id`).run(projectId, selected.workspace_id);
    return projectWorkspaceRef(selected);
  }
}

import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { projectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginPrivateStorageDatabase } from "@molis-ai/molis-work-plugin-runtime";

/** Host-owned preference only. Directory membership remains exclusively in the catalog. */
export class ProjectBrowsingSettings {
  constructor(private readonly db: PluginPrivateStorageDatabase) {
    db.exec(`CREATE TABLE IF NOT EXISTS project_browsing_settings (
      board_id TEXT PRIMARY KEY, workspace_id TEXT
    )`);
  }

  read(boardId: string, workspaces: readonly ProjectWorkspaceRef[]): ProjectWorkspaceRef | null {
    let row = this.db.prepare("SELECT workspace_id FROM project_browsing_settings WHERE board_id = ?").get(boardId) as { workspace_id: string | null } | undefined;
    if (!row) {
      // Migrate the old host-owned Plugin storage once. Do not start the retired plugin.
      let legacy: string | null = null;
      const exists = (name: string) => this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
      if (exists("plugin_private_values") && exists("plugin_runtime_installs")) {
        const saved = this.db.prepare(`SELECT value.item_value FROM plugin_private_values AS value
          JOIN plugin_runtime_installs AS install ON install.install_id = value.install_id
          WHERE json_extract(install.record_json, '$.plugin_id') = 'io.molis.work.workspace'
            AND value.item_key = 'selected-workspace'
          ORDER BY json_extract(install.record_json, '$.updated_at') DESC LIMIT 1`).get() as { item_value: string } | undefined;
        legacy = saved?.item_value ?? null;
      }
      this.db.prepare("INSERT OR IGNORE INTO project_browsing_settings (board_id, workspace_id) VALUES (?, ?)").run(boardId, legacy);
      row = this.db.prepare("SELECT workspace_id FROM project_browsing_settings WHERE board_id = ?").get(boardId) as { workspace_id: string | null };
    }
    const selected = workspaces.find(item => item.workspace_id === row.workspace_id)
      ?? (row.workspace_id === null && workspaces.length === 1 ? workspaces[0] : null);
    return selected?.realpath_verified ? projectWorkspaceRef(selected) : null;
  }

  select(boardId: string, workspaceId: unknown, workspaces: readonly ProjectWorkspaceRef[]): ProjectWorkspaceRef {
    const selected = workspaces.find(item => item.workspace_id === workspaceId && item.realpath_verified);
    if (!selected) throw new Error("请选择当前项目已关联且可用的工作目录");
    this.db.prepare(`INSERT INTO project_browsing_settings (board_id, workspace_id) VALUES (?, ?)
      ON CONFLICT (board_id) DO UPDATE SET workspace_id = excluded.workspace_id`).run(boardId, selected.workspace_id);
    return projectWorkspaceRef(selected);
  }
}

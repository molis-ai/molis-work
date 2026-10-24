import type { PluginPrivateStorageDatabase } from "@molis-ai/molis-work-plugin-runtime";

/** The project's Agent Runtime pick as one current schema, created by the first pick; the project database baseline does not carry it. */
export const PROJECT_RUNTIME_SETTINGS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS project_runtime_settings (
    project_id TEXT PRIMARY KEY, runtime_id TEXT
  );
`;

/**
 * Which Runtime a project's Agent sessions run on, as the person picked it (BL-372, PG-054). Host-owned and read or written only
 * here: Coding and Characters get the pick through `projects.settings.runtime.read`, never from this table. No row, or a row
 * without a Runtime, is the Home default; whether the picked Runtime still exists is for the caller to resolve
 * (`resolveProjectRuntime`), so a pick that has gone away stays recorded and the person can see it and reset it. A project that
 * never picked has no table: reads leave its database as it was.
 */
export class ProjectRuntimeSettings {
  constructor(private readonly db: PluginPrivateStorageDatabase) {}

  read(projectId: string): string | null {
    if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'project_runtime_settings'").get()) return null;
    const row = this.db.prepare("SELECT runtime_id FROM project_runtime_settings WHERE project_id = ?").get(projectId) as { runtime_id: string | null } | undefined;
    return row?.runtime_id ?? null;
  }

  select(projectId: string, runtimeId: string | null): string | null {
    this.db.exec(PROJECT_RUNTIME_SETTINGS_SCHEMA_SQL);
    this.db.prepare(`INSERT INTO project_runtime_settings (project_id, runtime_id) VALUES (?, ?)
      ON CONFLICT (project_id) DO UPDATE SET runtime_id = excluded.runtime_id`).run(projectId, runtimeId);
    return runtimeId;
  }
}

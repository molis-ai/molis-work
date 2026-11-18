import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import type { SettingsWriteReceipt } from "@molis-ai/molis-work-plugin-sdk";

const RUNTIME_SELECTION_COLUMNS = "project_id TEXT PRIMARY KEY, runtime_id TEXT";
const REVISION_COLUMN = "revision INTEGER NOT NULL DEFAULT 0";
export const RUNTIME_RECEIPTS_SCHEMA_SQL = `
  CREATE TABLE project_runtime_setting_receipts (
    project_id TEXT NOT NULL, actor_id TEXT NOT NULL, request_id TEXT NOT NULL,
    request_json TEXT NOT NULL, result_json TEXT NOT NULL,
    PRIMARY KEY (project_id, actor_id, request_id)
  );
`;

/** A project with no explicit pick inherits the Home runtime. Reading never creates a selection row. */
export const PROJECT_RUNTIME_SETTINGS_SCHEMA_SQL = `
  CREATE TABLE project_runtime_settings (${RUNTIME_SELECTION_COLUMNS}, ${REVISION_COLUMN});
  ${RUNTIME_RECEIPTS_SCHEMA_SQL}
`;

export class ProjectRuntimeSettings {
  constructor(private readonly db: SqliteDatabase) {}

  selection(projectId: string) {
    return this.db.prepare<[string], { runtime_id: string | null; revision: number }>(
      "SELECT runtime_id, revision FROM project_runtime_settings WHERE project_id = ?").get(projectId);
  }

  read(projectId: string): string | null {
    return this.selection(projectId)?.runtime_id ?? null;
  }

  receipt(projectId: string, actor: string, requestId: string): SettingsWriteReceipt | undefined {
    const found = this.db.prepare<[string, string, string], { request_json: string; result_json: string }>(
      "SELECT request_json, result_json FROM project_runtime_setting_receipts WHERE project_id = ? AND actor_id = ? AND request_id = ?"
    ).get(projectId, actor, requestId);
    return found && { request: JSON.parse(found.request_json), result: JSON.parse(found.result_json) };
  }

  saveReceipt(projectId: string, actor: string, requestId: string, receipt: SettingsWriteReceipt): void {
    this.db.prepare("INSERT INTO project_runtime_setting_receipts (project_id, actor_id, request_id, request_json, result_json) VALUES (?, ?, ?, ?, ?)")
      .run(projectId, actor, requestId, JSON.stringify(receipt.request), JSON.stringify(receipt.result));
  }

  select(projectId: string, runtimeId: string | null): string | null {
    this.db.prepare(`INSERT INTO project_runtime_settings (project_id, runtime_id, revision) VALUES (?, ?, 1)
      ON CONFLICT (project_id) DO UPDATE SET runtime_id = excluded.runtime_id, revision = revision + 1`).run(projectId, runtimeId);
    return runtimeId;
  }
}

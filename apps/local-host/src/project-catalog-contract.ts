export const CATALOG_SCHEMA_VERSION = 18;
export const CATALOG_OWNER = "molis-work-project-catalog-v1";

export function isOwnedCatalogOwner(owner: string | null | undefined): boolean {
  return owner === CATALOG_OWNER;
}

export interface MolisWorkProjectCatalogErrorDetails {
  actual_schema_version?: number;
  supported_schema_min?: number;
  supported_schema_max?: number;
  recovery?: "new_or_fork_session_then_context_resolve";
}

export class MolisWorkProjectCatalogError extends Error {
  constructor(
    readonly code:
      | "catalog.unknown_database"
      | "catalog.unsupported_schema"
      | "catalog.reader_too_old"
      | "catalog.invalid_name"
      | "catalog.project_not_found"
      | "catalog.legacy_invalid"
      | "catalog.project_storage_invalid"
      | "catalog.project_active_work"
      | "catalog.delete_confirmation_required"
      | "catalog.deletion_idempotency_conflict"
      | "catalog.demo_confirmation_required"
      | "catalog.demo_not_found"
      | "catalog.not_demo"
      | "context.stable_identity_required"
      | "context.identity_required"
      | "context.workspace_required"
      | "context.workspace_membership_not_found"
      | "context.workspace_default_unsupported"
      | "context.user_confirmation_required"
      | "context.rebind_confirmation_required"
      | "context.suggestion_not_available"
      | "context.idempotency_key_required"
      | "context.idempotency_conflict"
      | "catalog.panel_not_found"
      | "catalog.panel_confirmation_required",
    message: string,
    readonly details: MolisWorkProjectCatalogErrorDetails = {},
  ) {
    super(message);
    this.name = "MolisWorkProjectCatalogError";
  }
}

export function catalogSchemaCompatibilityError(
  actualSchemaVersion: number,
  supportedSchemaMax: number = CATALOG_SCHEMA_VERSION,
): MolisWorkProjectCatalogError | null {
  if (Number.isInteger(actualSchemaVersion) && actualSchemaVersion > supportedSchemaMax) {
    return new MolisWorkProjectCatalogError(
      "catalog.reader_too_old",
      `Molis Work catalog schema=${actualSchemaVersion}，当前 reader 支持 1..${supportedSchemaMax}。`
        + "当前 Session 不会热刷新 MCP；请新建或 Fork 一个 Session，先确认当前任务焦点，再只读调用 context_resolve。"
        + "解析成功后再继续写入；不要回滚 catalog.db，也不要用 SQLite、CLI 或 Web 绕过。",
      {
        actual_schema_version: actualSchemaVersion,
        supported_schema_min: 1,
        supported_schema_max: supportedSchemaMax,
        recovery: "new_or_fork_session_then_context_resolve",
      },
    );
  }
  if (!Number.isInteger(actualSchemaVersion) || actualSchemaVersion < 1) {
    return new MolisWorkProjectCatalogError(
      "catalog.unsupported_schema",
      `Molis Work 项目目录数据库的 schema 元数据无效；当前 reader 支持 1..${supportedSchemaMax}`,
      { supported_schema_min: 1, supported_schema_max: supportedSchemaMax },
    );
  }
  return null;
}

import type { ProjectRecord as MolisWorkProjectRecord } from "@molis-ai/molis-work-contracts/modules/projects";
export interface CreateMolisWorkProjectInput {
  display_name: string;
  actor_id: string;
}

export interface ManageMolisWorkDemoProjectInput {
  actor_id: string;
  user_confirmed: boolean;
  display_name?: string;
}

export interface MolisWorkDemoProjectResult {
  status: "created" | "existing" | "reset";
  project: MolisWorkProjectRecord;
}

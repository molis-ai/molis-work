import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { projectCatalogErrors } from "@molis-ai/molis-work-contracts/modules/projects";

export const CATALOG_SCHEMA_VERSION = 1;
export const CATALOG_OWNER = "molis-work-project-catalog-v1";

export function isOwnedCatalogOwner(owner: string | null | undefined): boolean {
  return owner === CATALOG_OWNER;
}

/**
 * The project catalog's own error codes, every one `catalog.<reason>`. The kind is the sort of failure, and every edge turns it into the
 * status (SDK `actionHttpStatus`), so the catalog keeps no status table of its own: what is not there is `not_found`, a terminal that is
 * still running is a `conflict` the person can resolve, and everything else is the caller's mistake (`invalid`), as the class this
 * replaced answered at every edge.
 */
const hostCatalogErrors = defineErrorCodes("catalog", {
  project_recovery_unsupported_schema: "invalid",
  unknown_database: "invalid",
  unsupported_schema: "invalid",
  reader_too_old: "invalid",
  database_invalid: "invalid",
  delete_confirmation_required: "invalid",
  project_terminal_live: "conflict",
  deletion_idempotency_conflict: "invalid",
  demo_confirmation_required: "invalid",
  demo_not_found: "invalid",
  not_demo: "invalid",
  personal_space: "invalid",
  panel_not_found: "not_found",
  panel_confirmation_required: "invalid",
});
export const catalogErrors = {
  ...hostCatalogErrors,
  invalid_name: projectCatalogErrors.invalid_name,
  project_not_found: projectCatalogErrors.project_not_found,
  plugin_not_found: projectCatalogErrors.plugin_not_found,
  project_storage_invalid: projectCatalogErrors.project_storage_invalid,
};

/**
 * The failure the catalog's remaining desktop-panel factory raises: declared catalog codes retain their kinds. Unclassified panel validation codes pass through
 * unchanged as caller input errors. The injected factory does not assign the fact owner.
 */
export function catalogFailure(code: string, message: string): ActionError {
  const reason = code.startsWith("catalog.") ? code.slice("catalog.".length) : "";
  return Object.hasOwn(catalogErrors, reason) ? catalogErrors[reason as keyof typeof catalogErrors](message) : new ActionError(code, message);
}

export function catalogSchemaCompatibilityError(
  actualSchemaVersion: number,
  supportedSchemaMax: number = CATALOG_SCHEMA_VERSION,
): ActionError | null {
  if (Number.isInteger(actualSchemaVersion) && actualSchemaVersion > supportedSchemaMax) {
    return catalogErrors.reader_too_old(
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
    return catalogErrors.unsupported_schema(
      `Molis Work 项目目录数据库的 schema 元数据无效；当前 reader 支持 1..${supportedSchemaMax}`,
      { supported_schema_min: 1, supported_schema_max: supportedSchemaMax },
    );
  }
  return null;
}

import type { ProjectRecord as MolisWorkProjectRecord } from "@molis-ai/molis-work-contracts/modules/projects";
export interface CreateMolisWorkProjectInput {
  /** Stable Host-owned identity for recoverable creation. */
  project_id?: string;
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
  /**
   * A rebuild only: the owners of project data whose service is another process's for good, so this process left the old
   * demo's data with them (a CLI has no Agent runtime or search index; the running Molis Work clears them when it rebuilds).
   */
  owners_left?: string[];
}

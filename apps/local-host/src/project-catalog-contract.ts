import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { projectCatalogErrors } from "@molis-ai/molis-work-contracts/modules/projects";
import { storageErrors, type SqliteUpgradeStep } from "@molis-ai/molis-work-storage";
import { upgradeProjectsCatalog1, verifyProjectOutputs } from "@molis-ai/molis-work-module-projects";
import { isHostWriterWorktree } from "./workspace-git-worktrees.js";

export const CATALOG_SCHEMA_VERSION = /* @version database.home.catalog */ 2;
/**
 * Each step takes the catalog from `from` to `from + 1`. They sit beside the version, which is what they answer to.
 *
 * 1 → 2 (specs/shared-sources-and-surfaces §3, §8): the links earlier Hosts made for writers' worktrees go (which those are is the Host's
 * rule, `isHostWriterWorktree`), a project's folders get input and output roles, every project its default output directory, and
 * `workspace_source_links` starts empty. The Projects tables' part is `modules/projects`' own; it rebuilds the memberships table and
 * touches no file of the Home.
 */
export const CATALOG_UPGRADES: readonly SqliteUpgradeStep[] = [
  { from: 1, run: upgradeProjectsCatalog1(isHostWriterWorktree), verify: verifyProjectOutputs, rebuilds_tables: true,
    reduces_rows: ["workspace_project_memberships", "workspaces"] },
];
export const CATALOG_OWNER = /* @version type.molis-work-project-catalog "molis-work-project-catalog-v{version}" */ "molis-work-project-catalog-v1";

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
  database_invalid: "invalid",
  delete_confirmation_required: "invalid",
  project_terminal_live: "conflict",
  project_task_live: "conflict",
  deletion_idempotency_conflict: "invalid",
  demo_confirmation_required: "invalid",
  demo_not_found: "invalid",
  not_demo: "invalid",
  personal_space: "invalid",
  personal_deletion_unavailable: "unavailable",
});
export const catalogErrors = {
  ...hostCatalogErrors,
  invalid_name: projectCatalogErrors.invalid_name,
  project_not_found: projectCatalogErrors.project_not_found,
  plugin_not_found: projectCatalogErrors.plugin_not_found,
  project_storage_invalid: projectCatalogErrors.project_storage_invalid,
};

/** A catalog newer than this build, in the words the MCP reader shows: upgrade Molis Work (one already upgraded restarts the service and opens a new Session), and nothing may roll the catalog back. */
export function catalogSchemaCompatibilityError(
  actualSchemaVersion: number,
  currentSchemaVersion: number = CATALOG_SCHEMA_VERSION,
): ActionError | null {
  if (Number.isInteger(actualSchemaVersion) && actualSchemaVersion > currentSchemaVersion) {
    return storageErrors.store_too_new(
      `Molis Work catalog schema=${actualSchemaVersion}，这个版本的 Molis Work 只认 ${currentSchemaVersion}。`
        + "目录库是更新的版本写的，没有损坏。请把 Molis Work 升级到能读它的版本；已经升级过的，运行中的 MCP 不会热刷新，请重启常驻服务并新开一个 Session。"
        + "之后先确认当前任务焦点，只读调用 context_resolve，解析成功后再继续写入；不要回滚 catalog.db，也不要用 SQLite、CLI 或 Web 绕过。",
      {
        actual_schema_version: actualSchemaVersion,
        supported_schema_min: currentSchemaVersion,
        supported_schema_max: currentSchemaVersion,
        recovery: "upgrade_then_context_resolve",
      },
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

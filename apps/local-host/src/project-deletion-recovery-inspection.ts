import path from "node:path";
import { existsSync } from "node:fs";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { readProjectDeletionRecoveryPage, type ProjectDeletionSourceRecord } from "@molis-ai/molis-work-module-projects";
import { closeCatalogInitialization } from "./project-deletion-catalog-close.js";
import { assertCurrentCatalog, assertOwnedCatalog } from "./catalog-schema.js";
import { catalogErrors } from "./project-catalog-contract.js";
import { decodeProjectDeletionRecovery, type ProjectDeletionRecovery } from "./project-deletion-recovery.js";

export type ProjectDeletionRecoverySource = Omit<ProjectDeletionSourceRecord, "recovery_plan"> & { recovery: ProjectDeletionRecovery };
export interface ProjectDeletionRecoveryInspection {
  next(input?: { limit?: number }): Promise<{ items: ProjectDeletionRecoverySource[]; exhausted: boolean }>;
  close(): Promise<void>;
}

function readCatalog<T>(read: () => T): T {
  try { return read(); }
  catch (error) {
    if (error instanceof ActionError) throw error;
    const failure = catalogErrors.project_storage_invalid("项目删除来源 Catalog 无法读取");
    Object.defineProperty(failure, "cause", { value: error });
    throw failure;
  }
}

/** Only an operator-selected T1 working copy. This reader does not establish writer exclusion or authorize target deletion. */
export async function openProjectDeletionRecoveryInspection(input: {
  homeDirectory: string; assertCurrent(): void; signal?: AbortSignal;
}): Promise<ProjectDeletionRecoveryInspection> {
  const selectedHome = input.homeDirectory;
  if (typeof selectedHome !== "string" || !selectedHome.trim() || !path.isAbsolute(selectedHome))
    throw catalogErrors.project_storage_invalid("项目删除来源必须是明确的绝对 Home 路径");
  const home = path.resolve(selectedHome), filename = path.join(home, "projects", "catalog.db");
  const assertCurrent = input.assertCurrent, signal = input.signal;
  const current = () => {
    signal?.throwIfAborted();
    const checked: unknown = assertCurrent();
    if (checked !== undefined) {
      if (checked !== null && (typeof checked === "object" || typeof checked === "function") && "then" in checked)
        void Promise.resolve(checked).catch(() => undefined);
      throw catalogErrors.project_storage_invalid("项目删除来源权限必须由同步检查确认");
    }
    signal?.throwIfAborted();
  };
  current();
  if (!existsSync(filename)) throw catalogErrors.project_storage_invalid("项目删除来源 Catalog 不存在");
  const storage = readCatalog(() => new LocalSqliteStorage(filename, { readonly: true, fileMustExist: true }));
  let closed = false, after: string | undefined;
  const close = async () => {
    if (closed) return;
    try { readCatalog(() => { if (storage.db.inTransaction) storage.db.exec("ROLLBACK"); }); }
    finally { readCatalog(() => storage.close()); closed = true; }
  };
  try {
    readCatalog(() => {
      storage.db.exec("BEGIN");
      // Metadata reads also establish the snapshot, including uncheckpointed WAL.
      assertOwnedCatalog(storage, "来源 Catalog"); assertCurrentCatalog(storage, "来源 Catalog");
    });
    current();
    return {
      async next(request = {}) {
        if (closed) throw catalogErrors.project_storage_invalid("项目删除来源读取已关闭");
        current();
        if (!request || typeof request !== "object" || Array.isArray(request)
          || Object.keys(request).some(key => key !== "limit")) throw catalogErrors.project_storage_invalid("项目删除来源分页请求不符");
        const limit = request.limit === undefined ? 40 : request.limit;
        const page = readCatalog(() => readProjectDeletionRecoveryPage(storage.db, { after, limit }));
        const items = page.items.map(({ recovery_plan, ...record }) => {
          const recovery = decodeProjectDeletionRecovery(recovery_plan, record.project_id, record.deletion_id);
          return { ...record, recovery };
        });
        current();
        if (items.length) after = items[items.length - 1]!.deletion_id;
        return { items, exhausted: page.exhausted };
      }, close,
    };
  } catch (error) { closed = true; closeCatalogInitialization(storage, { error }); throw error; }
}

import { LocalCatalogMetadata, type LocalSqliteStorage, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { createProjectsSchema } from "@molis-ai/molis-work-module-projects";
import { createRuntimeContextBindingTables, createRuntimeContextSetupRequestTable, createRuntimeContextSuggestionRejectionTable } from "@molis-ai/molis-work-module-private-work-context";
import { createModelProviderTables } from "./model-provider-store.js";
import { CATALOG_OWNER, CATALOG_SCHEMA_VERSION, catalogErrors, catalogSchemaCompatibilityError, isOwnedCatalogOwner } from "./project-catalog-contract.js";

export type CatalogDesktopSchema = (db: SqliteDatabase) => void;

/** A new catalog: every owner's current tables on one local connection, at the catalog's version. */
export function initializeCatalog(storage: LocalSqliteStorage, createDesktopPanelTables: CatalogDesktopSchema): void {
  const db = storage.db;
  const metadata = new LocalCatalogMetadata(db);
  metadata.create();
  createProjectsSchema(db);
  createRuntimeContextBindingTables(db);
  createRuntimeContextSetupRequestTable(db);
  createRuntimeContextSuggestionRejectionTable(db);
  createDesktopPanelTables(db);
  createModelProviderTables(db);
  metadata.initialize(CATALOG_OWNER, CATALOG_SCHEMA_VERSION);
}

export function assertOwnedCatalog(storage: LocalSqliteStorage, databasePath: string): void {
  if (!isOwnedCatalogOwner(new LocalCatalogMetadata(storage.db).owner())) {
    throw catalogErrors.unknown_database(`不会复用未知项目目录数据库: ${databasePath}`);
  }
}

/** The catalog has one current schema: a catalog at another version is refused, never upgraded in place. */
export function assertCurrentCatalog(storage: LocalSqliteStorage, databasePath: string): void {
  const version = new LocalCatalogMetadata(storage.db).version();
  const compatibilityError = catalogSchemaCompatibilityError(version);
  if (compatibilityError) throw compatibilityError;
  if (version !== CATALOG_SCHEMA_VERSION) {
    throw catalogErrors.unsupported_schema(`Molis Work 项目目录数据库的版本是 ${version}，这个版本只认 ${CATALOG_SCHEMA_VERSION}，不就地升级: ${databasePath}`,
    );
  }
  // The version alone cannot say whether the person's planning methods were moved out (the catalog and Goals' library share a release):
  // a catalog that still holds the table would open and quietly show none of them.
  if (storage.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(PERSONAL_PLANNING_TABLE)) {
    throw catalogErrors.unsupported_schema(`项目目录数据库里还有个人规划方法表 ${PERSONAL_PLANNING_TABLE}（现在放在 Goals 的 Home 库）：先退出 Molis Work，按顺序运行两步维护：一、node scripts/maintenance/goals-journal-names.mjs rename --home <Home 目录> --maintenance-window（S9-2：项目库里 Goals 的旧名事件、幂等记录与引用关系改成现行形状；没做完之前第二步不删这张表），二、node scripts/maintenance/goals-personal-planning-move.mjs move --home <Home 目录> --maintenance-window（个人规划方法搬到 Goals 的 Home 库）: ${databasePath}`);
  }
}

/** The table Goals kept the person's planning methods in before they moved to its library in the Home (PG-094 S13). */
const PERSONAL_PLANNING_TABLE = "personal_planning_method_packs";

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
  // The current catalog has no personal planning table; accepting it would hide facts that belong to Goals' Home library.
  if (storage.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(PERSONAL_PLANNING_TABLE)) {
    throw catalogErrors.unsupported_schema(`项目目录数据库包含当前结构不接受的个人规划方法表 ${PERSONAL_PLANNING_TABLE}（现行事实属于 Goals 的 Home 库），不会打开或就地维护: ${databasePath}`);
  }
}

/** The table Goals kept the person's planning methods in before they moved to its library in the Home (PG-094 S13). */
const PERSONAL_PLANNING_TABLE = "personal_planning_method_packs";

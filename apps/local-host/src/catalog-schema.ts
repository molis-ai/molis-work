import { isDeepStrictEqual } from "node:util";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { LocalCatalogMetadata, bindDatabaseSpace, describeSqliteSchema, LocalSqliteStorage, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { createProjectsSchema } from "@molis-ai/molis-work-module-projects";
import { createRuntimeContextBindingTables, createRuntimeContextSetupRequestTable, createRuntimeContextSuggestionRejectionTable } from "@molis-ai/molis-work-module-private-work-context";
import { createModelProviderTables } from "./model-provider-store.js";
import { createPluginTerminalPanelTables } from "./plugin-terminal-panels.js";
import { CATALOG_OWNER, CATALOG_SCHEMA_VERSION, catalogErrors, catalogSchemaCompatibilityError, isOwnedCatalogOwner } from "./project-catalog-contract.js";
import {createProjectCatalogReplicationSchema} from './project-catalog-replication-schema.js';
import {readDatabaseSpace} from '@molis-ai/molis-work-storage';

export type CatalogDesktopSchema = (db: SqliteDatabase) => void;

/** A new catalog: every owner's current tables on one local connection, at the catalog's version. */
export function initializeCatalog(storage: LocalSqliteStorage, createDesktopPanelTables: CatalogDesktopSchema): void {
  const db = storage.db;
  const metadata = new LocalCatalogMetadata(db);
  metadata.create();
  createProjectsSchema(db);
  createProjectCatalogReplicationSchema(db,readDatabaseSpace(db)?.kind==='personal');
  createRuntimeContextBindingTables(db);
  createRuntimeContextSetupRequestTable(db);
  createRuntimeContextSuggestionRejectionTable(db);
  createDesktopPanelTables(db);
  createPluginTerminalPanelTables(db);
  createModelProviderTables(db);
  metadata.initialize(CATALOG_OWNER, CATALOG_SCHEMA_VERSION);
}

export function assertOwnedCatalog(storage: LocalSqliteStorage, databasePath: string): void {
  assertCatalogOwner(new LocalCatalogMetadata(storage.db).owner(),databasePath);
}
function assertCatalogOwner(owner:string|null,databasePath:string):void {
  if (!isOwnedCatalogOwner(owner)) {
    throw catalogErrors.unknown_database(`不会复用未知项目目录数据库: ${databasePath}`);
  }
}

/** The catalog has one current schema: a catalog at another version is refused, never upgraded in place. */
export function assertCurrentCatalog(storage: LocalSqliteStorage, databasePath: string): void {
  assertCatalogVersion(new LocalCatalogMetadata(storage.db).version(),databasePath);
  // The current catalog has no personal planning table; accepting it would hide facts that belong to Goals' Home library.
  if (storage.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(PERSONAL_PLANNING_TABLE)) {
    throw catalogErrors.unsupported_schema(`项目目录数据库包含当前结构不接受的个人规划方法表 ${PERSONAL_PLANNING_TABLE}（现行事实属于 Goals 的 Home 库），不会打开或就地维护: ${databasePath}`);
  }
}
function assertCatalogVersion(version:number,databasePath:string):void {
  const compatibilityError = catalogSchemaCompatibilityError(version);
  if (compatibilityError) throw compatibilityError;
  if (version !== CATALOG_SCHEMA_VERSION) {
    throw catalogErrors.unsupported_schema(`Molis Work 项目目录数据库的版本是 ${version}，这个版本只认 ${CATALOG_SCHEMA_VERSION}，不就地升级: ${databasePath}`,
    );
  }

}
export function assertCatalogMetadata(metadata:{owner:string|null;version:number},databasePath:string):void {
  assertCatalogOwner(metadata.owner,databasePath);assertCatalogVersion(metadata.version,databasePath);
}

/** The table Goals kept the person's planning methods in before they moved to its library in the Home (PG-094 S13). */
const PERSONAL_PLANNING_TABLE = "personal_planning_method_packs";

export function inspectCurrentCatalogSnapshot(database: SqliteDatabase, createPanelSchema: CatalogDesktopSchema): Readonly<Record<string,string|number>> {
    const current = new LocalSqliteStorage(":memory:");
    try {
      const space = readDatabaseSpace(database);
      if (!space) throw catalogErrors.database_invalid("快照项目目录缺少空间归属");
      bindDatabaseSpace(current.db, space);
      createContextLedger(current.db, { initializeSchema: true, authorize: () => false });
      initializeCatalog(current, createPanelSchema);
      const expected = new LocalCatalogMetadata(current.db), actual = new LocalCatalogMetadata(database);
      const triggers = (db: SqliteDatabase) => db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
      if (expected.owner() !== actual.owner() || expected.version() !== actual.version() || !isDeepStrictEqual(triggers(database), triggers(current.db))
        || !isDeepStrictEqual(describeSqliteSchema(database), describeSqliteSchema(current.db)))
        throw catalogErrors.database_invalid("快照项目目录不是完整的现行 owner 结构");
      return { owner: actual.owner()!, schema_version: actual.version()! };
    } finally { current.close(); }
}

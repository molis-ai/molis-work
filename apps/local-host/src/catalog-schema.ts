import { LocalCatalogMetadata, type LocalSqliteStorage, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { createProjectsSchema } from "@molis-ai/molis-work-module-projects";
import { createPersonalPlanningMethodSchema } from "@molis-ai/molis-work-module-goals";
import { createRuntimeContextBindingTables, createRuntimeContextSetupRequestTable, createRuntimeContextSuggestionRejectionTable } from "@molis-ai/molis-work-module-private-work-context";
import { createModelProviderTables } from "./model-provider-store.js";
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
  createPersonalPlanningMethodSchema(db);
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

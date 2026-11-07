import { isDeepStrictEqual } from "node:util";
import { basename, dirname } from "node:path";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { LocalCatalogMetadata, bindDatabaseSpace, describeSqliteSchema, LocalSqliteStorage, versionRefusalAfterSignal, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { createProjectsSchema } from "@molis-ai/molis-work-module-projects";
import { createRuntimeContextBindingTables, createRuntimeContextSetupRequestTable, createRuntimeContextSuggestionRejectionTable } from "@molis-ai/molis-work-module-private-work-context";
import { createModelProviderTables } from "./model-provider-store.js";
import { createPluginTerminalPanelTables } from "./plugin-terminal-panels.js";
import { CATALOG_OWNER, CATALOG_SCHEMA_VERSION, CATALOG_UPGRADES, catalogErrors, catalogSchemaCompatibilityError, isOwnedCatalogOwner } from "./project-catalog-contract.js";
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

let catalogStatements: string | undefined;
/** The catalog is built in code, not from one statement. Only an upgrade needs this as text, so opening a catalog never pays for it. The desktop's panel tables are not the Host's to name: an extra table passes the comparison. */
function catalogSchemaStatements(): string {
  if (catalogStatements !== undefined) return catalogStatements;
  const reference = new LocalSqliteStorage(":memory:");
  try {
    createContextLedger(reference.db, { initializeSchema: true, authorize: () => false });
    initializeCatalog(reference, () => undefined);
    const objects = reference.db.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all() as Array<{ sql: string }>;
    catalogStatements = objects.map(({ sql }) => `${sql};`).join("\n");
    return catalogStatements;
  } finally { reference.close(); }
}

/** The catalog as the upgrade process sees it: its version and steps stay where the catalog declares them. Its version is in `catalog_meta` (`CATALOG_VERSION_ACCESS`). */
export const CATALOG_BASELINE = { version: CATALOG_SCHEMA_VERSION, upgrades: CATALOG_UPGRADES, get schema() { return catalogSchemaStatements(); } };

export function assertOwnedCatalog(storage: LocalSqliteStorage, databasePath: string): void {
  assertCatalogOwner(new LocalCatalogMetadata(storage.db).owner(),databasePath);
}
function assertCatalogOwner(owner:string|null,databasePath:string):void {
  if (!isOwnedCatalogOwner(owner)) {
    throw catalogErrors.unknown_database(`不会复用未知项目目录数据库: ${databasePath}`);
  }
}

/** The catalog has one current schema: at another version it is refused by what that version is (upgrade-chain-design §2.1), and only the upgrade process changes it. */
export function assertCurrentCatalog(storage: LocalSqliteStorage, databasePath: string): void {
  assertCatalogVersion(new LocalCatalogMetadata(storage.db).version(),databasePath);
  // The current catalog has no personal planning table; accepting it would hide facts that belong to Goals' Home library.
  if (storage.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(PERSONAL_PLANNING_TABLE)) {
    throw catalogErrors.unsupported_schema(`项目目录数据库包含当前结构不接受的个人规划方法表 ${PERSONAL_PLANNING_TABLE}（现行事实属于 Goals 的 Home 库），不会打开或就地维护: ${databasePath}`);
  }
}
function assertCatalogVersion(version:number,databasePath:string):void {
  const expected = CATALOG_BASELINE.version;
  if (version === expected) return;
  const tooNew = catalogSchemaCompatibilityError(version, expected);
  if (tooNew) throw tooNew;
  // A catalog of a Home is named by its place in it; any other file by its own name.
  const home = basename(dirname(databasePath)) === "projects" ? dirname(dirname(databasePath)) : undefined;
  throw versionRefusalAfterSignal(databasePath, Number.isInteger(version) ? version : 0, expected, home);
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

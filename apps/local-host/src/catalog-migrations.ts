import { LocalCatalogMetadata, type LocalSqliteStorage, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import type { ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { createProjectsSchema, migrateProjectDataClassSchema, migrateProjectDropLegacyImportSchema, migrateProjectInboxPluginSchema, migrateProjectOpenPluginSchema, migrateProjectTaskPluginSchema, migrateProjectDropTaskPluginSchema } from "@molis-ai/molis-work-module-projects";
import { createPersonalPlanningMethodSchema } from "@molis-ai/molis-work-module-goals";
import { createRuntimeContextBindingTables, createRuntimeContextSetupRequestTable, createRuntimeContextSuggestionRejectionTable, migrateRuntimeContextBindingEventsForUnbind, migrateRuntimeContextProjectReferences } from "@molis-ai/molis-work-module-private-work-context";
import { CATALOG_OWNER, CATALOG_SCHEMA_VERSION, MolisWorkProjectCatalogError, catalogSchemaCompatibilityError, isOwnedCatalogOwner } from "./project-catalog-contract.js";

export type CatalogDesktopSchema = (db: SqliteDatabase) => void;

/** The Host sequences existing owner migrations on one local catalog connection. */
export function initializeCatalog(storage: LocalSqliteStorage, createDesktopPanelTables: CatalogDesktopSchema): void {
  const db = storage.db;
  const metadata = new LocalCatalogMetadata(db);
  metadata.create();
  createProjectsSchema(db);
  createRuntimeContextBindingTables(db);
  createRuntimeContextSetupRequestTable(db);
  createRuntimeContextSuggestionRejectionTable(db);
  createDesktopPanelTables(db);
  createPersonalPlanningMethodSchema(db);
  metadata.initialize(CATALOG_OWNER, CATALOG_SCHEMA_VERSION);
}

export function assertOwnedCatalog(storage: LocalSqliteStorage, databasePath: string): void {
  if (!isOwnedCatalogOwner(new LocalCatalogMetadata(storage.db).owner())) {
    throw new MolisWorkProjectCatalogError("catalog.unknown_database", `不会复用未知项目目录数据库: ${databasePath}`);
  }
}

export function migrateCatalog(storage: LocalSqliteStorage, databasePath: string, ledger: ContextLedgerApi, createDesktopPanelTables: CatalogDesktopSchema): void {
  const db = storage.db;
  const metadata = new LocalCatalogMetadata(db);
  const version = metadata.version();
  const compatibilityError = catalogSchemaCompatibilityError(version);
  if (compatibilityError) throw compatibilityError;
  if (version === CATALOG_SCHEMA_VERSION) return;

  db.transaction(() => {
    let current = version;
    if (current === 1) {
      createRuntimeContextBindingTables(db);
      metadata.setVersion(2);
      current = 2;
    }
    if (current === 2) {
      createRuntimeContextSetupRequestTable(db);
      metadata.setVersion(3);
      current = 3;
    }
    if (current === 3) {
      migrateRuntimeContextBindingEventsForUnbind(db);
      createProjectsSchema(db);
      metadata.setVersion(4);
      current = 4;
    }
    if (current === 4) {
      createRuntimeContextSuggestionRejectionTable(db);
      metadata.setVersion(5);
      current = 5;
    }
    if (current === 5) {
      createProjectsSchema(db);
      metadata.setVersion(6);
      current = 6;
    }
    if (current === 6) {
      migrateProjectDataClassSchema(db);
      metadata.setVersion(7);
      current = 7;
    }
    if (current === 7) {
      createDesktopPanelTables(db);
      metadata.setVersion(8);
      current = 8;
    }
    if (current === 8) {
      createPersonalPlanningMethodSchema(db);
      metadata.setVersion(9);
      current = 9;
    }
    if (current === 9) {
      migrateRuntimeContextProjectReferences(db, ledger);
      metadata.setVersion(10);
      current = 10;
    }
    if (current === 10) {
      createProjectsSchema(db);
      db.exec(`INSERT OR IGNORE INTO project_plugins (project_id, plugin_id, added_at)
        SELECT project_id, plugin_id, updated_at FROM projects CROSS JOIN
        (SELECT 'goals' AS plugin_id UNION ALL SELECT 'sessions' UNION ALL SELECT 'feed' UNION ALL SELECT 'artifacts')`);
      metadata.setVersion(11);
      current = 11;
    }
    if (current === 11) {
      migrateProjectInboxPluginSchema(db);
      metadata.setVersion(12);
      current = 12;
    }
    if (current === 12) {
      migrateProjectTaskPluginSchema(db);
      metadata.setVersion(13);
      current = 13;
    }
    if (current === 13) {
      migrateProjectDropTaskPluginSchema(db);
      metadata.setVersion(14);
      current = 14;
    }
    if (current === 14) {
      migrateProjectDropLegacyImportSchema(db);
      metadata.setVersion(15);
      current = 15;
    }
    if (current === 15) {
      migrateProjectOpenPluginSchema(db);
      metadata.setVersion(16);
      current = 16;
    }
    if (current !== CATALOG_SCHEMA_VERSION) {
      throw new MolisWorkProjectCatalogError(
        "catalog.unsupported_schema",
        `Molis Work 项目目录数据库无法迁移到版本 ${CATALOG_SCHEMA_VERSION}: ${databasePath}`,
      );
    }
  })();
}

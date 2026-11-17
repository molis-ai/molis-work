import type { PluginProjectSchemaInspector, PluginUpgradeInspector } from "@molis-ai/molis-work-plugin-runtime";
import { describeSqliteSchema, listSqliteObjects, LocalSqliteStorage, nativeSqliteOwnerBoundary, nativeSqliteSchemaBoundary } from "@molis-ai/molis-work-storage";

/** Scratch and live checks use the same engine as the library. */
export const projectPluginSchemaInspector: PluginProjectSchemaInspector = {
  scratch: () => new LocalSqliteStorage(":memory:").db,
  objects: db => listSqliteObjects(db),
  shape: db => describeSqliteSchema(db),
};

/** SQLite authorizes only the current owner's rows and schema through every upgrade step. */
export const pluginLibraryUpgradeInspector: PluginUpgradeInspector = {
  ...projectPluginSchemaInspector,
  rows: (db, tables) => nativeSqliteOwnerBoundary(db, tables, new Map()),
  schema: (db, tables) => nativeSqliteSchemaBoundary(db, tables),
};

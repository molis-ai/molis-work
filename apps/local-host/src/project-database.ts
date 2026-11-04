import { existsSync } from "node:fs";
import { catalogErrors } from "./project-catalog-contract.js";
import { applySqliteBaseline, LocalSqliteStorage, SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
import { PROJECT_DATABASE_BASELINE } from "./project-database-schema.js";
import { openProjectPluginDatabases, type ProjectPluginDatabaseOutcome } from "./project-plugin-databases.js";

/** A project database recovery cannot open: gone, or at another schema version than this build's baseline. */


/**
 * One local connection at the project database baseline, with the built-in plugins' own tables opened on it. Goals' facts are not
 * read through it: they are Goals' own, asked of its actions. Recovery (`existingOnly`) opens a library already at this version and leaves its plugins' tables as
 * they are.
 */
export class LocalProjectDatabase extends LocalSqliteStorage {
  /** What happened to each built-in plugin's tables when this library opened; a refused one stops only that plugin. */
  readonly pluginDatabases: ReadonlyMap<string, ProjectPluginDatabaseOutcome>;

  constructor(path: string, options: { existingOnly?: boolean } = {}) {
    super(inspectDatabase(path, options.existingOnly ?? false), { fileMustExist: options.existingOnly });
    try {
      if (!options.existingOnly) applySqliteBaseline(this.db, path, PROJECT_DATABASE_BASELINE);
      this.pluginDatabases = options.existingOnly ? new Map() : openProjectPluginDatabases(this.db, path);
    } catch (error) { this.close(); throw error; }
  }
}

/** Reject before a writable connection can change journal mode; the normal baseline still rechecks after opening. */
function inspectDatabase(path: string, existingOnly: boolean): string {
  if (!existingOnly && !existsSync(path)) return path;
  const inspection = new LocalSqliteStorage(path, { readonly: true });
  try {
    const { user_version: version } = inspection.db.prepare("PRAGMA user_version").get() as { user_version: number };
    if (version !== PROJECT_DATABASE_BASELINE.version) {
      if (existingOnly) throw catalogErrors.project_recovery_unsupported_schema("catalog.project_recovery_unsupported_schema");
      const empty = !inspection.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get();
      if (version !== 0 || !empty) throw new SqliteSchemaVersionError(path, version, PROJECT_DATABASE_BASELINE.version);
    }
    return path;
  } finally { inspection.close(); }
}

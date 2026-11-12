import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { describeSqliteSchema, describeSqliteBaseline, sqliteBaselineTriggers } from "@molis-ai/molis-work-storage";
import { PROJECT_DATABASE_BASELINE } from "./project-database-schema.js";
import { ADOPTED_PROCESS_ITEMS_JOURNAL, ORIGINAL_PROJECT_REPLICATION_SCHEMA_SQL, PROJECT_REPLICATION_SCHEMA_SQL } from "./project-replication-schema.js";

/**
 * Which of the two project-library layouts of version 2 a file has (specs/batch-06-shared-tools/current-version-adoption.md): the
 * original, whose process-item triggers record into the original journal, or the current one with the adopted journal. Anything else
 * is neither and is refused, never repaired.
 */
export type ProjectLayout = "original" | "current";

/** The exact library every project had before adoption: the current baseline with the original process-item journal triggers. */
const ORIGINAL_SCHEMA = PROJECT_DATABASE_BASELINE.schema.replace(PROJECT_REPLICATION_SCHEMA_SQL, ORIGINAL_PROJECT_REPLICATION_SCHEMA_SQL);
if (ORIGINAL_SCHEMA === PROJECT_DATABASE_BASELINE.schema) throw new Error("project baseline no longer ends with its replication schema");

const layoutRefused = (path: string) => new ActionError("actions.service_unavailable", `${path} 既不是采用前的项目库，也不是现行项目库，不做采用`);

/** Same tables, columns, keys, checks and indexes as `schema`, and exactly its triggers. Extra tables are plugins' own. */
function layoutIs(db: SqliteDatabase, schema: string): boolean {
  const expected = describeSqliteBaseline({ version: PROJECT_DATABASE_BASELINE.version, schema, upgrades: [] }), found = describeSqliteSchema(db);
  if (!Object.entries(expected.tables).every(([name, table]) => JSON.stringify(found.tables[name]) === JSON.stringify(table))) return false;
  for (const [name, sql] of sqliteBaselineTriggers(schema)) {
    const actual = db.prepare("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?").get(name) as { sql: string } | undefined;
    if (actual?.sql !== sql) return false;
  }
  return true;
}

export function layoutOf(db: SqliteDatabase, path: string): ProjectLayout {
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  if (version !== PROJECT_DATABASE_BASELINE.version) throw layoutRefused(path);
  if (layoutIs(db, PROJECT_DATABASE_BASELINE.schema)) return "current";
  const adopted = db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name LIKE ?").get(`${ADOPTED_PROCESS_ITEMS_JOURNAL}_replica_%`);
  if (!adopted && layoutIs(db, ORIGINAL_SCHEMA)) return "original";
  throw layoutRefused(path);
}

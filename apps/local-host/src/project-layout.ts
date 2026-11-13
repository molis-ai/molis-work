import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { describeSqliteSchema, describeSqliteBaseline, sqliteBaselineTriggers } from "@molis-ai/molis-work-storage";
import { PROJECT_DATABASE_BASELINE, PROJECT_DATABASE_VERSION_2_SCHEMA } from "./project-database-schema.js";
import { ADOPTED_PROCESS_ITEMS_JOURNAL, ORIGINAL_PROJECT_REPLICATION_SCHEMA_SQL, PROJECT_REPLICATION_SCHEMA_SQL } from "./project-replication-schema.js";

/**
 * Which project-library layout a file has (specs/batch-06-shared-tools/current-version-adoption.md): the original one of version 2, whose
 * process-item triggers record into the original journal, or the current version with the adopted journal. Anything else is neither and
 * is refused, never repaired.
 */
export type ProjectLayout = "original" | "current";

/** A layout by version and creation statements; not a library declaration (the project library's is `PROJECT_DATABASE_BASELINE`). */
interface LayoutShape { readonly version: number; readonly schema: string }

/**
 * The exact library every project had before adoption: version 2 with the original process-item journal triggers. A Host's upgrade
 * cannot take it on (2 → 3 ends on the adopted layout, so the structure check rolls it back); only adoption does (user 2026-11-13).
 */
const ORIGINAL: LayoutShape = { version: 2, schema: PROJECT_DATABASE_VERSION_2_SCHEMA.replace(PROJECT_REPLICATION_SCHEMA_SQL, ORIGINAL_PROJECT_REPLICATION_SCHEMA_SQL) };
if (ORIGINAL.schema === PROJECT_DATABASE_VERSION_2_SCHEMA) throw new Error("the version-2 project schema no longer ends with its replication schema");

const layoutRefused = (path: string) => new ActionError("actions.service_unavailable", `${path} 既不是采用前的项目库，也不是现行项目库，不做采用`);

/** At `baseline`'s version, with the same tables, columns, keys, checks and indexes, and exactly its triggers. Extra tables are plugins' own. */
function layoutIs(db: SqliteDatabase, version: number, { version: expectedVersion, schema }: LayoutShape): boolean {
  if (version !== expectedVersion) return false;
  const expected = describeSqliteBaseline({ version, schema, upgrades: [] }), found = describeSqliteSchema(db);
  if (!Object.entries(expected.tables).every(([name, table]) => JSON.stringify(found.tables[name]) === JSON.stringify(table))) return false;
  for (const [name, sql] of sqliteBaselineTriggers(schema)) {
    const actual = db.prepare("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?").get(name) as { sql: string } | undefined;
    if (actual?.sql !== sql) return false;
  }
  return true;
}

export function layoutOf(db: SqliteDatabase, path: string): ProjectLayout {
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  if (layoutIs(db, version, PROJECT_DATABASE_BASELINE)) return "current";
  const adopted = db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name LIKE ?").get(`${ADOPTED_PROCESS_ITEMS_JOURNAL}_replica_%`);
  if (!adopted && layoutIs(db, version, ORIGINAL)) return "original";
  throw layoutRefused(path);
}

/**
 * Inside adoption's transaction, once an original library is on the adopted journal: the project upgrade's own later steps and version,
 * so it ends current. Only SQL and owner functions; a step that rebuilds tables needs foreign keys off, which a transaction cannot do.
 */
export function upgradeAdoptedOriginal(db: SqliteDatabase): void {
  const steps = (PROJECT_DATABASE_BASELINE.upgrades ?? []).filter(step => step.from >= ORIGINAL.version);
  for (const step of steps) {
    if (step.rebuilds_tables) throw new ActionError("actions.service_unavailable", `项目库从版本 ${step.from} 升级要重建表，不能在采用里做`);
    if (step.sql) db.exec(step.sql);
    step.run?.(db);
  }
  db.exec(`PRAGMA user_version = ${PROJECT_DATABASE_BASELINE.version}`);
  for (const step of steps) step.verify?.(db);
}

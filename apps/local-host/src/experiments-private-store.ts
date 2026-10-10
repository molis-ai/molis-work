import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { applySqliteBaseline, LocalSqliteStorage, type SqliteBaseline } from "@molis-ai/molis-work-storage";
import { PLUGIN_PRIVATE_STORAGE_SCHEMA_SQL } from "@molis-ai/molis-work-plugin-runtime";

/**
 * The Experiments private store (`plugins/experiments/private.sqlite`) as one current schema (repository-anti-corruption
 * §4.1, §4.11): a new file gets it with the version; one at another version, or with tables and no version, is refused
 * and never upgraded in place. Changing `plugin_private_values` means a new version here as well as in the project
 * database baseline, and a new fixture in `tests/fixtures/home-store-schemas/`.
 */
export const EXPERIMENTS_PRIVATE_BASELINE: SqliteBaseline = { version: 1, schema: PLUGIN_PRIVATE_STORAGE_SCHEMA_SQL };

/** Opens (creating it on first use) the Experiments private store of a Home at its baseline version. */
export function openExperimentsPrivateStore(home: string): LocalSqliteStorage {
  const directory = join(home, "plugins", "experiments");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const storage = new LocalSqliteStorage(join(directory, "private.sqlite"));
  try {
    chmodSync(storage.path, 0o600);
    applySqliteBaseline(storage.db, storage.path, EXPERIMENTS_PRIVATE_BASELINE);
    return storage;
  } catch (error) { storage.close(); throw error; }
}

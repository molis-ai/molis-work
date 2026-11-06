import { PROJECT_DATABASE_BASELINE } from "@molis-ai/molis-work-app-local-host";
import { applySqliteBaseline } from "@molis-ai/molis-work-storage";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";

/** Initialize the project's tables before composing plugin repositories by hand. */
export function openPluginTestDatabase(path: string) {
  const db = openTestSqlite(path);
  try {
    applySqliteBaseline(db, path, PROJECT_DATABASE_BASELINE);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

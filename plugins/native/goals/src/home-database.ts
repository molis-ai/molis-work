import type { HomePluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/** Personal planning methods belong to Goals' Home library. Old catalog-to-Home moves were
 * cancelled by the clean Home rebuild; the current owner creates only its present schema. */
export const GOALS_HOME_DATABASE: HomePluginDatabaseDeclaration = {
  store_name: "goals", version: 1, read_permission: "storage:private", write_permission: "storage:private",
  schema: `
    CREATE TABLE personal_planning_method_packs (
      method_id TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      pack_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `,
};

import type { HomePluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * Goals' library in the Home (`databases.home`, PG-094 S13): the planning methods the person keeps for themselves, across projects.
 * They were a table of the project catalog (`personal_planning_method_packs`); `scripts/maintenance/goals-personal-planning-move.mjs`
 * moves the rows here and drops that table. Project overrides stay in each project's own library.
 */
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

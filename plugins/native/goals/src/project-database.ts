import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { GOALS_BOARDS_SQL, GOALS_INPUT_BINDINGS_SQL, GOALS_TABLES_SQL } from "./project-database-goals.js";
import { GOALS_EVENT_FACTS_SQL } from "./project-database-event-facts.js";
import { GOALS_EVENT_STATE_SQL } from "./project-database-event-state.js";
import { GOALS_GOVERNANCE_SQL, GOALS_TREE_EFFECTS_SQL } from "./project-database-governance.js";

/** Private library for Goals; project approvals live in the platform project library. */
export const GOALS_PROJECT_DATABASE: PluginDatabaseDeclaration = {
  store_name: "goals", version: /* @version database.goals_project_database */ 1,
  upgrades: [],
  schema: [GOALS_BOARDS_SQL, GOALS_TABLES_SQL, GOALS_INPUT_BINDINGS_SQL, GOALS_EVENT_FACTS_SQL, GOALS_EVENT_STATE_SQL, GOALS_GOVERNANCE_SQL].join("\n") + GOALS_TREE_EFFECTS_SQL,
  read_permission: "storage:private", write_permission: "storage:private",
};

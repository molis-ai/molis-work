import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { GOALS_BOARDS_SQL, GOALS_INPUT_BINDINGS_SQL, GOALS_TABLES_SQL } from "./project-database-goals.js";
import { GOALS_EVENT_FACTS_SQL } from "./project-database-event-facts.js";
import { GOALS_EVENT_STATE_SQL } from "./project-database-event-state.js";
import { GOALS_GOVERNANCE_SQL } from "./project-database-governance.js";

/**
 * Goals' own tables in a project's library, declared in the Manifest (`databases.project`, PG-020) like any plugin's: the Goal tree,
 * the board that names its current Goal, input receipts, event work's facts and state, and the proposals and decisions Governance
 * keeps beside them. The text of every statement is what the project library's baseline has always carried (version 7), in the same
 * order, so a library made from this declaration has the shape the baseline gives it; the Host's baseline composes this schema for
 * now, and the statements leave it when the platform opens the declaration in each project's library (S8, specs/plugin-project-database).
 * `modules/goals` and `modules/governance-collaboration` still read and write these tables with their own SQL until Goals' storage
 * moves into the plugin (S9); `tooling/gates/table-owners.json` lists them as users.
 */
export const GOALS_PROJECT_DATABASE: PluginDatabaseDeclaration = {
  store_name: "goals",
  version: 1,
  schema: [GOALS_BOARDS_SQL, GOALS_TABLES_SQL, GOALS_INPUT_BINDINGS_SQL, GOALS_EVENT_FACTS_SQL, GOALS_EVENT_STATE_SQL, GOALS_GOVERNANCE_SQL].join("\n"),
  // A plugin's own tables in the project's library are its private storage (D23), not Goals' action permissions.
  read_permission: "storage:private",
  write_permission: "storage:private",
};

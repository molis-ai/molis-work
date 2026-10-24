import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { GOALS_BOARDS_SQL, GOALS_INPUT_BINDINGS_SQL, GOALS_TABLES_SQL } from "./project-database-goals.js";
import { GOALS_EVENT_FACTS_SQL } from "./project-database-event-facts.js";
import { GOALS_EVENT_STATE_SQL } from "./project-database-event-state.js";
import { GOALS_GOVERNANCE_SQL } from "./project-database-governance.js";

/**
 * Goals' own tables in a project's library, declared in the Manifest (`databases.project`, PG-020) like any plugin's: the Goal tree,
 * the board that names its current Goal, input receipts, event work's facts and state, and the proposals and decisions Governance
 * keeps beside them. The project library's baseline no longer carries them: the platform makes them the first time a library opens with
 * Goals and records them in `plugin_project_databases`; a changed shape stops Goals alone. The board points at the library's
 * `project_root` row and keeps no project name; every other table here points at the board.
 * `modules/goals` and `modules/governance-collaboration` still read and write these tables with their own SQL until Goals' storage
 * moves into the plugin (S9); `tooling/gates/table-owners.json` lists them as users.
 */
export const GOALS_PROJECT_DATABASE: PluginDatabaseDeclaration = {
  store_name: "goals",
  // 2: the names Goals writes into the project's shared tables carry its namespace (PG-094 S9-2). A library recorded at 1 still has them
  // without it, and Goals alone is refused there until `scripts/maintenance/goals-namespace-prefix.mjs` has renamed them and recorded 2.
  version: 2,
  schema: [GOALS_BOARDS_SQL, GOALS_TABLES_SQL, GOALS_INPUT_BINDINGS_SQL, GOALS_EVENT_FACTS_SQL, GOALS_EVENT_STATE_SQL, GOALS_GOVERNANCE_SQL].join("\n"),
  // A plugin's own tables in the project's library are its private storage (D23), not Goals' action permissions.
  read_permission: "storage:private",
  write_permission: "storage:private",
};

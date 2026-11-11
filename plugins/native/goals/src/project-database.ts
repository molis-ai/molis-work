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
  version: /* @version database.goals_project_database */ 2,
  // 1 → 2 (2026-11-11, evidence contract): what a judgment checked and how far Goals found it backed, and the version a conclusion was about.
  // The new columns carry no CHECK: a step may not add a column with one (SQLite checks the whole library for it, which the platform's
  // authorizer over a plugin's step refuses), and the tables after the step must be exactly what `schema` makes. Goals alone writes them.
  upgrades: [{
    from: 1,
    sql: [
      "ALTER TABLE goal_work_event_judgments ADD COLUMN basis_json TEXT",
      "ALTER TABLE goal_work_event_judgments ADD COLUMN tier TEXT NOT NULL DEFAULT 'self_reported'",
      "ALTER TABLE goal_work_event_judgments ADD COLUMN gap TEXT",
      "ALTER TABLE goal_work_event_judgments ADD COLUMN reporter_session TEXT",
      "ALTER TABLE goal_event_requirement_conclusions ADD COLUMN checked_artifact_id TEXT",
      "ALTER TABLE goal_event_requirement_conclusions ADD COLUMN checked_version INTEGER",
    ].join(";\n") + ";",
  }],
  schema: [GOALS_BOARDS_SQL, GOALS_TABLES_SQL, GOALS_INPUT_BINDINGS_SQL, GOALS_EVENT_FACTS_SQL, GOALS_EVENT_STATE_SQL, GOALS_GOVERNANCE_SQL].join("\n"),
  // A plugin's own tables in the project's library are its private storage (D23), not Goals' action permissions.
  read_permission: "storage:private",
  write_permission: "storage:private",
};

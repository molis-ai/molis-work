import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { GOALS_BOARDS_SQL, GOALS_INPUT_BINDINGS_SQL, GOALS_TABLES_SQL, GOALS_V2_POLICY_SQL } from "./project-database-goals.js";
import { GOALS_EVENT_FACTS_SQL } from "./project-database-event-facts.js";
import { GOALS_EVENT_STATE_SQL, GOALS_V2_EVENT_STATE_SQL } from "./project-database-event-state.js";
import { GOALS_GOVERNANCE_SQL, GOALS_TREE_EFFECTS_SQL, GOALS_V2_DECISIONS_SQL } from "./project-database-governance.js";

const businessSchema = (eventState: string) =>
  [GOALS_BOARDS_SQL, GOALS_TABLES_SQL, GOALS_INPUT_BINDINGS_SQL, GOALS_EVENT_FACTS_SQL, eventState, GOALS_GOVERNANCE_SQL].join("\n");
const priorSchema = (eventState: string) => [businessSchema(eventState), GOALS_V2_POLICY_SQL, GOALS_V2_DECISIONS_SQL].join("\n");

const goalsV1 = (schema: string) => schema
  .replace("    basis_json TEXT,\n    tier TEXT NOT NULL DEFAULT 'self_reported',\n    gap TEXT,\n    reporter_session TEXT,\n", "")
  .replace("    checked_artifact_id TEXT,\n    checked_version INTEGER,\n", "");

const GOALS_PROJECT_DATABASE_V1 = {
  store_name: "goals", version: 1, schema: goalsV1(priorSchema(GOALS_V2_EVENT_STATE_SQL)),
  read_permission: "storage:private", write_permission: "storage:private",
};

/** Private library after the project baseline has moved approvals to the platform. */
export const GOALS_PROJECT_DATABASE: PluginDatabaseDeclaration = {
  store_name: "goals", version: /* @version database.goals_project_database */ 4,
  schema: businessSchema(GOALS_EVENT_STATE_SQL) + GOALS_TREE_EFFECTS_SQL,
  read_permission: "storage:private", write_permission: "storage:private",
};

/** Original v3 declaration. The Host verifies this shape and runs these steps inside the approval transfer for v1/v2 libraries. */
const GOALS_PROJECT_DATABASE_V3: PluginDatabaseDeclaration = {
  store_name: "goals", version: 3,
  schema: priorSchema(GOALS_EVENT_STATE_SQL),
  read_permission: "storage:private", write_permission: "storage:private",
  upgrades: [{
    from: 1,
    sql: `
      ALTER TABLE goal_work_event_judgments ADD COLUMN basis_json TEXT;
      ALTER TABLE goal_work_event_judgments ADD COLUMN tier TEXT NOT NULL DEFAULT 'self_reported';
      ALTER TABLE goal_work_event_judgments ADD COLUMN gap TEXT;
      ALTER TABLE goal_work_event_judgments ADD COLUMN reporter_session TEXT;
      ALTER TABLE goal_event_requirement_conclusions ADD COLUMN checked_artifact_id TEXT;
      ALTER TABLE goal_event_requirement_conclusions ADD COLUMN checked_version INTEGER;
    `,
  }, {
    // 2 → 3 (2026-11-13, risk plugin): the objects a concern cites, such as a risk record (`{kind, id}`, at most eight).
    from: 2,
    sql: `
      ALTER TABLE goal_event_concerns ADD COLUMN cited_subjects_json TEXT NOT NULL DEFAULT '[]';
    `,
  }],
};

/** Each source shape has its own verified ledger, including the corresponding sync tracking. */
const GOALS_PROJECT_DATABASE_V2 = {
  ...GOALS_PROJECT_DATABASE_V3, version: 2, schema: priorSchema(GOALS_V2_EVENT_STATE_SQL), upgrades: [],
};

export const GOALS_APPROVAL_TRANSFER_BASELINES = {
  1: GOALS_PROJECT_DATABASE_V1, 2: GOALS_PROJECT_DATABASE_V2, 3: GOALS_PROJECT_DATABASE_V3,
} satisfies Readonly<Record<number, PluginDatabaseDeclaration>>;
export type GoalsApprovalSource = keyof typeof GOALS_APPROVAL_TRANSFER_BASELINES;
export const GOALS_APPROVAL_TRANSFER_SOURCE = GOALS_PROJECT_DATABASE_V3.version;

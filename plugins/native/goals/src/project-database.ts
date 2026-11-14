import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { GOALS_BOARDS_SQL, GOALS_INPUT_BINDINGS_SQL, GOALS_TABLES_SQL, GOALS_V2_POLICY_SQL } from "./project-database-goals.js";
import { GOALS_EVENT_FACTS_SQL } from "./project-database-event-facts.js";
import { GOALS_EVENT_STATE_SQL, GOALS_V2_EVENT_STATE_SQL } from "./project-database-event-state.js";
import { GOALS_GOVERNANCE_SQL, GOALS_TREE_EFFECTS_SQL, GOALS_V2_DECISIONS_SQL } from "./project-database-governance.js";

const businessSchema = (eventState: string) =>
  [GOALS_BOARDS_SQL, GOALS_TABLES_SQL, GOALS_INPUT_BINDINGS_SQL, GOALS_EVENT_FACTS_SQL, eventState, GOALS_GOVERNANCE_SQL].join("\n");
const approvalSchema = (eventState: string) => [businessSchema(eventState), GOALS_V2_POLICY_SQL, GOALS_V2_DECISIONS_SQL].join("\n");

/** Only v1–v3 contained Goals' own planning methods. These objects are used to inspect, then upgrade, those sources. */
function preV4Schema(eventState: string): string {
  const configVersion = "    actor_id TEXT NOT NULL,\n    created_at TEXT NOT NULL,\n    config_event_id TEXT NOT NULL,";
  return approvalSchema(eventState).replace(configVersion,
    configVersion.replace("    created_at", "    adopted_planning_json TEXT NOT NULL DEFAULT '[]',\n    created_at")) + `
  CREATE TABLE planning_method_packs (
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    method_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    pack_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, method_id)
  );
`;
}

const goalsV1 = (schema: string) => schema
  .replace("    basis_json TEXT,\n    tier TEXT NOT NULL DEFAULT 'self_reported',\n    gap TEXT,\n    reporter_session TEXT,\n", "")
  .replace("    checked_artifact_id TEXT,\n    checked_version INTEGER,\n", "");

const GOALS_PROJECT_DATABASE_V1 = {
  store_name: "goals", version: 1, schema: goalsV1(preV4Schema(GOALS_V2_EVENT_STATE_SQL)),
  read_permission: "storage:private", write_permission: "storage:private",
};

/** Private library after the project baseline has moved approvals to the platform. */
export const GOALS_PROJECT_DATABASE: PluginDatabaseDeclaration = {
  store_name: "goals", version: /* @version database.goals_project_database */ 5,
  schema: businessSchema(GOALS_EVENT_STATE_SQL) + GOALS_TREE_EFFECTS_SQL,
  read_permission: "storage:private", write_permission: "storage:private",
};

/** Batch 41's v4, with the original approvals and without the former planning tables or config adoption. */
const GOALS_PROJECT_DATABASE_V4: PluginDatabaseDeclaration = {
  store_name: "goals", version: 4,
  schema: approvalSchema(GOALS_EVENT_STATE_SQL),
  read_permission: "storage:private", write_permission: "storage:private",
  // 1 → 2 (2026-11-11, evidence contract): what a judgment checked and how far Goals found it backed, and the version a conclusion was about.
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
  }, {
    // 3 → 4 (2026-11-14, 用户定): planning and breakdown methods are Skills of the platform's catalog, not something Goals keeps or
    // a Goal adopts. The project's method table and the column naming what a configuration adopted go; nothing replaces them.
    from: 3,
    sql: `
      DROP TABLE planning_method_packs;
      ALTER TABLE goal_event_config_versions DROP COLUMN adopted_planning_json;
    `,
    reduces_rows: ["planning_method_packs"],
  }],
};

/** Each source shape has its own verified ledger, including the corresponding sync tracking. */
const GOALS_PROJECT_DATABASE_V2 = {
  ...GOALS_PROJECT_DATABASE_V1, version: 2, schema: preV4Schema(GOALS_V2_EVENT_STATE_SQL),
};
const GOALS_PROJECT_DATABASE_V3 = {
  ...GOALS_PROJECT_DATABASE_V1, version: 3, schema: preV4Schema(GOALS_EVENT_STATE_SQL),
};

export const GOALS_APPROVAL_TRANSFER_BASELINES = {
  1: GOALS_PROJECT_DATABASE_V1, 2: GOALS_PROJECT_DATABASE_V2, 3: GOALS_PROJECT_DATABASE_V3, 4: GOALS_PROJECT_DATABASE_V4,
} satisfies Readonly<Record<number, PluginDatabaseDeclaration>>;
export type GoalsApprovalSource = keyof typeof GOALS_APPROVAL_TRANSFER_BASELINES;
export const GOALS_APPROVAL_TRANSFER_SOURCE = GOALS_PROJECT_DATABASE_V4.version;

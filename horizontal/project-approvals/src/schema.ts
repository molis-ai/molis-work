import { replicaMarkSql, replicaSchemaSql } from "@molis-ai/molis-work-storage";

export const PROJECT_APPROVALS_JOURNAL = "project_approvals";
const mark = (row: "NEW" | "OLD") => replicaMarkSql(`json_array(${row}.project_id,'project_approvals',${row}.project_id)`, undefined, PROJECT_APPROVALS_JOURNAL);

/** The project library creates these tables in the same transaction as its version. */
export const PROJECT_APPROVALS_SCHEMA_SQL = `
CREATE TABLE project_review_decisions (
  decision_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
  request_id TEXT,
  request_key TEXT,
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  recorded_at TEXT NOT NULL,
  CHECK ((request_id IS NULL) = (request_key IS NULL)),
  UNIQUE(project_id, request_id),
  UNIQUE(project_id, request_key)
);
CREATE INDEX project_review_decisions_history ON project_review_decisions(project_id, recorded_at, decision_id);
CREATE TABLE project_approval_rules (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
  scope_json TEXT NOT NULL CHECK (json_valid(scope_json)),
  rule_order INTEGER NOT NULL CHECK (rule_order > 0),
  requires_person INTEGER CHECK (requires_person IN (0, 1)),
  revision INTEGER NOT NULL CHECK (revision > 0),
  state TEXT NOT NULL CHECK (state IN ('active', 'replaced', 'withdrawn')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  changed_by TEXT,
  changed_at TEXT,
  change_reason TEXT,
  CHECK ((changed_by IS NULL) = (changed_at IS NULL)),
  CHECK ((changed_at IS NULL) = (change_reason IS NULL))
);
CREATE INDEX project_approval_rules_scope ON project_approval_rules(project_id, scope_json, state, id);
CREATE INDEX project_approval_rules_order ON project_approval_rules(project_id, rule_order, id);
${replicaSchemaSql(PROJECT_APPROVALS_JOURNAL)}
INSERT INTO project_approvals_replica_state(id,device) VALUES(1,lower(hex(randomblob(16))));
CREATE TRIGGER project_approvals_decisions_insert AFTER INSERT ON project_review_decisions BEGIN ${mark("NEW")} END;
CREATE TRIGGER project_approvals_rules_insert AFTER INSERT ON project_approval_rules BEGIN ${mark("NEW")} END;
CREATE TRIGGER project_approvals_rules_update AFTER UPDATE ON project_approval_rules BEGIN ${mark("NEW")} END;
`;

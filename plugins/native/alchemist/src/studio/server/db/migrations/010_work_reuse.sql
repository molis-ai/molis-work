ALTER TABLE research_plans ADD COLUMN reuse_json TEXT;
ALTER TABLE memory_rule_applications ADD COLUMN rule_version INTEGER;
ALTER TABLE memory_rule_applications ADD COLUMN method_snapshot_json TEXT;

CREATE TABLE research_playbook_revisions (
  rule_id TEXT NOT NULL REFERENCES research_playbook_rules(id),
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  PRIMARY KEY (rule_id, version)
);
CREATE TABLE work_reuse_receipts (
  plan_id TEXT PRIMARY KEY REFERENCES research_plans(id),
  run_id TEXT NOT NULL REFERENCES lens_runs(id),
  actor_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  consumed_at TEXT NOT NULL,
  relation_state TEXT NOT NULL CHECK (relation_state IN ('pending','recorded','not_needed')),
  feedback_json TEXT
);

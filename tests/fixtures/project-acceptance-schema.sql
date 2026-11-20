-- Requirements, deliveries, checks and the person's decisions (specs/plugin-equal-standing/contract-design.md §10, batch 44 item 3):
-- the platform's five tables and its sync collection's transport in the project library.
CREATE TABLE acceptance_subjects (
  subject_no INTEGER PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  subject_kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, provider_id, subject_kind, subject_id)
);
CREATE TABLE acceptance_requirements (
  seq INTEGER PRIMARY KEY,
  subject_no INTEGER NOT NULL REFERENCES acceptance_subjects(subject_no),
  requirement_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  statement TEXT NOT NULL,
  expected TEXT,
  part TEXT,
  requires_person INTEGER NOT NULL,
  withdrawn INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  by_person INTEGER NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (subject_no, requirement_id, version)
);
CREATE TABLE acceptance_deliveries (
  seq INTEGER PRIMARY KEY,
  subject_no INTEGER NOT NULL REFERENCES acceptance_subjects(subject_no),
  round INTEGER NOT NULL,
  version TEXT NOT NULL,
  summary TEXT,
  touches_json TEXT,
  made_in_session TEXT,
  made_in_run TEXT,
  actor_id TEXT NOT NULL,
  delivered_at TEXT NOT NULL,
  UNIQUE (subject_no, round),
  UNIQUE (subject_no, version)
);
CREATE TABLE acceptance_checks (
  seq INTEGER PRIMARY KEY,
  check_id TEXT NOT NULL UNIQUE,
  subject_no INTEGER NOT NULL REFERENCES acceptance_subjects(subject_no),
  clock INTEGER NOT NULL,
  requirement_id TEXT NOT NULL,
  requirement_version INTEGER NOT NULL,
  round INTEGER NOT NULL,
  kind TEXT NOT NULL,
  verdict TEXT NOT NULL,
  tier TEXT NOT NULL,
  gap TEXT,
  checked_version TEXT NOT NULL,
  method TEXT NOT NULL,
  observed TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  reporter_session TEXT,
  actor_id TEXT NOT NULL,
  reported_at TEXT NOT NULL
);
CREATE INDEX acceptance_checks_by_subject ON acceptance_checks (subject_no, requirement_id, clock);
CREATE TABLE acceptance_decisions (
  seq INTEGER PRIMARY KEY,
  decision_id TEXT NOT NULL,
  subject_no INTEGER NOT NULL REFERENCES acceptance_subjects(subject_no),
  clock INTEGER NOT NULL,
  requirement_id TEXT NOT NULL,
  requirement_version INTEGER NOT NULL,
  stands_round INTEGER NOT NULL,
  version TEXT NOT NULL,
  decision TEXT NOT NULL,
  note TEXT,
  origin TEXT NOT NULL CHECK (origin IN ('trusted_decision')),
  origin_ref TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  UNIQUE (decision_id, requirement_id)
);
CREATE INDEX acceptance_decisions_by_subject ON acceptance_decisions (subject_no, requirement_id, clock);
CREATE TABLE acceptance_sync_resolving (marker INTEGER PRIMARY KEY CHECK (marker = 1));
CREATE TRIGGER acceptance_requirements_no_update BEFORE UPDATE ON acceptance_requirements
  WHEN NOT EXISTS (SELECT 1 FROM acceptance_sync_resolving) BEGIN SELECT RAISE(ABORT, 'acceptance records are append-only'); END;
CREATE TRIGGER acceptance_requirements_no_delete BEFORE DELETE ON acceptance_requirements
  WHEN NOT EXISTS (SELECT 1 FROM acceptance_sync_resolving) BEGIN SELECT RAISE(ABORT, 'acceptance records are append-only'); END;
CREATE TRIGGER acceptance_deliveries_no_update BEFORE UPDATE ON acceptance_deliveries
  WHEN NOT EXISTS (SELECT 1 FROM acceptance_sync_resolving) BEGIN SELECT RAISE(ABORT, 'acceptance records are append-only'); END;
CREATE TRIGGER acceptance_deliveries_no_delete BEFORE DELETE ON acceptance_deliveries
  WHEN NOT EXISTS (SELECT 1 FROM acceptance_sync_resolving) BEGIN SELECT RAISE(ABORT, 'acceptance records are append-only'); END;
CREATE TRIGGER acceptance_checks_no_update BEFORE UPDATE ON acceptance_checks
  WHEN NOT EXISTS (SELECT 1 FROM acceptance_sync_resolving) BEGIN SELECT RAISE(ABORT, 'acceptance records are append-only'); END;
CREATE TRIGGER acceptance_checks_no_delete BEFORE DELETE ON acceptance_checks
  WHEN NOT EXISTS (SELECT 1 FROM acceptance_sync_resolving) BEGIN SELECT RAISE(ABORT, 'acceptance records are append-only'); END;
CREATE TRIGGER acceptance_decisions_no_update BEFORE UPDATE ON acceptance_decisions
  WHEN NOT EXISTS (SELECT 1 FROM acceptance_sync_resolving) BEGIN SELECT RAISE(ABORT, 'acceptance records are append-only'); END;
CREATE TRIGGER acceptance_decisions_no_delete BEFORE DELETE ON acceptance_decisions
  WHEN NOT EXISTS (SELECT 1 FROM acceptance_sync_resolving) BEGIN SELECT RAISE(ABORT, 'acceptance records are append-only'); END;
CREATE TABLE acceptance_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE acceptance_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE INDEX acceptance_replica_changes_key ON acceptance_replica_changes(key);
CREATE TABLE acceptance_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE acceptance_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE acceptance_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE acceptance_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TRIGGER acceptance_requirements_mark AFTER INSERT ON acceptance_requirements BEGIN
  INSERT INTO acceptance_replica_changes(key) SELECT (SELECT json_array(s.project_id,'acceptance',s.provider_id,s.subject_kind,s.subject_id) FROM acceptance_subjects s WHERE s.subject_no=NEW.subject_no)
  WHERE (SELECT applying FROM acceptance_replica_state WHERE id=1)=0 AND (1=1);
END;
CREATE TRIGGER acceptance_deliveries_mark AFTER INSERT ON acceptance_deliveries BEGIN
  INSERT INTO acceptance_replica_changes(key) SELECT (SELECT json_array(s.project_id,'acceptance',s.provider_id,s.subject_kind,s.subject_id) FROM acceptance_subjects s WHERE s.subject_no=NEW.subject_no)
  WHERE (SELECT applying FROM acceptance_replica_state WHERE id=1)=0 AND (1=1);
END;
CREATE TRIGGER acceptance_checks_mark AFTER INSERT ON acceptance_checks BEGIN
  INSERT INTO acceptance_replica_changes(key) SELECT (SELECT json_array(s.project_id,'acceptance',s.provider_id,s.subject_kind,s.subject_id) FROM acceptance_subjects s WHERE s.subject_no=NEW.subject_no)
  WHERE (SELECT applying FROM acceptance_replica_state WHERE id=1)=0 AND (1=1);
END;
CREATE TRIGGER acceptance_decisions_mark AFTER INSERT ON acceptance_decisions BEGIN
  INSERT INTO acceptance_replica_changes(key) SELECT (SELECT json_array(s.project_id,'acceptance',s.provider_id,s.subject_kind,s.subject_id) FROM acceptance_subjects s WHERE s.subject_no=NEW.subject_no)
  WHERE (SELECT applying FROM acceptance_replica_state WHERE id=1)=0 AND (1=1);
END;

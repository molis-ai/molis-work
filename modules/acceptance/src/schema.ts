import type { HomeStoreDeclaration, SqliteBaseline } from "@molis-ai/molis-work-storage";

/** The Home store of requirements and acceptance: `<Home>/acceptance/acceptance.db`. Only this package reads or writes it. */
export const ACCEPTANCE_STORE = "acceptance";

/**
 * Every table but `acceptance_subjects` is a log: a row is written once and never changed, so a requirement's earlier versions, every check
 * and every decision stay readable after rework (PWA-146). A requirement that changes gets a row with the next `version`; one that
 * is taken off the list gets a row marked `withdrawn`. `acceptance_checks.round` and `acceptance_decisions.stands_round` say which delivery the row was
 * made against, which is how a later delivery that touches the requirement puts it back to "not yet checked or decided".
 */
export const ACCEPTANCE_BASELINE: SqliteBaseline = { version: /* @version database.acceptance_baseline */ 1, schema: `
  CREATE TABLE acceptance_subjects (
    subject_no INTEGER PRIMARY KEY,
    project_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    subject_kind TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (project_id, provider_id, subject_kind, subject_id)
  );
  CREATE TABLE acceptance_requirements (
    seq INTEGER PRIMARY KEY,
    subject_no INTEGER NOT NULL,
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
    subject_no INTEGER NOT NULL,
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
    subject_no INTEGER NOT NULL,
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
  CREATE INDEX acceptance_checks_by_subject ON acceptance_checks (subject_no, requirement_id, seq);
  CREATE TABLE acceptance_decisions (
    seq INTEGER PRIMARY KEY,
    decision_id TEXT NOT NULL,
    subject_no INTEGER NOT NULL,
    requirement_id TEXT NOT NULL,
    requirement_version INTEGER NOT NULL,
    stands_round INTEGER NOT NULL,
    version TEXT NOT NULL,
    decision TEXT NOT NULL,
    note TEXT,
    actor_id TEXT NOT NULL,
    decided_at TEXT NOT NULL
  );
  CREATE INDEX acceptance_decisions_by_subject ON acceptance_decisions (subject_no, requirement_id, seq);
` };

export const ACCEPTANCE_HOME_STORE: HomeStoreDeclaration = { path: ACCEPTANCE_STORE, library: { baseline: ACCEPTANCE_BASELINE } };

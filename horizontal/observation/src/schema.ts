import type { SqliteBaseline } from "@molis-ai/molis-work-storage";

/** The Home store of the observation layer: `<Home>/observation/observation.db` (contract-design §2). */
export const OBSERVATION_STORE = "observation";

/**
 * Records, their evidence snapshots and the coverage register (contract-design §3, §6, §8). Only this package reads or writes these
 * tables. A record keeps its lists and small values as JSON; evidence bodies are stored once per digest, compressed and encrypted, and kept
 * while a record refers to them. Evaluation holds come with batch 30, by an upgrade step. `writer_state` keeps when the last batch was
 * written, so a run that ended before writing its queue is shown as a gap the next time.
 */
export const OBSERVATION_BASELINE: SqliteBaseline = { version: /* @version database.observation_baseline */ 1, schema: `
  CREATE TABLE records (
    seq INTEGER PRIMARY KEY,
    record_id TEXT NOT NULL UNIQUE,
    owner_kind TEXT NOT NULL,
    owner_id TEXT,
    fact TEXT NOT NULL,
    provider_id TEXT,
    stage TEXT,
    outcome TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_kind TEXT,
    audience TEXT NOT NULL,
    delegated_by TEXT,
    entry TEXT NOT NULL,
    project_id TEXT,
    install_id TEXT,
    occurred_at TEXT NOT NULL,
    received_at TEXT NOT NULL,
    clock_adjusted INTEGER NOT NULL DEFAULT 0,
    call_id TEXT,
    invocation_id TEXT,
    parent_invocation_id TEXT,
    runtime_session_id TEXT,
    run_id TEXT,
    work_ref TEXT,
    source_class TEXT NOT NULL,
    subjects TEXT NOT NULL,
    conditions TEXT NOT NULL,
    detail TEXT NOT NULL,
    evidence TEXT NOT NULL,
    coalesced_count INTEGER,
    coalesced_last_at TEXT
  );
  CREATE INDEX records_project_time ON records (project_id, occurred_at);
  CREATE INDEX records_call ON records (call_id);
  CREATE INDEX records_invocation ON records (invocation_id);
  CREATE INDEX records_run ON records (run_id);
  CREATE INDEX records_fact_time ON records (fact, occurred_at);
  CREATE INDEX records_provider ON records (provider_id);
  CREATE TABLE evidence_blobs (
    digest TEXT PRIMARY KEY,
    bytes INTEGER NOT NULL,
    media_type TEXT NOT NULL,
    body BLOB NOT NULL,
    stored_at TEXT NOT NULL
  );
  CREATE TABLE record_evidence (
    seq INTEGER NOT NULL,
    digest TEXT NOT NULL,
    PRIMARY KEY (seq, digest)
  );
  CREATE INDEX record_evidence_digest ON record_evidence (digest);
  CREATE TABLE coverage (
    owner TEXT NOT NULL,
    fact TEXT NOT NULL,
    entry TEXT NOT NULL,
    project_id TEXT NOT NULL,
    state TEXT NOT NULL,
    since TEXT NOT NULL,
    since_version TEXT NOT NULL,
    reason TEXT,
    truncated INTEGER NOT NULL DEFAULT 0,
    redacted INTEGER NOT NULL DEFAULT 0,
    by_rule INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (owner, fact, entry, project_id)
  );
  CREATE TABLE coverage_gaps (
    gap_id INTEGER PRIMARY KEY,
    owner TEXT NOT NULL,
    fact TEXT NOT NULL,
    entry TEXT NOT NULL,
    project_id TEXT NOT NULL,
    state TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    count INTEGER NOT NULL,
    reason TEXT NOT NULL
  );
  CREATE INDEX coverage_gaps_project ON coverage_gaps (project_id, started_at);
  CREATE TABLE report_quota (
    reporter TEXT NOT NULL,
    day TEXT NOT NULL,
    facts INTEGER NOT NULL,
    bytes INTEGER NOT NULL,
    PRIMARY KEY (reporter, day)
  );
  CREATE TABLE writer_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
` };

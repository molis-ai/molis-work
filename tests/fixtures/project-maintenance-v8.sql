-- Project library maintenance, version 7 to version 8 (PG-020, specs/plugin-project-database/spec.md §3 L1b; the maintenance
-- list of specs/repository-anti-corruption/spec.md §4.1; docs/releases/CHECKLIST.md §4.3 maintenance eight). Version 8 is
-- version 7 with the project as its own root and the plugins' tables recorded as theirs:
--   * project_root (modules/projects), one row: the project itself, copied from Goals' one board (project_id, created_at);
--   * boards (Goals) is made anew without `title` (the Catalog owns the project's name) and with project_id pointing at
--     project_root(project_id) ON DELETE CASCADE; its one row and its rowid are kept, and the thirty other Goals tables, whose
--     foreign keys point at boards(project_id), are not touched;
--   * the eleven tables whose foreign key pointed at boards(project_id) point it at project_root(project_id) instead
--     (coding_sessions, events, feed_items, feed_materials, feed_out_rules, feed_source_runs, feed_sources, idempotency_records, inbox_entries, library_artifacts, process_items); nothing else about them changes, and every row keeps its rowid;
--   * the receipts of the board's making (idempotency_records, operation initialize_board) get the request hash this build
--     writes: version 7 hashed the board's name into it, and the request has none now, so a retry with a key used before replays;
--   * plugin_project_databases (plugin-runtime), the ledger of the plugins' own tables, with one row each for Coding, Feed,
--     Goals and Schedule: the tables they declare in their Manifests (databases.project, version 1) are already in the
--     library, so the ledger records them as made by their publisher, and the Host opens them as it would after making them.
--     Goals' row names its sixty-one tables and indexes (the Goal tree, the board, input receipts, event work, and the
--     proposals and decisions that governance keeps beside them), which are now the platform's to open and not the baseline's.
--
-- Run it with every Molis Work process of the Home stopped and after a full backup, on each project database file
-- (projects/<id>/molis-work.db of every project in projects/catalog.db, the personal space included, and any project
-- database on disk that the catalog does not list; the preconditions refuse anything that is not a v7 project database):
--   node:sqlite  db.exec(<this file>)    (the same SQLite as the product)    or    sqlite3 -bail <database> < this file
-- The statements stop at the first error. The transaction is then still open and is rolled back when the connection
-- closes, so either the whole script ran or nothing changed. Do not run it in the sqlite3 shell without -bail: the shell
-- goes on after an error, and what is left of the script commits.
--
-- The rebuild follows SQLite's procedure for changing a table (https://www.sqlite.org/lang_altertable.html §7): foreign keys
-- are switched off outside the transaction (dropping a parent table with them on would delete its children's rows), each
-- table is made anew, filled, dropped and renamed, its indexes made again, and the foreign keys are checked before commit.
--
-- The file and tests/project-maintenance-v8.test.ts (its rehearsal) stay until the maintenance has been applied; then both
-- are deleted, and the CHANGELOG points at the Git commit that still has them. Generated once from the version 7 schema
-- (tests/fixtures/project-database-schema.sql at 7ca40f1c3); the rehearsal compares the result with a new version 8 library.
PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

-- Only a project database that is exactly the version 7 one goes on; a named CHECK that fails says which condition it was.
CREATE TEMP TABLE maintenance_precondition (
  foreign_keys_off INTEGER NOT NULL CONSTRAINT "foreign keys are off" CHECK (foreign_keys_off = 1),
  at_version_7 INTEGER NOT NULL CONSTRAINT "user_version is 7" CHECK (at_version_7 = 1),
  exact_tables INTEGER NOT NULL CONSTRAINT "the tables are exactly the version 7 set" CHECK (exact_tables = 1),
  exact_indexes INTEGER NOT NULL CONSTRAINT "the indexes are exactly the version 7 set" CHECK (exact_indexes = 1),
  moved_columns INTEGER NOT NULL CONSTRAINT "the eleven tables have the version 7 columns" CHECK (moved_columns = 1),
  board_columns INTEGER NOT NULL CONSTRAINT "boards has the version 7 columns" CHECK (board_columns = 1),
  nothing_else INTEGER NOT NULL CONSTRAINT "there is no view and no trigger" CHECK (nothing_else = 1)
);
INSERT INTO maintenance_precondition SELECT
  (SELECT foreign_keys = 0 FROM pragma_foreign_keys),
  (SELECT user_version = 7 FROM pragma_user_version),
  (SELECT COUNT(*) = 73 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\_%' ESCAPE '\')
    AND (SELECT COUNT(*) = 73 FROM sqlite_master WHERE type = 'table' AND name IN (
      'acceptance_criteria', 'attention_events', 'boards', 'coding_plan_drafts', 'coding_sessions', 'context_edges',
      'events', 'feed_item_events', 'feed_items', 'feed_materials', 'feed_out_rules', 'feed_runtime_blobs',
      'feed_source_runs', 'feed_sources', 'goal_event_agreements', 'goal_event_applied_decisions',
      'goal_event_closures', 'goal_event_concerns', 'goal_event_config_versions', 'goal_event_configs',
      'goal_event_decision_requests', 'goal_event_progress_summaries', 'goal_event_requirement_bindings',
      'goal_event_requirement_conclusions', 'goal_event_requirements', 'goal_event_state_owners',
      'goal_event_trusted_decisions', 'goal_event_types', 'goal_event_work_status', 'goal_relations',
      'goal_trash_records', 'goal_trash_relation_records', 'goal_tree_proposal_decisions', 'goal_tree_proposal_items',
      'goal_tree_proposals', 'goal_work_event_judgments', 'goal_work_events', 'goals', 'idempotency_records',
      'inbox_entries', 'input_bindings', 'library_artifact_versions', 'library_artifacts', 'listener_deliveries',
      'listener_instances', 'planning_method_packs', 'plugin_event_cursors', 'plugin_event_resolutions',
      'plugin_events', 'plugin_input_groups', 'plugin_port_artifact_bindings', 'plugin_port_bindings',
      'plugin_port_outputs', 'plugin_private_values', 'plugin_runtime_installs', 'plugin_runtime_release_artifacts',
      'policy_bindings', 'process_item_versions', 'process_items', 'project_browsing_settings',
      'project_guidance_entries', 'project_guidance_revisions', 'schedule_conversation_tasks',
      'schedule_conversation_turns', 'schedule_jobs', 'schedule_operation_occurrences', 'schedule_operations',
      'schedule_plugin_reminders', 'schedule_wakeups', 'signal_events', 'signal_revisions', 'signals', 'source_events'
    )),
  (SELECT COUNT(*) = 58 FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL)
    AND (SELECT COUNT(*) = 58 FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL AND name IN (
      'acceptance_goal_idx', 'attention_events_project_entry_idx', 'coding_sessions_project_updated_idx',
      'context_edges_source_idx', 'events_project_idx', 'feed_item_events_project_item_idx',
      'feed_items_project_signal_idx', 'feed_items_project_source_external_idx', 'feed_items_project_updated_idx',
      'feed_materials_project_item_idx', 'feed_out_rules_project_enabled_idx', 'feed_source_runs_project_source_idx',
      'feed_sources_project_updated_idx', 'goal_event_applied_decisions_goal_idx', 'goal_event_closures_goal_idx',
      'goal_event_concerns_goal_idx', 'goal_event_decision_requests_goal_idx',
      'goal_event_progress_summaries_goal_idx', 'goal_event_requirement_conclusions_latest_idx',
      'goal_event_requirements_goal_idx', 'goal_event_state_owners_project_idx',
      'goal_event_trusted_decisions_goal_idx', 'goal_event_types_goal_idx', 'goal_trash_one_open_per_goal',
      'goal_trash_records_goal_idx', 'goal_trash_relation_records_relation_idx',
      'goal_tree_proposal_decisions_item_idx', 'goal_tree_proposal_items_project_idx',
      'goal_tree_proposal_items_proposal_idx', 'goal_tree_proposals_project_idx', 'goal_tree_proposals_supersedes_idx',
      'goal_work_event_judgments_requirement_idx', 'goal_work_events_goal_seq_idx', 'goals_archive_idx',
      'goals_project_idx', 'goals_ready_idx', 'goals_trash_idx', 'inbox_entries_project_status_idx',
      'inbox_entries_project_subject_idx', 'library_artifact_versions_type_idx', 'library_artifacts_project_idx',
      'listener_deliveries_recovery_idx', 'plugin_events_board_sequence', 'plugin_events_board_type_source',
      'policies_scope_idx', 'process_item_versions_type_idx', 'process_items_project_idx',
      'project_guidance_project_idx', 'project_guidance_revisions_project_idx', 'relations_from_idx',
      'relations_to_idx', 'schedule_conversation_tasks_enabled_idx', 'schedule_conversation_turns_task_idx',
      'schedule_jobs_due_idx', 'schedule_plugin_reminders_owner', 'signal_events_project_source_idx',
      'signals_project_source_observed_idx', 'source_events_project_source_idx'
    )),
  (SELECT COUNT(*) = 139 FROM sqlite_master AS master, pragma_table_xinfo(master.name) AS info
     WHERE master.type = 'table' AND master.name IN (
       'coding_sessions', 'events', 'feed_items', 'feed_materials', 'feed_out_rules', 'feed_source_runs',
       'feed_sources', 'idempotency_records', 'inbox_entries', 'library_artifacts', 'process_items'
     ))
    AND (SELECT COUNT(*) = 139 FROM sqlite_master AS master, pragma_table_xinfo(master.name) AS info
     WHERE master.type = 'table' AND master.name || '.' || info.name IN (
       'coding_sessions.project_id', 'coding_sessions.session_id', 'coding_sessions.title', 'coding_sessions.state',
       'coding_sessions.archived', 'coding_sessions.goal_id', 'coding_sessions.runtime_id',
       'coding_sessions.runtime_session_id', 'coding_sessions.created_at', 'coding_sessions.updated_at',
       'coding_sessions.steps_json', 'coding_sessions.background_json', 'events.seq', 'events.event_id',
       'events.project_id', 'events.actor_id', 'events.type', 'events.object_type', 'events.object_id', 'events.reason',
       'events.payload_json', 'events.at', 'feed_items.project_id', 'feed_items.item_id', 'feed_items.source_id',
       'feed_items.signal_id', 'feed_items.signal_revision', 'feed_items.kind', 'feed_items.title',
       'feed_items.summary', 'feed_items.body', 'feed_items.source_kind', 'feed_items.source_label',
       'feed_items.external_id', 'feed_items.url', 'feed_items.origin_status', 'feed_items.priority',
       'feed_items.tags_json', 'feed_items.author', 'feed_items.disposition', 'feed_items.read_at',
       'feed_items.revision', 'feed_items.source_created_at', 'feed_items.source_updated_at', 'feed_items.imported_at',
       'feed_items.updated_at', 'feed_materials.project_id', 'feed_materials.material_id', 'feed_materials.item_id',
       'feed_materials.canonical_url', 'feed_materials.title', 'feed_materials.source_name',
       'feed_materials.published_at', 'feed_materials.preview', 'feed_materials.content_hash',
       'feed_materials.content_ref', 'feed_materials.content_available', 'feed_materials.content_type',
       'feed_materials.character_count', 'feed_materials.captured_at', 'feed_materials.provenance_json',
       'feed_materials.selected_for_context', 'feed_materials.imported_at', 'feed_materials.updated_at',
       'feed_out_rules.project_id', 'feed_out_rules.rule_id', 'feed_out_rules.name', 'feed_out_rules.enabled',
       'feed_out_rules.match_json', 'feed_out_rules.created_at', 'feed_out_rules.updated_at',
       'feed_out_rules.admission', 'feed_out_rules.judgment_json', 'feed_out_rules.revision',
       'feed_source_runs.project_id', 'feed_source_runs.run_id', 'feed_source_runs.operation_id',
       'feed_source_runs.source_id', 'feed_source_runs.phase', 'feed_source_runs.outcome', 'feed_source_runs.empty',
       'feed_source_runs.error_code', 'feed_source_runs.receipt_json', 'feed_source_runs.created_count',
       'feed_source_runs.deduped_count', 'feed_source_runs.recovery_count', 'feed_source_runs.started_at',
       'feed_source_runs.completed_at', 'feed_source_runs.updated_at', 'feed_sources.project_id',
       'feed_sources.source_id', 'feed_sources.kind', 'feed_sources.definition_id', 'feed_sources.sync_kind',
       'feed_sources.name', 'feed_sources.description', 'feed_sources.status', 'feed_sources.enabled',
       'feed_sources.item_count', 'feed_sources.origin', 'feed_sources.config_json', 'feed_sources.schedule_json',
       'feed_sources.credential_ref', 'feed_sources.account_label', 'feed_sources.last_sync_at',
       'feed_sources.last_outcome', 'feed_sources.last_error_code', 'feed_sources.imported_at',
       'feed_sources.updated_at', 'idempotency_records.project_id', 'idempotency_records.actor_id',
       'idempotency_records.operation', 'idempotency_records.idempotency_key', 'idempotency_records.request_hash',
       'idempotency_records.outcome_json', 'idempotency_records.created_at', 'inbox_entries.project_id',
       'inbox_entries.entry_id', 'inbox_entries.subject_type', 'inbox_entries.subject_id', 'inbox_entries.reason',
       'inbox_entries.status', 'inbox_entries.detail_json', 'inbox_entries.revision', 'inbox_entries.created_at',
       'inbox_entries.updated_at', 'inbox_entries.completed_at', 'library_artifacts.artifact_id',
       'library_artifacts.project_id', 'library_artifacts.owner_actor_id', 'library_artifacts.producer_plugin_id',
       'library_artifacts.producer_binding_signature', 'library_artifacts.created_at', 'process_items.artifact_id',
       'process_items.project_id', 'process_items.owner_actor_id', 'process_items.producer_plugin_id',
       'process_items.producer_binding_signature', 'process_items.created_at'
     )),
  (SELECT COUNT(*) = 5 FROM sqlite_master AS master, pragma_table_xinfo(master.name) AS info
     WHERE master.type = 'table' AND master.name = 'boards')
    AND (SELECT COUNT(*) = 5 FROM sqlite_master AS master, pragma_table_xinfo(master.name) AS info
     WHERE master.type = 'table' AND master.name || '.' || info.name IN (
       'boards.project_id', 'boards.title', 'boards.active_goal_id', 'boards.created_at', 'boards.updated_at'
     )),
  (SELECT COUNT(*) = 0 FROM sqlite_master WHERE type IN ('view', 'trigger'));
-- The board is counted in a statement of its own, once the tables are known to be there: SQLite reads a whole statement
-- before running it, so one that names a table the database lacks fails with "no such table" before any check says why.
CREATE TEMP TABLE maintenance_board (
  one_board INTEGER NOT NULL CONSTRAINT "there is exactly one board" CHECK (one_board = 1)
);
INSERT INTO maintenance_board SELECT (SELECT COUNT(*) = 1 FROM boards);
DROP TABLE temp.maintenance_board;

-- What the rebuild has to keep: each table's row count, and the AUTOINCREMENT counter (dropping a table drops its counter).
CREATE TEMP TABLE maintenance_rows (name TEXT PRIMARY KEY, before INTEGER NOT NULL, after INTEGER);
INSERT INTO maintenance_rows (name, before) VALUES
  ('boards', (SELECT COUNT(*) FROM boards)),
  ('coding_sessions', (SELECT COUNT(*) FROM coding_sessions)),
  ('events', (SELECT COUNT(*) FROM events)),
  ('feed_items', (SELECT COUNT(*) FROM feed_items)),
  ('feed_materials', (SELECT COUNT(*) FROM feed_materials)),
  ('feed_out_rules', (SELECT COUNT(*) FROM feed_out_rules)),
  ('feed_source_runs', (SELECT COUNT(*) FROM feed_source_runs)),
  ('feed_sources', (SELECT COUNT(*) FROM feed_sources)),
  ('idempotency_records', (SELECT COUNT(*) FROM idempotency_records)),
  ('inbox_entries', (SELECT COUNT(*) FROM inbox_entries)),
  ('library_artifacts', (SELECT COUNT(*) FROM library_artifacts)),
  ('process_items', (SELECT COUNT(*) FROM process_items));
CREATE TEMP TABLE maintenance_sequence AS SELECT name, seq FROM sqlite_sequence WHERE name IN ('events');

-- The project itself: the one board's id and creation time.
SELECT project_maintenance_before(8);
CREATE TABLE project_root (
      project_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );
INSERT INTO project_root (project_id, created_at) SELECT project_id, created_at FROM boards;

-- boards (Goals): without `title`, and the foreign key points at project_root. The row keeps its rowid. The thirty other Goals
-- tables name boards(project_id) in their own definitions; with foreign keys off they are left as they are and resolve to the new table.
CREATE TABLE maintenance_new_boards (
      project_id TEXT PRIMARY KEY REFERENCES project_root(project_id) ON DELETE CASCADE,
      active_goal_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
INSERT INTO maintenance_new_boards (rowid, project_id, active_goal_id, created_at, updated_at)
  SELECT rowid, project_id, active_goal_id, created_at, updated_at FROM boards;
DROP TABLE boards;
ALTER TABLE maintenance_new_boards RENAME TO boards;

-- coding_sessions: the foreign key points at project_root.
CREATE TABLE maintenance_new_coding_sessions (
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      state TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
      goal_id TEXT,
      runtime_id TEXT NOT NULL,
      runtime_session_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      -- Who holds the unfinished plan steps, as last read: lets a list across projects show what waits on the person.
      steps_json TEXT,
      -- Background commands the session left running, as last read: lets the list across projects show and stop them.
      background_json TEXT,
      PRIMARY KEY (project_id, session_id)
    );
INSERT INTO maintenance_new_coding_sessions (rowid, project_id, session_id, title, state, archived, goal_id, runtime_id, runtime_session_id, created_at, updated_at, steps_json, background_json)
  SELECT rowid, project_id, session_id, title, state, archived, goal_id, runtime_id, runtime_session_id, created_at, updated_at, steps_json, background_json FROM coding_sessions;
DROP TABLE coding_sessions;
ALTER TABLE maintenance_new_coding_sessions RENAME TO coding_sessions;
CREATE INDEX coding_sessions_project_updated_idx
      ON coding_sessions(project_id, updated_at DESC, session_id);

-- events: the foreign key points at project_root.
CREATE TABLE maintenance_new_events (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id TEXT NOT NULL UNIQUE,
          project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
          actor_id TEXT NOT NULL,
          type TEXT NOT NULL,
          object_type TEXT NOT NULL,
          object_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          at TEXT NOT NULL
        );
INSERT INTO maintenance_new_events (seq, event_id, project_id, actor_id, type, object_type, object_id, reason, payload_json, at)
  SELECT seq, event_id, project_id, actor_id, type, object_type, object_id, reason, payload_json, at FROM events;
DROP TABLE events;
ALTER TABLE maintenance_new_events RENAME TO events;
CREATE INDEX events_project_idx ON events(project_id, seq);

-- feed_items: the foreign key points at project_root.
CREATE TABLE maintenance_new_feed_items (
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      source_id TEXT,
      signal_id TEXT,
      signal_revision INTEGER,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      body TEXT,
      source_kind TEXT NOT NULL,
      source_label TEXT NOT NULL,
      external_id TEXT,
      url TEXT,
      origin_status TEXT NOT NULL,
      priority TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      author TEXT,
      disposition TEXT NOT NULL CHECK (disposition IN ('inbox', 'saved', 'promoted', 'processing', 'archived')),
      read_at TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      source_created_at TEXT NOT NULL,
      source_updated_at TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, item_id)
    );
INSERT INTO maintenance_new_feed_items (rowid, project_id, item_id, source_id, signal_id, signal_revision, kind, title, summary, body, source_kind, source_label, external_id, url, origin_status, priority, tags_json, author, disposition, read_at, revision, source_created_at, source_updated_at, imported_at, updated_at)
  SELECT rowid, project_id, item_id, source_id, signal_id, signal_revision, kind, title, summary, body, source_kind, source_label, external_id, url, origin_status, priority, tags_json, author, disposition, read_at, revision, source_created_at, source_updated_at, imported_at, updated_at FROM feed_items;
DROP TABLE feed_items;
ALTER TABLE maintenance_new_feed_items RENAME TO feed_items;
CREATE UNIQUE INDEX feed_items_project_signal_idx
      ON feed_items(project_id, signal_id) WHERE signal_id IS NOT NULL;
CREATE UNIQUE INDEX feed_items_project_source_external_idx
      ON feed_items(project_id, source_id, external_id)
      WHERE source_id IS NOT NULL AND external_id IS NOT NULL;
CREATE INDEX feed_items_project_updated_idx
      ON feed_items(project_id, disposition, source_updated_at DESC);

-- feed_materials: the foreign key points at project_root.
CREATE TABLE maintenance_new_feed_materials (
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
      material_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      canonical_url TEXT,
      title TEXT NOT NULL,
      source_name TEXT NOT NULL,
      published_at TEXT,
      preview TEXT NOT NULL DEFAULT '',
      content_hash TEXT,
      content_ref TEXT,
      content_available INTEGER NOT NULL DEFAULT 0,
      content_type TEXT,
      character_count INTEGER,
      captured_at TEXT,
      provenance_json TEXT NOT NULL DEFAULT '{}',
      selected_for_context INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, material_id),
      FOREIGN KEY (project_id, item_id) REFERENCES feed_items(project_id, item_id) ON DELETE CASCADE
    );
INSERT INTO maintenance_new_feed_materials (rowid, project_id, material_id, item_id, canonical_url, title, source_name, published_at, preview, content_hash, content_ref, content_available, content_type, character_count, captured_at, provenance_json, selected_for_context, imported_at, updated_at)
  SELECT rowid, project_id, material_id, item_id, canonical_url, title, source_name, published_at, preview, content_hash, content_ref, content_available, content_type, character_count, captured_at, provenance_json, selected_for_context, imported_at, updated_at FROM feed_materials;
DROP TABLE feed_materials;
ALTER TABLE maintenance_new_feed_materials RENAME TO feed_materials;
CREATE INDEX feed_materials_project_item_idx
      ON feed_materials(project_id, item_id, updated_at DESC, material_id);

-- feed_out_rules: the foreign key points at project_root.
CREATE TABLE maintenance_new_feed_out_rules (
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
      rule_id TEXT NOT NULL,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      match_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      admission TEXT NOT NULL,
      judgment_json TEXT,
      revision TEXT NOT NULL,
      PRIMARY KEY (project_id, rule_id)
    );
INSERT INTO maintenance_new_feed_out_rules (rowid, project_id, rule_id, name, enabled, match_json, created_at, updated_at, admission, judgment_json, revision)
  SELECT rowid, project_id, rule_id, name, enabled, match_json, created_at, updated_at, admission, judgment_json, revision FROM feed_out_rules;
DROP TABLE feed_out_rules;
ALTER TABLE maintenance_new_feed_out_rules RENAME TO feed_out_rules;
CREATE INDEX feed_out_rules_project_enabled_idx
      ON feed_out_rules(project_id, enabled, created_at, rule_id);

-- feed_source_runs: the foreign key points at project_root.
CREATE TABLE maintenance_new_feed_source_runs (
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
      run_id TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      phase TEXT NOT NULL CHECK (phase IN ('running', 'terminal', 'interrupted')),
      outcome TEXT,
      empty INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      receipt_json TEXT,
      created_count INTEGER NOT NULL DEFAULT 0,
      deduped_count INTEGER NOT NULL DEFAULT 0,
      recovery_count INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, run_id),
      UNIQUE (project_id, operation_id)
    );
INSERT INTO maintenance_new_feed_source_runs (rowid, project_id, run_id, operation_id, source_id, phase, outcome, empty, error_code, receipt_json, created_count, deduped_count, recovery_count, started_at, completed_at, updated_at)
  SELECT rowid, project_id, run_id, operation_id, source_id, phase, outcome, empty, error_code, receipt_json, created_count, deduped_count, recovery_count, started_at, completed_at, updated_at FROM feed_source_runs;
DROP TABLE feed_source_runs;
ALTER TABLE maintenance_new_feed_source_runs RENAME TO feed_source_runs;
CREATE INDEX feed_source_runs_project_source_idx
      ON feed_source_runs(project_id, source_id, started_at DESC);

-- feed_sources: the foreign key points at project_root.
CREATE TABLE maintenance_new_feed_sources (
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
      source_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      definition_id TEXT,
      sync_kind TEXT NOT NULL DEFAULT 'manual' CHECK (sync_kind IN ('public_source', 'github', 'gmail', 'connector', 'manual')),
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      item_count INTEGER NOT NULL DEFAULT 0,
      origin TEXT NOT NULL CHECK (origin = 'molis_work'),
      config_json TEXT NOT NULL DEFAULT '{}',
      schedule_json TEXT NOT NULL DEFAULT '{"mode":"manual"}',
      credential_ref TEXT,
      account_label TEXT,
      last_sync_at TEXT,
      last_outcome TEXT,
      last_error_code TEXT,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, source_id)
);
INSERT INTO maintenance_new_feed_sources (rowid, project_id, source_id, kind, definition_id, sync_kind, name, description, status, enabled, item_count, origin, config_json, schedule_json, credential_ref, account_label, last_sync_at, last_outcome, last_error_code, imported_at, updated_at)
  SELECT rowid, project_id, source_id, kind, definition_id, sync_kind, name, description, status, enabled, item_count, origin, config_json, schedule_json, credential_ref, account_label, last_sync_at, last_outcome, last_error_code, imported_at, updated_at FROM feed_sources;
DROP TABLE feed_sources;
ALTER TABLE maintenance_new_feed_sources RENAME TO feed_sources;
CREATE INDEX feed_sources_project_updated_idx
      ON feed_sources(project_id, updated_at DESC, source_id);

-- idempotency_records: the foreign key points at project_root.
CREATE TABLE maintenance_new_idempotency_records (
          project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
          actor_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          request_hash TEXT NOT NULL,
          outcome_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (project_id, actor_id, operation, idempotency_key)
        );
INSERT INTO maintenance_new_idempotency_records (rowid, project_id, actor_id, operation, idempotency_key, request_hash, outcome_json, created_at)
  SELECT rowid, project_id, actor_id, operation, idempotency_key, request_hash, outcome_json, created_at FROM idempotency_records;
DROP TABLE idempotency_records;
ALTER TABLE maintenance_new_idempotency_records RENAME TO idempotency_records;
-- The board's making is keyed by the project and its request carries nothing else now: its receipts hash the empty request
-- (sha256 of "{}"), as this build writes them. The row count and every other column stay.
UPDATE idempotency_records SET request_hash = '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' WHERE operation = 'initialize_board';

-- inbox_entries: the foreign key points at project_root.
CREATE TABLE maintenance_new_inbox_entries (
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL,
      subject_type TEXT NOT NULL CHECK (subject_type IN ('feed_item', 'goal_decision', 'source_fault')),
      subject_id TEXT NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('manual', 'source_rule', 'goal_decision', 'source_fault', 'artifact_out_failed')),
      status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'done', 'dismissed')),
      detail_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      PRIMARY KEY (project_id, entry_id),
      UNIQUE (project_id, subject_type, subject_id, reason)
);
INSERT INTO maintenance_new_inbox_entries (rowid, project_id, entry_id, subject_type, subject_id, reason, status, detail_json, revision, created_at, updated_at, completed_at)
  SELECT rowid, project_id, entry_id, subject_type, subject_id, reason, status, detail_json, revision, created_at, updated_at, completed_at FROM inbox_entries;
DROP TABLE inbox_entries;
ALTER TABLE maintenance_new_inbox_entries RENAME TO inbox_entries;
CREATE INDEX inbox_entries_project_status_idx
      ON inbox_entries(project_id, status, updated_at DESC, entry_id);
CREATE INDEX inbox_entries_project_subject_idx
      ON inbox_entries(project_id, subject_type, subject_id);

-- library_artifacts: the foreign key points at project_root.
CREATE TABLE maintenance_new_library_artifacts (
    artifact_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
    owner_actor_id TEXT NOT NULL,
    producer_plugin_id TEXT NOT NULL,
    producer_binding_signature TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (artifact_id, project_id)
  );
INSERT INTO maintenance_new_library_artifacts (rowid, artifact_id, project_id, owner_actor_id, producer_plugin_id, producer_binding_signature, created_at)
  SELECT rowid, artifact_id, project_id, owner_actor_id, producer_plugin_id, producer_binding_signature, created_at FROM library_artifacts;
DROP TABLE library_artifacts;
ALTER TABLE maintenance_new_library_artifacts RENAME TO library_artifacts;
CREATE INDEX library_artifacts_project_idx
    ON library_artifacts(project_id, created_at DESC, artifact_id);

-- process_items: the foreign key points at project_root.
CREATE TABLE maintenance_new_process_items (
    artifact_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
    owner_actor_id TEXT NOT NULL,
    producer_plugin_id TEXT NOT NULL,
    producer_binding_signature TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (artifact_id, project_id)
  );
INSERT INTO maintenance_new_process_items (rowid, artifact_id, project_id, owner_actor_id, producer_plugin_id, producer_binding_signature, created_at)
  SELECT rowid, artifact_id, project_id, owner_actor_id, producer_plugin_id, producer_binding_signature, created_at FROM process_items;
DROP TABLE process_items;
ALTER TABLE maintenance_new_process_items RENAME TO process_items;
CREATE INDEX process_items_project_idx
    ON process_items(project_id, created_at DESC, artifact_id);

-- The counter goes back to what it was, not the largest id left.
DELETE FROM sqlite_sequence WHERE name IN ('events');
INSERT INTO sqlite_sequence (name, seq) SELECT name, seq FROM temp.maintenance_sequence;

-- The ledger of the plugins' own tables, and the four plugins whose tables the library already holds, as their Manifests
-- declare them (plugins/native/<plugin>/src/database.ts, version 1): tables_json is the declaration's tables and indexes by
-- name, sorted, as openPluginProjectDatabase records them. Goals' row is the declaration in plugins/native/goals/src/project-database.ts.
CREATE TABLE plugin_project_databases (
      plugin_id TEXT PRIMARY KEY,
      publisher_signature TEXT NOT NULL,
      store_name TEXT NOT NULL UNIQUE,
      version INTEGER NOT NULL CHECK (version >= 1),
      tables_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
INSERT INTO plugin_project_databases (plugin_id, publisher_signature, store_name, version, tables_json, created_at) VALUES
  ('io.molis.work.coding', 'official-coding-binding', 'coding', 1,
   '["coding_plan_drafts","coding_sessions","coding_sessions_project_updated_idx"]',
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('io.molis.work.feed', 'official-feed-binding', 'feed', 1,
   '["feed_out_rules","feed_out_rules_project_enabled_idx"]',
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('io.molis.work.goals', 'official-goals-binding', 'goals', 1,
   '["acceptance_criteria","acceptance_goal_idx","boards","goal_event_agreements","goal_event_applied_decisions","goal_event_applied_decisions_goal_idx","goal_event_closures","goal_event_closures_goal_idx","goal_event_concerns","goal_event_concerns_goal_idx","goal_event_config_versions","goal_event_configs","goal_event_decision_requests","goal_event_decision_requests_goal_idx","goal_event_progress_summaries","goal_event_progress_summaries_goal_idx","goal_event_requirement_bindings","goal_event_requirement_conclusions","goal_event_requirement_conclusions_latest_idx","goal_event_requirements","goal_event_requirements_goal_idx","goal_event_state_owners","goal_event_state_owners_project_idx","goal_event_trusted_decisions","goal_event_trusted_decisions_goal_idx","goal_event_types","goal_event_types_goal_idx","goal_event_work_status","goal_relations","goal_trash_one_open_per_goal","goal_trash_records","goal_trash_records_goal_idx","goal_trash_relation_records","goal_trash_relation_records_relation_idx","goal_tree_proposal_decisions","goal_tree_proposal_decisions_item_idx","goal_tree_proposal_items","goal_tree_proposal_items_project_idx","goal_tree_proposal_items_proposal_idx","goal_tree_proposals","goal_tree_proposals_project_idx","goal_tree_proposals_supersedes_idx","goal_work_event_judgments","goal_work_event_judgments_requirement_idx","goal_work_events","goal_work_events_goal_seq_idx","goals","goals_archive_idx","goals_project_idx","goals_ready_idx","goals_trash_idx","input_bindings","planning_method_packs","policies_scope_idx","policy_bindings","project_guidance_entries","project_guidance_project_idx","project_guidance_revisions","project_guidance_revisions_project_idx","relations_from_idx","relations_to_idx"]',
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('io.molis.work.schedule', 'official-schedule-binding', 'schedule', 1,
   '["schedule_conversation_tasks","schedule_conversation_tasks_enabled_idx","schedule_conversation_turns","schedule_conversation_turns_task_idx","schedule_operation_occurrences","schedule_operations","schedule_plugin_reminders","schedule_plugin_reminders_owner"]',
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Nothing was lost on the way: every foreign key holds, the root is the board, every table has its rows (the board among them), the counter is back.
UPDATE maintenance_rows SET after = CASE name
  WHEN 'boards' THEN (SELECT COUNT(*) FROM boards)
  WHEN 'coding_sessions' THEN (SELECT COUNT(*) FROM coding_sessions)
  WHEN 'events' THEN (SELECT COUNT(*) FROM events)
  WHEN 'feed_items' THEN (SELECT COUNT(*) FROM feed_items)
  WHEN 'feed_materials' THEN (SELECT COUNT(*) FROM feed_materials)
  WHEN 'feed_out_rules' THEN (SELECT COUNT(*) FROM feed_out_rules)
  WHEN 'feed_source_runs' THEN (SELECT COUNT(*) FROM feed_source_runs)
  WHEN 'feed_sources' THEN (SELECT COUNT(*) FROM feed_sources)
  WHEN 'idempotency_records' THEN (SELECT COUNT(*) FROM idempotency_records)
  WHEN 'inbox_entries' THEN (SELECT COUNT(*) FROM inbox_entries)
  WHEN 'library_artifacts' THEN (SELECT COUNT(*) FROM library_artifacts)
  WHEN 'process_items' THEN (SELECT COUNT(*) FROM process_items)
END;
CREATE TEMP TABLE maintenance_postcondition (
  foreign_keys_hold INTEGER NOT NULL CONSTRAINT "every foreign key holds" CHECK (foreign_keys_hold = 1),
  root_is_board INTEGER NOT NULL CONSTRAINT "project_root is exactly the board" CHECK (root_is_board = 1),
  rows_kept INTEGER NOT NULL CONSTRAINT "every rebuilt table has its rows" CHECK (rows_kept = 1),
  sequence_kept INTEGER NOT NULL CONSTRAINT "the AUTOINCREMENT counter is kept" CHECK (sequence_kept = 1),
  ledger_made INTEGER NOT NULL CONSTRAINT "the ledger has the four plugins" CHECK (ledger_made = 1)
);
INSERT INTO maintenance_postcondition SELECT
  (SELECT COUNT(*) = 0 FROM pragma_foreign_key_check),
  (SELECT COUNT(*) = 1 FROM project_root) AND (SELECT COUNT(*) = 1 FROM project_root JOIN boards USING (project_id, created_at)),
  (SELECT COUNT(*) = 0 FROM temp.maintenance_rows WHERE after IS NOT before),
  (SELECT COUNT(*) FROM temp.maintenance_sequence) = (SELECT COUNT(*) FROM sqlite_sequence WHERE name IN ('events'))
    AND NOT EXISTS (SELECT name, seq FROM temp.maintenance_sequence EXCEPT SELECT name, seq FROM sqlite_sequence),
  (SELECT COUNT(*) = 4 FROM plugin_project_databases);
DROP TABLE temp.maintenance_precondition;
DROP TABLE temp.maintenance_rows;
DROP TABLE temp.maintenance_sequence;
DROP TABLE temp.maintenance_postcondition;

-- The version is part of the transaction: it is rolled back with the rest when anything above fails.
PRAGMA user_version = 8;
SELECT project_maintenance_after(8);
COMMIT;
PRAGMA foreign_keys = ON;

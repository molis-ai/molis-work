-- Real-Home maintenance six, project databases (specs/repository-anti-corruption/spec.md §4.1): every
-- projects/<id>/molis-work.db from version 6 to version 7. Version 7 is version 6 without Casebook's five tables
-- (casebook_interaction_scopes, casebook_interaction_facts, casebook_goal_contexts, casebook_interaction_audit_keys,
-- casebook_interaction_actions): Casebook was deleted on 2026-10-10 (user decision, spec §1) and nothing reads them.
-- Nothing else about a project database changed. What the tables held (interaction facts, an audit secret per project)
-- is dropped with them; the full backup taken before the run keeps it.
--
-- Run it with every Molis Work process of the Home stopped and after a full backup, on each project database file
-- (projects/<id>/molis-work.db of every project in projects/catalog.db, the personal space included) and on no other file:
--   node:sqlite  db.exec(<this file>)    (the same SQLite as the product)    or    sqlite3 -bail <database> < this file
-- The statements stop at the first error. The transaction is then still open and is rolled back when the connection
-- closes, so either the whole script ran or nothing changed. Do not run it in the sqlite3 shell without -bail: the shell
-- goes on after an error, and what is left of the script commits.
--
-- The file and tests/project-maintenance-v7.test.ts (its rehearsal) stay until the maintenance has been applied to the
-- real Home; then both are deleted, and the CHANGELOG points at the Git commit that still has them.
BEGIN IMMEDIATE;

-- Only a project database that is exactly the version 6 one goes on; a named CHECK that fails says which condition it was.
CREATE TEMP TABLE maintenance_precondition (
  at_version_6 INTEGER NOT NULL CONSTRAINT "user_version is 6" CHECK (at_version_6 = 1),
  exact_tables INTEGER NOT NULL CONSTRAINT "the tables are exactly the version 6 set" CHECK (exact_tables = 1),
  casebook_columns INTEGER NOT NULL CONSTRAINT "the Casebook tables have the version 6 columns" CHECK (casebook_columns = 1),
  nothing_else INTEGER NOT NULL CONSTRAINT "there is no view and no trigger" CHECK (nothing_else = 1)
);
INSERT INTO maintenance_precondition SELECT
  (SELECT user_version = 6 FROM pragma_user_version),
  (SELECT COUNT(*) = 78 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\_%' ESCAPE '\')
    AND (SELECT COUNT(*) = 78 FROM sqlite_master WHERE type = 'table' AND name IN (
      'acceptance_criteria', 'attention_events', 'boards', 'casebook_goal_contexts', 'casebook_interaction_actions',
      'casebook_interaction_audit_keys', 'casebook_interaction_facts', 'casebook_interaction_scopes',
      'coding_plan_drafts', 'coding_sessions', 'context_edges', 'events', 'feed_item_events', 'feed_items',
      'feed_materials', 'feed_out_rules', 'feed_runtime_blobs', 'feed_source_runs', 'feed_sources',
      'goal_event_agreements', 'goal_event_applied_decisions', 'goal_event_closures', 'goal_event_concerns',
      'goal_event_config_versions', 'goal_event_configs', 'goal_event_decision_requests',
      'goal_event_progress_summaries', 'goal_event_requirement_bindings', 'goal_event_requirement_conclusions',
      'goal_event_requirements', 'goal_event_state_owners', 'goal_event_trusted_decisions', 'goal_event_types',
      'goal_event_work_status', 'goal_relations', 'goal_trash_records', 'goal_trash_relation_records',
      'goal_tree_proposal_decisions', 'goal_tree_proposal_items', 'goal_tree_proposals', 'goal_work_event_judgments',
      'goal_work_events', 'goals', 'idempotency_records', 'inbox_entries', 'input_bindings',
      'library_artifact_versions', 'library_artifacts', 'listener_deliveries', 'listener_instances',
      'planning_method_packs', 'plugin_event_cursors', 'plugin_event_resolutions', 'plugin_events',
      'plugin_input_groups', 'plugin_port_artifact_bindings', 'plugin_port_bindings', 'plugin_port_outputs',
      'plugin_private_values', 'plugin_runtime_installs', 'plugin_runtime_release_artifacts', 'policy_bindings',
      'process_item_versions', 'process_items', 'project_browsing_settings', 'project_guidance_entries',
      'project_guidance_revisions', 'schedule_conversation_tasks', 'schedule_conversation_turns', 'schedule_jobs',
      'schedule_operation_occurrences', 'schedule_operations', 'schedule_plugin_reminders', 'schedule_wakeups',
      'signal_events', 'signal_revisions', 'signals', 'source_events'
    )),
  (SELECT COUNT(*) = 23 FROM sqlite_master AS master, pragma_table_info(master.name) AS info
     WHERE master.type = 'table' AND master.name LIKE 'casebook\_%' ESCAPE '\')
    AND (SELECT COUNT(*) = 23 FROM sqlite_master AS master, pragma_table_info(master.name) AS info
     WHERE master.type = 'table' AND master.name || '.' || info.name IN (
      'casebook_interaction_scopes.board', 'casebook_interaction_scopes.epoch', 'casebook_interaction_scopes.state',
      'casebook_interaction_scopes.secret', 'casebook_interaction_scopes.since',
      'casebook_interaction_scopes.pauses', 'casebook_interaction_facts.board', 'casebook_interaction_facts.epoch',
      'casebook_interaction_facts.seq', 'casebook_interaction_facts.id', 'casebook_interaction_facts.body',
      'casebook_goal_contexts.board', 'casebook_goal_contexts.interaction_epoch',
      'casebook_goal_contexts.context_epoch', 'casebook_goal_contexts.operation_id', 'casebook_goal_contexts.phase',
      'casebook_goal_contexts.body', 'casebook_interaction_audit_keys.board',
      'casebook_interaction_audit_keys.secret', 'casebook_interaction_actions.board',
      'casebook_interaction_actions.key', 'casebook_interaction_actions.digest', 'casebook_interaction_actions.body'
    )),
  (SELECT COUNT(*) = 0 FROM sqlite_master WHERE type IN ('view', 'trigger'));

-- No IF EXISTS: a database that lacks one of these tables is not the database this script is for. A table's own indexes
-- (its primary key and UNIQUE constraints) go with it; there is no other index on them, no foreign key to or from them.
DROP TABLE casebook_interaction_scopes;
DROP TABLE casebook_interaction_facts;
DROP TABLE casebook_goal_contexts;
DROP TABLE casebook_interaction_audit_keys;
DROP TABLE casebook_interaction_actions;

-- The version is part of the transaction: it is rolled back with the rest when anything above fails.
PRAGMA user_version = 7;
COMMIT;

-- Project library v9 -> v10: ac-trust T1 and S9-0b (#1245) together, one version. Offline rehearsal only. Stop the Home and
-- back it up before applying to a real project.
-- Run with an API that stops at the first error (or sqlite3 -bail). On failure close/ROLLBACK;
-- never continue executing the remaining statements. No runtime reader invokes this file.
-- Every installation record gets the Host's evidence for it (`publisher_trust`): a record of code run in the Host process is
-- `host`, a record of generated (sandboxed) code is `unsigned`. A record of neither is refused (the NOT NULL fails), not guessed.
BEGIN IMMEDIATE;
CREATE TEMP TABLE maintenance_v10_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO maintenance_v10_guard SELECT user_version = 9 FROM pragma_user_version;
-- The two Attention tables are copied column by column: a library whose tables have any column the v9 baseline does not is refused,
-- so nothing is dropped without a word.
INSERT INTO maintenance_v10_guard SELECT count(*) = 11 FROM pragma_table_info('inbox_entries');
INSERT INTO maintenance_v10_guard SELECT count(*) = 7 FROM pragma_table_info('attention_events');
SELECT project_maintenance_before(10);
CREATE TABLE plugin_runtime_installs_v10 (install_id TEXT PRIMARY KEY, record_json TEXT NOT NULL,
      publisher_trust TEXT NOT NULL CHECK (publisher_trust IN ('host', 'pinned', 'unsigned')));
INSERT INTO plugin_runtime_installs_v10 (install_id, record_json, publisher_trust)
  SELECT install_id,
    json_set(record_json, '$.publisher_trust', CASE json_extract(record_json, '$.execution') WHEN 'host' THEN 'host' WHEN 'sandbox' THEN 'unsigned' END),
    CASE json_extract(record_json, '$.execution') WHEN 'host' THEN 'host' WHEN 'sandbox' THEN 'unsigned' END
  FROM plugin_runtime_installs;
DROP TABLE plugin_runtime_installs;
ALTER TABLE plugin_runtime_installs_v10 RENAME TO plugin_runtime_installs;
-- S9-0b (#1245): Inbox entries and Attention events gain an explicit owner (`owner_plugin_id`); the (project, subject, reason)
-- uniqueness splits into one partial index for owned rows and one for unassigned rows. Every existing row keeps a null owner: an old
-- row's owner is never guessed from its ids or its kind. Rowids and values are kept; the column order is the current schema's.
CREATE TABLE inbox_entries_v10 (
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL,
      owner_plugin_id TEXT,
      subject_type TEXT NOT NULL CHECK (subject_type IN ('feed_item', 'goal_decision', 'source_fault')),
      subject_id TEXT NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('manual', 'source_rule', 'goal_decision', 'source_fault', 'artifact_out_failed')),
      status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'done', 'dismissed')),
      detail_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      PRIMARY KEY (project_id, entry_id)
);
INSERT INTO inbox_entries_v10 (rowid, project_id, entry_id, owner_plugin_id, subject_type, subject_id, reason, status, detail_json, revision,
    created_at, updated_at, completed_at)
  SELECT rowid, project_id, entry_id, NULL, subject_type, subject_id, reason, status, detail_json, revision, created_at, updated_at, completed_at
  FROM inbox_entries;
DROP TABLE inbox_entries;
ALTER TABLE inbox_entries_v10 RENAME TO inbox_entries;
CREATE UNIQUE INDEX inbox_entries_owned_subject_idx
      ON inbox_entries(project_id, owner_plugin_id, subject_type, subject_id, reason) WHERE owner_plugin_id IS NOT NULL;
CREATE UNIQUE INDEX inbox_entries_unassigned_subject_idx
      ON inbox_entries(project_id, subject_type, subject_id, reason) WHERE owner_plugin_id IS NULL;
CREATE INDEX inbox_entries_project_status_idx
      ON inbox_entries(project_id, status, updated_at DESC, entry_id);
CREATE INDEX inbox_entries_project_subject_idx
      ON inbox_entries(project_id, subject_type, subject_id);
CREATE TABLE attention_events_v10 (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      owner_plugin_id TEXT,
      type TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      at TEXT NOT NULL
    );
INSERT INTO attention_events_v10 (rowid, event_id, project_id, entry_id, owner_plugin_id, type, subject_type, subject_id, at)
  SELECT rowid, event_id, project_id, entry_id, NULL, type, subject_type, subject_id, at FROM attention_events;
DROP TABLE attention_events;
ALTER TABLE attention_events_v10 RENAME TO attention_events;
CREATE INDEX attention_events_project_entry_idx
      ON attention_events(project_id, entry_id, at, event_id);
PRAGMA user_version = 10;
DROP TABLE maintenance_v10_guard;
SELECT project_maintenance_after(10);
COMMIT;

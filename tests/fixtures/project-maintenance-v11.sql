-- Project library v10 -> v11: Feed declares the Feed items, Sources, Signals and Listener Host tables (FI-5). Offline rehearsal only. Stop
-- the Home and back it up before applying to a real project.
-- Run with an API that stops at the first error (or sqlite3 -bail). On failure close/ROLLBACK;
-- never continue executing the remaining statements. No runtime reader invokes this file.
-- The eleven tables and their eleven indexes were the baseline's and are Feed's declaration's now, statement for statement the same,
-- so no table and no row moves. What changes is two records: the library's version, and the ledger row that says what Feed's
-- declaration made (version 1 named `feed_out_rules` and its index; version 2 names all twelve tables and their indexes). A library whose
-- Feed row is not exactly the version 1 one, or whose eleven tables are not all there, is refused: nothing is guessed.
BEGIN IMMEDIATE;
CREATE TEMP TABLE maintenance_v11_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO maintenance_v11_guard SELECT user_version = 10 FROM pragma_user_version;
INSERT INTO maintenance_v11_guard SELECT count(*) = 11 FROM sqlite_master WHERE type = 'table' AND name IN (
  'feed_items', 'feed_materials', 'feed_item_events', 'feed_sources', 'source_events', 'signals', 'signal_revisions', 'signal_events',
  'listener_instances', 'listener_deliveries', 'feed_source_runs');
INSERT INTO maintenance_v11_guard SELECT count(*) = 11 FROM sqlite_master WHERE type = 'index' AND name IN (
  'feed_items_project_updated_idx', 'feed_items_project_signal_idx', 'feed_items_project_source_external_idx', 'feed_materials_project_item_idx',
  'feed_item_events_project_item_idx', 'feed_sources_project_updated_idx', 'source_events_project_source_idx', 'signals_project_source_observed_idx',
  'signal_events_project_source_idx', 'listener_deliveries_recovery_idx', 'feed_source_runs_project_source_idx');
INSERT INTO maintenance_v11_guard SELECT count(*) = 1 FROM plugin_project_databases
  WHERE plugin_id = 'io.molis.work.feed' AND store_name = 'feed' AND version = 1
    AND tables_json = '["feed_out_rules","feed_out_rules_project_enabled_idx"]';
UPDATE plugin_project_databases SET version = 2, tables_json = '["feed_item_events","feed_item_events_project_item_idx","feed_items","feed_items_project_signal_idx","feed_items_project_source_external_idx","feed_items_project_updated_idx","feed_materials","feed_materials_project_item_idx","feed_out_rules","feed_out_rules_project_enabled_idx","feed_source_runs","feed_source_runs_project_source_idx","feed_sources","feed_sources_project_updated_idx","listener_deliveries","listener_deliveries_recovery_idx","listener_instances","signal_events","signal_events_project_source_idx","signal_revisions","signals","signals_project_source_observed_idx","source_events","source_events_project_source_idx"]'
  WHERE plugin_id = 'io.molis.work.feed' AND version = 1;
PRAGMA user_version = 11;
DROP TABLE maintenance_v11_guard;
COMMIT;

PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE due_done (
  install_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  partition_id TEXT NOT NULL,
  entry_key TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('plugin', 'overview')),
  due_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('woken', 'expired')),
  done_at TEXT NOT NULL,
  PRIMARY KEY (install_id, partition_id, source, entry_key, due_at)
);
CREATE TABLE due_entries (
  install_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  partition_id TEXT NOT NULL,
  entry_key TEXT NOT NULL CHECK (length(entry_key) BETWEEN 1 AND 200),
  due_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('plugin', 'overview')),
  registered_at TEXT NOT NULL,
  PRIMARY KEY (install_id, partition_id, source, entry_key)
);
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
INSERT INTO "due_entries"("install_id","plugin_id","partition_id","entry_key","due_at","source","registered_at") VALUES('plugin-install-6ed43d717d2e579c2d6345b4e217c614','io.molis.work.todo','project-791103fd-73f1-4091-acb6-1281d19bd75b','task:fbbce201-b8fe-403c-9ec9-5dbff7375f5b','2030-01-15T01:00:00.000Z','overview','2026-01-15T09:00:00.000Z');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
CREATE INDEX due_done_at ON due_done (done_at);
CREATE INDEX due_entries_due ON due_entries (due_at);
CREATE INDEX due_entries_partition ON due_entries (partition_id);
PRAGMA user_version=1;
COMMIT;

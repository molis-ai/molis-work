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
INSERT INTO "due_entries"("install_id","plugin_id","partition_id","entry_key","due_at","source","registered_at") VALUES('plugin-install-6ed43d717d2e579c2d6345b4e217c614','io.molis.work.todo','project-8e2c4ac4-3923-4645-bf73-4af27ac9a317','task:03025869-08ba-4cd2-abe9-f152871c0d26','2030-01-15T01:00:00.000Z','overview','2026-01-15T09:00:00.000Z');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
CREATE INDEX due_done_at ON due_done (done_at);
CREATE INDEX due_entries_due ON due_entries (due_at);
CREATE INDEX due_entries_partition ON due_entries (partition_id);
PRAGMA user_version=1;
COMMIT;

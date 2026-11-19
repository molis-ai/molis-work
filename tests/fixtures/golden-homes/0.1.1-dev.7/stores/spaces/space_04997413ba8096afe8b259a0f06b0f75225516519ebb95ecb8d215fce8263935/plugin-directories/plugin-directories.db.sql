PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE plugin_directory_grants (
    grant_id TEXT PRIMARY KEY, plugin_id TEXT NOT NULL, plugin_name TEXT NOT NULL, install_id TEXT NOT NULL, project_id TEXT NOT NULL,
    actor_id TEXT NOT NULL, root TEXT NOT NULL, device TEXT NOT NULL, inode TEXT NOT NULL, granted_at TEXT NOT NULL,
    last_read_at TEXT, read_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE plugin_directory_reads (
    read_id INTEGER PRIMARY KEY AUTOINCREMENT, grant_id TEXT NOT NULL, origin TEXT NOT NULL, caller TEXT NOT NULL, outcome TEXT NOT NULL, at TEXT NOT NULL);
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
DELETE FROM sqlite_sequence;
CREATE INDEX plugin_directory_reads_grant ON plugin_directory_reads (grant_id, read_id);
PRAGMA user_version=1;
COMMIT;

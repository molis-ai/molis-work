PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE plugin_original_files (
    plugin_id TEXT NOT NULL, install_id TEXT NOT NULL, project_id TEXT NOT NULL, record_key TEXT NOT NULL,
    real_path TEXT NOT NULL, registered_at TEXT NOT NULL,
    PRIMARY KEY (plugin_id, install_id, project_id, record_key));
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
PRAGMA user_version=1;
COMMIT;

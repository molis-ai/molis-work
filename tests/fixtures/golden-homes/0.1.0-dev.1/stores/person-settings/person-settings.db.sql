PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE person_settings (
  install_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('preference', 'secret_ref', 'connection_ref', 'local_path')),
  portable INTEGER NOT NULL CHECK (portable IN (0, 1) AND (portable = 0 OR kind = 'preference')),
  value_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (install_id, key)
);
CREATE TABLE person_settings_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE person_settings_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE person_settings_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE person_settings_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE person_settings_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE person_settings_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
INSERT INTO "person_settings"("install_id","plugin_id","key","kind","portable","value_json","revision","updated_at") VALUES('plugin-install-d8d09cfa256de9600debfd1c3f155a32','io.molis.work.images','connections','preference',1,'{"services":[{"id":"26750ea5-669a-43c0-9090-db4277b75005","name":"金样图片连接 seed 已改","api_format":"openai-images","base_url":"http://127.0.0.1:9/v1","model":"golden-model","created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-11-27T11:46:18.147Z"}]}',2,'2026-11-27T11:46:18.152Z');
INSERT INTO "person_settings_replica_changes"("seq","key") VALUES(1,'io.molis.work.images/connections');
INSERT INTO "person_settings_replica_state"("id","device","cursor","applying") VALUES(1,'7a999f8b7b34fb6b27480fdfb9a337db',0,0);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('person_settings_replica_changes',1);
CREATE INDEX person_settings_replica_changes_key ON person_settings_replica_changes(key);
CREATE TRIGGER person_settings_delete AFTER DELETE ON person_settings BEGIN INSERT INTO person_settings_replica_changes(key) SELECT OLD.plugin_id || '/' || OLD.key WHERE (SELECT applying FROM person_settings_replica_state WHERE id=1)=0 AND (OLD.portable = 1); END;
CREATE TRIGGER person_settings_insert AFTER INSERT ON person_settings BEGIN INSERT INTO person_settings_replica_changes(key) SELECT NEW.plugin_id || '/' || NEW.key WHERE (SELECT applying FROM person_settings_replica_state WHERE id=1)=0 AND (NEW.portable = 1); END;
CREATE TRIGGER person_settings_update AFTER UPDATE ON person_settings BEGIN INSERT INTO person_settings_replica_changes(key) SELECT NEW.plugin_id || '/' || NEW.key WHERE (SELECT applying FROM person_settings_replica_state WHERE id=1)=0 AND (NEW.portable = 1); END;
PRAGMA user_version=1;
COMMIT;

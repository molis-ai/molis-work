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
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
INSERT INTO "person_settings"("install_id","plugin_id","key","kind","portable","value_json","revision","updated_at") VALUES('plugin-install-d8d09cfa256de9600debfd1c3f155a32','io.molis.work.images','connections','connection_ref',0,'{"services":[{"id":"685a9880-9554-4422-8b4a-560442cf9745","name":"金样图片连接 seed 已改","api_format":"openai-images","base_url":"http://127.0.0.1:9/v1","model":"golden-model","created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z"}]}',1,'2026-01-15T09:00:00.000Z');
INSERT INTO "person_settings_replica_state"("id","device","cursor","applying") VALUES(1,'b1781e6994433c078c1982b03c8c1293',0,0);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('person_settings_replica_changes',0);
CREATE INDEX person_settings_replica_changes_key ON person_settings_replica_changes(key);
CREATE TRIGGER person_settings_delete AFTER DELETE ON person_settings BEGIN INSERT INTO person_settings_replica_changes(key) SELECT OLD.plugin_id || '/' || OLD.key WHERE (SELECT applying FROM person_settings_replica_state WHERE id=1)=0 AND (OLD.portable = 1); END;
CREATE TRIGGER person_settings_insert AFTER INSERT ON person_settings BEGIN INSERT INTO person_settings_replica_changes(key) SELECT NEW.plugin_id || '/' || NEW.key WHERE (SELECT applying FROM person_settings_replica_state WHERE id=1)=0 AND (NEW.portable = 1); END;
CREATE TRIGGER person_settings_update AFTER UPDATE ON person_settings BEGIN INSERT INTO person_settings_replica_changes(key) SELECT NEW.plugin_id || '/' || NEW.key WHERE (SELECT applying FROM person_settings_replica_state WHERE id=1)=0 AND (NEW.portable = 1); END;
PRAGMA user_version=1;
COMMIT;

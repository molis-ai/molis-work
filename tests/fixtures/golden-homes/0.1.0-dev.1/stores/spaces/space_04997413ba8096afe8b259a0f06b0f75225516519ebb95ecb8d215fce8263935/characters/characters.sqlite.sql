PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE character_drafts (
  character_id TEXT PRIMARY KEY,
  owner_actor_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  record TEXT NOT NULL
);
CREATE TABLE character_runs (
  run_id TEXT PRIMARY KEY,
  panel_id TEXT NOT NULL UNIQUE,
  owner_actor_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  artifact_version INTEGER NOT NULL,
  title TEXT NOT NULL,
  task TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  workspace_path TEXT NOT NULL,
  runtime_id TEXT NOT NULL,
  bundle_path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('starting', 'dispatched', 'failed')),
  status_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE characters_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE characters_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE characters_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE characters_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE characters_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE characters_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
INSERT INTO "character_drafts"("character_id","owner_actor_id","revision","updated_at","record") VALUES('04048b8d-02c1-4478-b24c-3b42c4036ec2','web-user',2,'2026-01-15T09:00:00.000Z','{"character_id":"04048b8d-02c1-4478-b24c-3b42c4036ec2","owner_actor_id":"web-user","revision":2,"state":"active","title":"金样角色 seed","instructions":"合成的角色指令","host_tools":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","action_tools":[]}');
INSERT INTO "characters_replica_changes"("seq","key") VALUES(1,'["web-user","character","04048b8d-02c1-4478-b24c-3b42c4036ec2"]');
INSERT INTO "characters_replica_changes"("seq","key") VALUES(2,'["web-user","character","04048b8d-02c1-4478-b24c-3b42c4036ec2"]');
INSERT INTO "characters_replica_state"("id","device","cursor","applying") VALUES(1,'8dd122e5666377c8768595cdd2dacc6c',0,0);
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('characters_replica_changes',2);
CREATE INDEX character_runs_by_character ON character_runs (owner_actor_id, project_id, character_id, created_at);
CREATE INDEX characters_replica_changes_key ON characters_replica_changes(key);
CREATE TRIGGER characters_sync_delete AFTER DELETE ON character_drafts BEGIN INSERT INTO characters_replica_changes(key) SELECT json_array(OLD.owner_actor_id,'character',OLD.character_id) WHERE (SELECT applying FROM characters_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER characters_sync_insert AFTER INSERT ON character_drafts BEGIN INSERT INTO characters_replica_changes(key) SELECT json_array(NEW.owner_actor_id,'character',NEW.character_id) WHERE (SELECT applying FROM characters_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER characters_sync_update AFTER UPDATE ON character_drafts BEGIN INSERT INTO characters_replica_changes(key) SELECT json_array(NEW.owner_actor_id,'character',NEW.character_id) WHERE (SELECT applying FROM characters_replica_state WHERE id=1)=0 AND (1=1); END;
PRAGMA user_version=1;
COMMIT;

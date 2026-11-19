PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE character_adoptions (
  owner_actor_id TEXT NOT NULL, scope TEXT NOT NULL, request_id TEXT NOT NULL, request_digest TEXT NOT NULL, receipt TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (owner_actor_id, scope, request_id)
);
CREATE TABLE character_defaults (
  owner_actor_id TEXT NOT NULL, project_id TEXT NOT NULL, selection TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_actor_id, project_id)
);
CREATE TABLE character_drafts (
  character_id TEXT PRIMARY KEY,
  owner_actor_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  record TEXT NOT NULL
);
CREATE TABLE character_member_versions (
  member_id TEXT NOT NULL, member_version INTEGER NOT NULL, original_version INTEGER NOT NULL, saved_at TEXT NOT NULL, sections TEXT NOT NULL,
  PRIMARY KEY (member_id, member_version)
);
CREATE TABLE character_members (
  member_id TEXT PRIMARY KEY, owner_actor_id TEXT NOT NULL, project_id TEXT NOT NULL, character_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'disabled', 'removed')), revision TEXT NOT NULL, member_version INTEGER NOT NULL,
  sections TEXT NOT NULL, origin TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE character_origins (
  character_id TEXT PRIMARY KEY, owner_actor_id TEXT NOT NULL, origin TEXT NOT NULL
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
CREATE TABLE character_versions (
  character_id TEXT NOT NULL, owner_actor_id TEXT NOT NULL, version INTEGER NOT NULL,
  draft_revision INTEGER NOT NULL, saved_at TEXT NOT NULL, content TEXT NOT NULL,
  PRIMARY KEY (character_id, version)
);
CREATE TABLE characters_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE characters_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE characters_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE characters_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE characters_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE characters_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
INSERT INTO "character_drafts"("character_id","owner_actor_id","revision","updated_at","record") VALUES('2c0cde0e-5719-479f-95b6-98941b82aaa7','web-user',2,'2026-01-15T09:00:00.000Z','{"character_id":"2c0cde0e-5719-479f-95b6-98941b82aaa7","owner_actor_id":"web-user","revision":2,"state":"active","title":"金样角色 seed","instructions":"合成的角色指令，第二版","host_tools":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z"}');
INSERT INTO "character_versions"("character_id","owner_actor_id","version","draft_revision","saved_at","content") VALUES('2c0cde0e-5719-479f-95b6-98941b82aaa7','web-user',1,1,'2026-01-15T09:00:00.000Z','{"title":"金样角色 seed","instructions":"合成的角色指令","host_tools":null}');
INSERT INTO "character_versions"("character_id","owner_actor_id","version","draft_revision","saved_at","content") VALUES('2c0cde0e-5719-479f-95b6-98941b82aaa7','web-user',2,2,'2026-01-15T09:00:00.000Z','{"title":"金样角色 seed","instructions":"合成的角色指令，第二版","host_tools":null}');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('characters_replica_changes',0);
CREATE UNIQUE INDEX character_members_live ON character_members (owner_actor_id, project_id, character_id) WHERE state != 'removed';
CREATE INDEX character_runs_by_character ON character_runs (owner_actor_id, project_id, character_id, created_at);
CREATE INDEX characters_replica_changes_key ON characters_replica_changes(key);
CREATE TRIGGER characters_sync_delete AFTER DELETE ON character_drafts BEGIN INSERT INTO characters_replica_changes(key) SELECT json_array(OLD.owner_actor_id,'character',OLD.character_id) WHERE (SELECT applying FROM characters_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER characters_sync_insert AFTER INSERT ON character_drafts BEGIN INSERT INTO characters_replica_changes(key) SELECT json_array(NEW.owner_actor_id,'character',NEW.character_id) WHERE (SELECT applying FROM characters_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER characters_sync_update AFTER UPDATE ON character_drafts BEGIN INSERT INTO characters_replica_changes(key) SELECT json_array(NEW.owner_actor_id,'character',NEW.character_id) WHERE (SELECT applying FROM characters_replica_state WHERE id=1)=0 AND (1=1); END;
PRAGMA user_version=2;
COMMIT;

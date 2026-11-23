PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE im_members (
      room_id TEXT NOT NULL REFERENCES im_rooms(id), member_id TEXT NOT NULL REFERENCES mw_members(id),
      joined_at TEXT NOT NULL, PRIMARY KEY(room_id, member_id)
    );
CREATE TABLE im_messages (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
      room_id TEXT NOT NULL REFERENCES im_rooms(id), thread_id TEXT REFERENCES im_threads(id),
      author_id TEXT NOT NULL REFERENCES mw_members(id), body TEXT NOT NULL,
      shared_message_id TEXT REFERENCES im_messages(id), created_at TEXT NOT NULL,
      quote_id TEXT REFERENCES im_messages(id), subjects_json TEXT NOT NULL DEFAULT '[]'
    );
CREATE TABLE im_read_positions (
      member_id TEXT NOT NULL REFERENCES mw_members(id), room_id TEXT NOT NULL REFERENCES im_rooms(id),
      target TEXT NOT NULL, sequence INTEGER NOT NULL, PRIMARY KEY(member_id,room_id,target)
    );
CREATE TABLE im_receipts (
      session_id TEXT NOT NULL REFERENCES mw_sessions(id), client_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL, result_json TEXT NOT NULL,
      PRIMARY KEY(session_id, client_id)
    );
CREATE TABLE im_rooms (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES mw_members(id),
      invite_token_hash TEXT UNIQUE CHECK (invite_token_hash IS NULL OR
        (length(invite_token_hash) = 64 AND invite_token_hash NOT GLOB '*[^0-9a-f]*')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      project_id TEXT REFERENCES mw_projects(id)
    );
CREATE TABLE im_thread_context (
      thread_id TEXT NOT NULL REFERENCES im_threads(id), message_id TEXT NOT NULL REFERENCES im_messages(id),
      position INTEGER NOT NULL, PRIMARY KEY(thread_id, message_id)
    );
CREATE TABLE im_threads (
      id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES im_rooms(id), title TEXT NOT NULL,
      source_message_id TEXT REFERENCES im_messages(id),
      created_by TEXT NOT NULL REFERENCES mw_members(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
CREATE TABLE mw_access(project_id TEXT NOT NULL REFERENCES mw_projects(id), member_id TEXT NOT NULL REFERENCES mw_members(id),
      role TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')), PRIMARY KEY(project_id,member_id));
CREATE TABLE mw_codes(hash TEXT PRIMARY KEY, kind TEXT NOT NULL, member_id TEXT NOT NULL REFERENCES mw_members(id),
      project_id TEXT REFERENCES mw_projects(id), role TEXT, creator_session TEXT REFERENCES mw_sessions(id), expires_at INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE mw_commands(project_id TEXT NOT NULL REFERENCES mw_projects(id), member_id TEXT NOT NULL REFERENCES mw_members(id),
      command_id TEXT NOT NULL, request_json TEXT NOT NULL, result_json TEXT, state TEXT NOT NULL, error_code TEXT,
      PRIMARY KEY(project_id,member_id,command_id));
CREATE TABLE mw_events(cursor INTEGER PRIMARY KEY AUTOINCREMENT, scope_kind TEXT NOT NULL,
      scope_id TEXT NOT NULL, kind TEXT NOT NULL, entity_id TEXT NOT NULL, thread_id TEXT);
CREATE TABLE mw_members(id TEXT PRIMARY KEY, display_name TEXT NOT NULL);
CREATE TABLE mw_projects(id TEXT PRIMARY KEY, title TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES mw_members(id), scope_json TEXT NOT NULL);
CREATE TABLE mw_server_identity(singleton INTEGER PRIMARY KEY CHECK(singleton=1), cookie_suffix TEXT NOT NULL);
CREATE TABLE mw_sessions(id TEXT PRIMARY KEY, member_id TEXT REFERENCES mw_members(id),
      token_hash TEXT UNIQUE NOT NULL, label TEXT NOT NULL, expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
INSERT INTO "im_messages"("sequence","id","room_id","thread_id","author_id","body","shared_message_id","created_at","quote_id","subjects_json") VALUES(1,'59fd6793-c4a7-4be6-a760-bdf14762f016','2ff44527-7fdf-4926-9e0a-71814ba69d11',NULL,'f5d6f0ea-e655-49d4-9173-50089cc377ed','金样讨论 seed',NULL,'2026-01-15T09:00:00.000Z',NULL,'[{"kind":"goal","id":"goal-cc837d6a-dc57-4e31-a1dc-c0b15f4fc033"}]');
INSERT INTO "im_receipts"("session_id","client_id","fingerprint","result_json") VALUES('c47d38a1-eec4-49f8-bf55-e3d65b1fcd25','aa30d226-e1be-4b3b-94b5-92fb057d51e0','4e3a9fb26ed12e22c43f391a972ec099265a01afea15a7a1cb75d2b01a86a639','{"member":{"id":"f5d6f0ea-e655-49d4-9173-50089cc377ed","display_name":"金样成员 seed"}}');
INSERT INTO "im_receipts"("session_id","client_id","fingerprint","result_json") VALUES('c47d38a1-eec4-49f8-bf55-e3d65b1fcd25','d27772ed-d19c-4061-8333-5ce1e0ae14d2','7f247748f89e5f5a7c5a28504009f8e8c2dc3d9da6ecb694afdb1f6269f3a979','{"message":{"id":"59fd6793-c4a7-4be6-a760-bdf14762f016","sequence":1,"room_id":"2ff44527-7fdf-4926-9e0a-71814ba69d11","thread_id":null,"author":{"id":"f5d6f0ea-e655-49d4-9173-50089cc377ed","display_name":"金样成员 seed"},"body":"金样讨论 seed","created_at":"2026-01-15T09:00:00.000Z","shared_reply":null,"quoted_message":null}}');
INSERT INTO "im_rooms"("id","title","owner_id","invite_token_hash","created_at","updated_at","project_id") VALUES('2ff44527-7fdf-4926-9e0a-71814ba69d11','金样工作项目','f5d6f0ea-e655-49d4-9173-50089cc377ed',NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z','project-332cb2e6-77a9-4dda-b5d6-d367eb3ccfda');
INSERT INTO "mw_access"("project_id","member_id","role") VALUES('project-332cb2e6-77a9-4dda-b5d6-d367eb3ccfda','f5d6f0ea-e655-49d4-9173-50089cc377ed','owner');
INSERT INTO "mw_events"("cursor","scope_kind","scope_id","kind","entity_id","thread_id") VALUES(1,'room','2ff44527-7fdf-4926-9e0a-71814ba69d11','message','59fd6793-c4a7-4be6-a760-bdf14762f016',NULL);
INSERT INTO "mw_members"("id","display_name") VALUES('f5d6f0ea-e655-49d4-9173-50089cc377ed','金样成员 seed');
INSERT INTO "mw_projects"("id","title","owner_id","scope_json") VALUES('project-332cb2e6-77a9-4dda-b5d6-d367eb3ccfda','金样工作项目','f5d6f0ea-e655-49d4-9173-50089cc377ed','{"id":"project-332cb2e6-77a9-4dda-b5d6-d367eb3ccfda","title":"金样工作项目","goal_ids":[],"artifacts":[]}');
INSERT INTO "mw_server_identity"("singleton","cookie_suffix") VALUES(1,'86812df53f734291');
INSERT INTO "mw_sessions"("id","member_id","token_hash","label","expires_at","revoked") VALUES('c47d38a1-eec4-49f8-bf55-e3d65b1fcd25','f5d6f0ea-e655-49d4-9173-50089cc377ed','f12212ad8fddf71e9aef61f077df9bbb661f427483300dfbee13905b47e6d7fa','浏览器',1771059600000,0);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('im_messages',1);
INSERT INTO sqlite_sequence(name,seq) VALUES('mw_events',1);
CREATE INDEX im_messages_stream ON im_messages(room_id, thread_id, sequence);
CREATE UNIQUE INDEX im_project_room ON im_rooms(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX mw_events_scope ON mw_events(scope_kind,scope_id,cursor);
PRAGMA user_version=1;
COMMIT;

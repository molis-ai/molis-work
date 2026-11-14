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
      quote_id TEXT REFERENCES im_messages(id)
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
INSERT INTO "im_messages"("sequence","id","room_id","thread_id","author_id","body","shared_message_id","created_at","quote_id") VALUES(1,'fd06e509-e272-4182-be69-0b8d4326465c','46ad7540-7c62-40aa-a47b-f1eaec93189f',NULL,'d2cde0c3-fa8a-4663-a6f7-ad74244a7502','金样讨论 seed',NULL,'2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "im_receipts"("session_id","client_id","fingerprint","result_json") VALUES('17523577-4378-4d88-abdf-d454856bf884','07add4a6-53e6-44f3-bbf5-f21084485af6','1ebbddbb46a01bfa95682fd8938fceda85cff157a9a6b0e7958b06ea3e5202c5','{"member":{"id":"d2cde0c3-fa8a-4663-a6f7-ad74244a7502","display_name":"金样成员 seed"}}');
INSERT INTO "im_receipts"("session_id","client_id","fingerprint","result_json") VALUES('17523577-4378-4d88-abdf-d454856bf884','89195e30-5e93-4bb1-a446-a9c29af3296d','99743eee152f977bda85afb943c6196359ebbc622cf01f4223baf0189bee9efd','{"message":{"id":"fd06e509-e272-4182-be69-0b8d4326465c","sequence":1,"room_id":"46ad7540-7c62-40aa-a47b-f1eaec93189f","thread_id":null,"author":{"id":"d2cde0c3-fa8a-4663-a6f7-ad74244a7502","display_name":"金样成员 seed"},"body":"金样讨论 seed","created_at":"2026-01-15T09:00:00.000Z","shared_reply":null,"quoted_message":null}}');
INSERT INTO "im_rooms"("id","title","owner_id","invite_token_hash","created_at","updated_at","project_id") VALUES('46ad7540-7c62-40aa-a47b-f1eaec93189f','金样工作项目','d2cde0c3-fa8a-4663-a6f7-ad74244a7502',NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z','project-c64187c9-041e-4e62-829e-320302398da6');
INSERT INTO "mw_access"("project_id","member_id","role") VALUES('project-c64187c9-041e-4e62-829e-320302398da6','d2cde0c3-fa8a-4663-a6f7-ad74244a7502','owner');
INSERT INTO "mw_events"("cursor","scope_kind","scope_id","kind","entity_id","thread_id") VALUES(1,'room','46ad7540-7c62-40aa-a47b-f1eaec93189f','message','fd06e509-e272-4182-be69-0b8d4326465c',NULL);
INSERT INTO "mw_members"("id","display_name") VALUES('d2cde0c3-fa8a-4663-a6f7-ad74244a7502','金样成员 seed');
INSERT INTO "mw_projects"("id","title","owner_id","scope_json") VALUES('project-c64187c9-041e-4e62-829e-320302398da6','金样工作项目','d2cde0c3-fa8a-4663-a6f7-ad74244a7502','{"id":"project-c64187c9-041e-4e62-829e-320302398da6","title":"金样工作项目","goal_ids":[],"artifacts":[]}');
INSERT INTO "mw_server_identity"("singleton","cookie_suffix") VALUES(1,'86812df53f734291');
INSERT INTO "mw_sessions"("id","member_id","token_hash","label","expires_at","revoked") VALUES('17523577-4378-4d88-abdf-d454856bf884','d2cde0c3-fa8a-4663-a6f7-ad74244a7502','421f0f37eacd63648d0281f3ca4341e3b25da4024a6b5279223efafbea2637f9','浏览器',1771059600000,0);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('im_messages',1);
INSERT INTO sqlite_sequence(name,seq) VALUES('mw_events',1);
CREATE INDEX im_messages_stream ON im_messages(room_id, thread_id, sequence);
CREATE UNIQUE INDEX im_project_room ON im_rooms(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX mw_events_scope ON mw_events(scope_kind,scope_id,cursor);
PRAGMA user_version=1;
COMMIT;

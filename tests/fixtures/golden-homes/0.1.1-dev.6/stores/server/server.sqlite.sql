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
INSERT INTO "im_messages"("sequence","id","room_id","thread_id","author_id","body","shared_message_id","created_at","quote_id","subjects_json") VALUES(1,'a9161d69-2e71-4e47-b533-69a9c6af06c4','d8309038-312f-4b86-8e25-42f0822b8213',NULL,'db58a56a-eee7-4fe8-b38f-12e7b1853888','金样讨论 seed',NULL,'2026-01-15T09:00:00.000Z',NULL,'[{"kind":"goal","id":"goal-56ec4889-a371-4e12-ae41-38777faad0a8"}]');
INSERT INTO "im_receipts"("session_id","client_id","fingerprint","result_json") VALUES('0779dbaf-52fc-4a41-9e4e-241befe3d4b9','6581d29b-116c-4a80-bcc7-cc68c9909388','a6b189113a4629dcfbe457e27ea832d47265f93f46a4528ca3c896412d0bd5d7','{"member":{"id":"db58a56a-eee7-4fe8-b38f-12e7b1853888","display_name":"金样成员 seed"}}');
INSERT INTO "im_receipts"("session_id","client_id","fingerprint","result_json") VALUES('0779dbaf-52fc-4a41-9e4e-241befe3d4b9','f2adac64-d844-4b87-bbdf-6717d264ec99','445ba17683b276528f5bec5178500c4fd438f334df5a79e752274d9ac11a98a4','{"message":{"id":"a9161d69-2e71-4e47-b533-69a9c6af06c4","sequence":1,"room_id":"d8309038-312f-4b86-8e25-42f0822b8213","thread_id":null,"author":{"id":"db58a56a-eee7-4fe8-b38f-12e7b1853888","display_name":"金样成员 seed"},"body":"金样讨论 seed","created_at":"2026-01-15T09:00:00.000Z","shared_reply":null,"quoted_message":null}}');
INSERT INTO "im_rooms"("id","title","owner_id","invite_token_hash","created_at","updated_at","project_id") VALUES('d8309038-312f-4b86-8e25-42f0822b8213','金样工作项目','db58a56a-eee7-4fe8-b38f-12e7b1853888',NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z','project-c3d068af-be20-4cb1-987b-3015105830de');
INSERT INTO "mw_access"("project_id","member_id","role") VALUES('project-c3d068af-be20-4cb1-987b-3015105830de','db58a56a-eee7-4fe8-b38f-12e7b1853888','owner');
INSERT INTO "mw_events"("cursor","scope_kind","scope_id","kind","entity_id","thread_id") VALUES(1,'room','d8309038-312f-4b86-8e25-42f0822b8213','message','a9161d69-2e71-4e47-b533-69a9c6af06c4',NULL);
INSERT INTO "mw_members"("id","display_name") VALUES('db58a56a-eee7-4fe8-b38f-12e7b1853888','金样成员 seed');
INSERT INTO "mw_projects"("id","title","owner_id","scope_json") VALUES('project-c3d068af-be20-4cb1-987b-3015105830de','金样工作项目','db58a56a-eee7-4fe8-b38f-12e7b1853888','{"id":"project-c3d068af-be20-4cb1-987b-3015105830de","title":"金样工作项目","goal_ids":[],"artifacts":[]}');
INSERT INTO "mw_server_identity"("singleton","cookie_suffix") VALUES(1,'86812df53f734291');
INSERT INTO "mw_sessions"("id","member_id","token_hash","label","expires_at","revoked") VALUES('0779dbaf-52fc-4a41-9e4e-241befe3d4b9','db58a56a-eee7-4fe8-b38f-12e7b1853888','0c3426464f2e24c3d25f7e9e177d12275d88b85d2a23b4bdb124f7db7229e855','浏览器',1771059600000,0);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('im_messages',1);
INSERT INTO sqlite_sequence(name,seq) VALUES('mw_events',1);
CREATE INDEX im_messages_stream ON im_messages(room_id, thread_id, sequence);
CREATE UNIQUE INDEX im_project_room ON im_rooms(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX mw_events_scope ON mw_events(scope_kind,scope_id,cursor);
PRAGMA user_version=1;
COMMIT;

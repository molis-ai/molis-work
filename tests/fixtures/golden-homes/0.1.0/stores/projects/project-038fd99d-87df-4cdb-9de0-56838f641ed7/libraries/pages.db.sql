PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE page_changes (change_id TEXT PRIMARY KEY, page_id TEXT NOT NULL, to_version INTEGER NOT NULL, before_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE page_comments (page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE, thread_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(page_id,thread_id));
CREATE TABLE page_generations (request_id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, record_json TEXT NOT NULL);
CREATE TABLE page_imports (request_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, document_ids_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE pages (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL,
    folder_id TEXT NOT NULL DEFAULT '',
    starred INTEGER NOT NULL DEFAULT 0,
    goal_id TEXT NOT NULL DEFAULT '',
    artifact_id TEXT NOT NULL DEFAULT '',
    artifact_version INTEGER NOT NULL DEFAULT 0,
    publication_pending_json TEXT
  );
CREATE TABLE pages_editor_versions(id TEXT PRIMARY KEY,version INTEGER NOT NULL);
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
INSERT INTO "pages"("id","title","body_json","created_at","updated_at","version","folder_id","starred","goal_id","artifact_id","artifact_version","publication_pending_json") VALUES('bae266e5-9855-4f69-b2be-73fb0453274c','金样页面 seed 已改','{"type":"doc","content":[{"type":"paragraph"}]}','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z',2,'',0,'','',0,NULL);
INSERT INTO "pages_editor_versions"("id","version") VALUES('bae266e5-9855-4f69-b2be-73fb0453274c',2);
PRAGMA user_version=1;
COMMIT;

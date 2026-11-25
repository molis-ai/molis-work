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
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
INSERT INTO "pages"("id","title","body_json","created_at","updated_at","version","folder_id","starred","goal_id","artifact_id","artifact_version","publication_pending_json") VALUES('90aaed2c-8022-4f24-940e-729c561e2470','金样摆放 seed','{"type":"doc","content":[{"type":"paragraph"}]}','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z',1,'',0,'','',0,NULL);
INSERT INTO "pages_editor_versions"("id","version") VALUES('90aaed2c-8022-4f24-940e-729c561e2470',1);
PRAGMA user_version=1;
COMMIT;

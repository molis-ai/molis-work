PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE form_copies (request_id TEXT PRIMARY KEY, source_id TEXT NOT NULL, target_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE forms (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    share_id TEXT,
    questions_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL,
    artifact_id TEXT NOT NULL DEFAULT '',
    artifact_version INTEGER NOT NULL DEFAULT 0,
    publication_pending_json TEXT
  );
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE submissions (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL,
    answers_json TEXT NOT NULL,
    submitted_at TEXT NOT NULL,
    form_version INTEGER NOT NULL,
    questions_json TEXT NOT NULL,
    request_id TEXT,
    source TEXT NOT NULL
  );
INSERT INTO "forms"("id","title","description","status","share_id","questions_json","created_at","updated_at","version","artifact_id","artifact_version","publication_pending_json") VALUES('d2e3070b-3728-4172-8c99-8115191a9b21','金样表单 seed','','draft',NULL,'[{"id":"8dd44a59-f400-4e1c-be79-049df5c82fbc","type":"text","title":"金样问题 seed","required":false,"order":1}]','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z',2,'',0,NULL);
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
CREATE UNIQUE INDEX submissions_request ON submissions (form_id, request_id) WHERE request_id IS NOT NULL;
PRAGMA user_version=1;
COMMIT;

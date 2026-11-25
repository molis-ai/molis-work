PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE attachments (
    plugin_id TEXT NOT NULL, install_id TEXT NOT NULL, project_id TEXT NOT NULL, sha256 TEXT NOT NULL,
    title TEXT NOT NULL, kind TEXT NOT NULL, media_type TEXT NOT NULL, byte_length INTEGER NOT NULL,
    text TEXT, text_meta TEXT, attached_at TEXT NOT NULL,
    PRIMARY KEY (plugin_id, install_id, project_id, sha256));
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
INSERT INTO "attachments"("plugin_id","install_id","project_id","sha256","title","kind","media_type","byte_length","text","text_meta","attached_at") VALUES('io.molis.work.assistant','system','','dd2f7b620f99beca7f871778d15112869283b4f13399e4ebdf389bb616969bd3','golden-seed.png','image','image/png',68,NULL,NULL,'2026-01-15T09:00:00.000Z');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
CREATE INDEX attachments_by_content ON attachments (sha256);
PRAGMA user_version=1;
COMMIT;

PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE presentation_copies (request_id TEXT PRIMARY KEY, source_id TEXT NOT NULL, target_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE presentations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    color_primary TEXT NOT NULL,
    color_background TEXT NOT NULL,
    color_text TEXT NOT NULL,
    slides_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL,
    artifact_id TEXT NOT NULL DEFAULT '',
    artifact_version INTEGER NOT NULL DEFAULT 0,
    publication_pending_json TEXT
  );
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
INSERT INTO "presentations"("id","title","description","color_primary","color_background","color_text","slides_json","created_at","updated_at","version","artifact_id","artifact_version","publication_pending_json") VALUES('4ade158b-7c79-491d-9c7d-aec11befdf99','金样演示 seed 已改','','#5e6ad2','#FCFCFB','#292A2E','[{"id":"c4d97894-a56d-43e9-ae4f-1db373351cb0","title":"","bullets":[],"notes":"","order":1}]','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z',2,'',0,NULL);
PRAGMA user_version=1;
COMMIT;

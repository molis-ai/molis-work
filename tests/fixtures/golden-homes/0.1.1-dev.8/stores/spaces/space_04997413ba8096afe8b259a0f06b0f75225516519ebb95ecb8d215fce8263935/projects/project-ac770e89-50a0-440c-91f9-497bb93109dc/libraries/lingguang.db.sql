PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    spark_key TEXT NOT NULL UNIQUE,
    spark_ids_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE spark_requests (
    request_id TEXT PRIMARY KEY,
    spark_id TEXT NOT NULL
  );
CREATE TABLE sparks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
INSERT INTO "sparks"("id","title","body","source_kind","status","created_at","updated_at") VALUES('d5fac154-257d-4af0-9ffe-f5221b419477','金样灵光 seed 已改','合成的灵光正文','manual','inbox','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.001Z');
PRAGMA user_version=1;
COMMIT;

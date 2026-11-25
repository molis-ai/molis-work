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
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
INSERT INTO "sparks"("id","title","body","source_kind","status","created_at","updated_at") VALUES('c065c85e-e3bb-40ef-badb-8c05e31e8756','金样灵光 seed 已改','合成的灵光正文','manual','inbox','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.001Z');
PRAGMA user_version=1;
COMMIT;

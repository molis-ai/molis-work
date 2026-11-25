PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE dataset_receipts (request_id TEXT PRIMARY KEY, dataset_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE dataset_source_bindings (
    source_key TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE TABLE dataset_versions (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL,
    note TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
CREATE TABLE datasets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    columns_json TEXT NOT NULL,
    rows_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL,
    artifact_id TEXT NOT NULL DEFAULT '',
    artifact_version INTEGER NOT NULL DEFAULT 0,
    publication_pending_json TEXT
  );
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
INSERT INTO "datasets"("id","title","description","status","columns_json","rows_json","created_at","updated_at","version","artifact_id","artifact_version","publication_pending_json") VALUES('d186fedd-97d7-4d9c-97c1-19b911d9300b','金样数据集 seed 已改','','draft','[]','[]','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z',2,'',0,NULL);
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
PRAGMA user_version=1;
COMMIT;

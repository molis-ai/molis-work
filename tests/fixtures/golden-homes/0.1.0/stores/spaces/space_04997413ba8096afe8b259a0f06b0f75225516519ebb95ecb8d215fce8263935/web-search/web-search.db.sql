PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE web_search_default (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    source_id TEXT NOT NULL,
    updated_at TEXT NOT NULL);
CREATE TABLE web_search_last_use (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    source_id TEXT NOT NULL,
    title TEXT NOT NULL,
    account_label TEXT,
    audience TEXT NOT NULL,
    used_at TEXT NOT NULL);
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
INSERT INTO "web_search_default"("id","source_id","updated_at") VALUES(1,'builtin:anysearch','2026-01-15T09:00:00.000Z');
PRAGMA user_version=1;
COMMIT;

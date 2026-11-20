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
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
INSERT INTO "web_search_default"("id","source_id","updated_at") VALUES(1,'builtin:anysearch','2026-01-15T09:00:00.000Z');
PRAGMA user_version=1;
COMMIT;

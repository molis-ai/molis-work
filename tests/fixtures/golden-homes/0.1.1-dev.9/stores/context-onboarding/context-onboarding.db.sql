PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE journeys (id TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
INSERT INTO "journeys"("id","body","updated_at") VALUES('8b207f90-372f-43bf-9c0a-cb9ac8da0814','{"id":"8b207f90-372f-43bf-9c0a-cb9ac8da0814","phase":"selecting","sources":[],"model":null,"error":null,"summary":null,"project_id":"project-onboarding-8b207f90-372f-43bf-9c0a-cb9ac8da0814","summary_open":null,"updated_at":"2026-01-15T09:00:00.000Z","scope_delta":null,"auto_start":false,"previewed":true}','2026-01-15T09:00:00.000Z');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
PRAGMA user_version=1;
COMMIT;

PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE journeys (id TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
INSERT INTO "journeys"("id","body","updated_at") VALUES('a380be10-e5ee-4527-8ba6-c36f6a4c2330','{"id":"a380be10-e5ee-4527-8ba6-c36f6a4c2330","phase":"selecting","sources":[],"model":null,"error":null,"summary":null,"project_id":"project-onboarding-a380be10-e5ee-4527-8ba6-c36f6a4c2330","summary_open":null,"updated_at":"2026-01-15T09:00:00.000Z","scope_delta":null,"auto_start":false,"previewed":true}','2026-01-15T09:00:00.000Z');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
PRAGMA user_version=1;
COMMIT;

PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE journeys (id TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
INSERT INTO "journeys"("id","body","updated_at") VALUES('2e61ea53-9f86-4bf3-9758-224dec787667','{"id":"2e61ea53-9f86-4bf3-9758-224dec787667","phase":"selecting","sources":[],"model":null,"error":null,"summary":null,"project_id":"project-onboarding-2e61ea53-9f86-4bf3-9758-224dec787667","document_id":null,"updated_at":"2026-01-15T09:00:00.000Z","auto_start":false,"previewed":true}','2026-01-15T09:00:00.000Z');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
PRAGMA user_version=1;
COMMIT;

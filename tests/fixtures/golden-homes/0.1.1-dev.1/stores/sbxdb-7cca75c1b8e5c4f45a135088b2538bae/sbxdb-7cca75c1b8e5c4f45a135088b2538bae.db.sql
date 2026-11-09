PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL UNIQUE);
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
INSERT INTO "notes"("id","text") VALUES(1,'金样 Home 库里的一行');
PRAGMA user_version=1;
COMMIT;

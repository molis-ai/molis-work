PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE feed_content_holds (
    content_ref TEXT NOT NULL,
    project_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    PRIMARY KEY (content_ref, project_id, source_id)
  );
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
CREATE INDEX feed_content_holds_by_holder ON feed_content_holds (project_id, source_id);
PRAGMA user_version=1;
COMMIT;

PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE evidence_holds (
  content_ref TEXT NOT NULL CHECK (length(content_ref) BETWEEN 1 AND 200),
  partition_id TEXT NOT NULL,
  owner_install TEXT NOT NULL,
  holder_key TEXT NOT NULL CHECK (length(holder_key) BETWEEN 1 AND 200),
  held_at TEXT NOT NULL,
  PRIMARY KEY (content_ref, partition_id, owner_install, holder_key)
);
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
CREATE INDEX evidence_holds_by_holder ON evidence_holds (partition_id, owner_install, holder_key);
CREATE INDEX evidence_holds_by_install ON evidence_holds (owner_install);
PRAGMA user_version=1;
COMMIT;

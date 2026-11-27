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
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
CREATE INDEX evidence_holds_by_holder ON evidence_holds (partition_id, owner_install, holder_key);
CREATE INDEX evidence_holds_by_install ON evidence_holds (owner_install);
PRAGMA user_version=1;
COMMIT;

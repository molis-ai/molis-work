PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE plugin_home_libraries (
      plugin_id TEXT PRIMARY KEY,
      publisher_signature TEXT NOT NULL,
      store_name TEXT NOT NULL UNIQUE,
      version INTEGER NOT NULL CHECK (version >= 1),
      schema_digest TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
PRAGMA user_version=1;
COMMIT;

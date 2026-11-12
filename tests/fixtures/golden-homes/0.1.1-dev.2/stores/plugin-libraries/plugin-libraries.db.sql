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
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
INSERT INTO "plugin_home_libraries"("plugin_id","publisher_signature","store_name","version","schema_digest","created_at") VALUES('io.molis.work.example.golden-home-library','ed25519:sha256:71fe57be5711170cd71a9bb007d22c50b411ab9302256f5644e46e7fc6ccc42d','sbxdb-7cca75c1b8e5c4f45a135088b2538bae',1,'fd7764d180b6ba960b032c85a7bea9d36d67c8c08d1cf49f9d9a8a9c220b6a60','2026-01-15T09:00:00.000Z');
PRAGMA user_version=1;
COMMIT;

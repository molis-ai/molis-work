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
INSERT INTO "plugin_home_libraries"("plugin_id","publisher_signature","store_name","version","schema_digest","created_at") VALUES('com.example.golden-home-library','ed25519:sha256:7032446c1c480a029355b300a48e56e88e6afd6e654ea27bb8c494d907dbb349','sbxdb-07ba5a137b9c31eb32d2afc59b67135f',1,'fd7764d180b6ba960b032c85a7bea9d36d67c8c08d1cf49f9d9a8a9c220b6a60','2026-01-15T09:00:00.000Z');
PRAGMA user_version=1;
COMMIT;

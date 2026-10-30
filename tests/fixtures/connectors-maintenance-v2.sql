-- Connectors v1 -> v2. Preserve ids, references, protocol configuration, authorization receipts and rowids.
-- Foreign-key enforcement is restored by the wrapper connection's close; both guards explicitly check every FK.
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;
SELECT maintenance_before();
CREATE TABLE connector_connections_v2 (
  connection_id TEXT PRIMARY KEY, service_id TEXT NOT NULL, display_name TEXT NOT NULL, account_label TEXT,
  auth_method TEXT NOT NULL, credential_ref TEXT, refresh_ref TEXT, expires_ref TEXT, source TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), removed_at TEXT, disconnected_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
INSERT INTO connector_connections_v2 (rowid,connection_id,service_id,display_name,account_label,auth_method,credential_ref,refresh_ref,expires_ref,
  source,disconnected_at,created_at,updated_at)
  SELECT rowid,connection_id,service_id,display_name,account_label,auth_method,credential_ref,refresh_ref,expires_ref,
    source,disconnected_at,created_at,updated_at FROM connector_connections;
DROP TABLE connector_connections;
ALTER TABLE connector_connections_v2 RENAME TO connector_connections;
CREATE INDEX connector_connections_service_idx ON connector_connections(service_id,created_at);
CREATE UNIQUE INDEX connector_connections_credential_idx ON connector_connections(credential_ref) WHERE credential_ref IS NOT NULL;
ALTER TABLE connector_authorization_results ADD COLUMN setup_json TEXT;
ALTER TABLE connector_authorization_results ADD COLUMN initiator_json TEXT;
CREATE TABLE connector_observations (connection_id TEXT PRIMARY KEY, check_json TEXT, call_json TEXT);
PRAGMA user_version=2;
SELECT maintenance_after();
COMMIT;

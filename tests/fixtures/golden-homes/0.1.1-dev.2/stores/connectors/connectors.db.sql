PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE connector_authorization_results (
    id TEXT PRIMARY KEY, state_hash TEXT UNIQUE NOT NULL, connection_id TEXT NOT NULL,
    service_id TEXT NOT NULL, status TEXT NOT NULL, expires_at INTEGER NOT NULL,
    setup_json TEXT, initiator_json TEXT);
CREATE TABLE connector_authorization_sessions
    (state TEXT PRIMARY KEY, origin TEXT NOT NULL, created_at INTEGER NOT NULL, configuration_json TEXT NOT NULL);
CREATE TABLE connector_bindings (
    scope_id TEXT NOT NULL,
    plugin_id TEXT NOT NULL,
    slot_id TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(scope_id, plugin_id, slot_id),
    FOREIGN KEY(connection_id) REFERENCES connector_connections(connection_id)
  );
CREATE TABLE connector_connection_declarers (
    connection_id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    install_id TEXT NOT NULL,
    plugin_title TEXT NOT NULL,
    FOREIGN KEY(connection_id) REFERENCES connector_connections(connection_id)
  );
CREATE TABLE connector_connection_targets (
    connection_id TEXT PRIMARY KEY,
    origin TEXT NOT NULL,
    FOREIGN KEY(connection_id) REFERENCES connector_connections(connection_id)
  );
CREATE TABLE connector_connections (
    connection_id TEXT PRIMARY KEY,
    service_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    account_label TEXT,
    auth_method TEXT NOT NULL,
    credential_ref TEXT,
    refresh_ref TEXT,
    expires_ref TEXT,
    source TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
    removed_at TEXT,
    disconnected_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE TABLE connector_observations (
    connection_id TEXT PRIMARY KEY,
    check_json TEXT,
    call_json TEXT
  );
CREATE TABLE connector_protocols (connection_id TEXT PRIMARY KEY, configuration_json TEXT NOT NULL);
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
INSERT INTO "connector_authorization_results"("id","state_hash","connection_id","service_id","status","expires_at","setup_json","initiator_json") VALUES('ab2013c3-4fa1-4284-bfe8-9c24f7c20a2b','198c58a7a046946d55b0b78da91f8aa65b7244f376a26baf6a6c8608f97fd196','','model-api','prepared',1768554000000,'{"service_id":"model-api","method":"token","display_name":"金样连接 seed"}','{"actor_id":"web-user","project_id":null}');
INSERT INTO "connector_connection_targets"("connection_id","origin") VALUES('01450505-d018-493b-9ddb-312bdc822ec7','http://127.0.0.1:9');
INSERT INTO "connector_connection_targets"("connection_id","origin") VALUES('0aff8d3d-7ba1-4c16-a43d-86877fe350dc','http://127.0.0.1:9');
INSERT INTO "connector_connections"("connection_id","service_id","display_name","account_label","auth_method","credential_ref","refresh_ref","expires_ref","source","enabled","removed_at","disconnected_at","created_at","updated_at") VALUES('01450505-d018-493b-9ddb-312bdc822ec7','model-api','金样模型 seed 已改',NULL,'token','connector-connection:01450505-d018-493b-9ddb-312bdc822ec7:token',NULL,NULL,'managed',1,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "connector_connections"("connection_id","service_id","display_name","account_label","auth_method","credential_ref","refresh_ref","expires_ref","source","enabled","removed_at","disconnected_at","created_at","updated_at") VALUES('0aff8d3d-7ba1-4c16-a43d-86877fe350dc','model-api','金样模型 seed',NULL,'token','connector-connection:0aff8d3d-7ba1-4c16-a43d-86877fe350dc:token',NULL,NULL,'managed',1,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
CREATE UNIQUE INDEX connector_connections_credential_idx
    ON connector_connections(credential_ref) WHERE credential_ref IS NOT NULL;
CREATE INDEX connector_connections_service_idx
    ON connector_connections(service_id, created_at);
PRAGMA user_version=1;
COMMIT;

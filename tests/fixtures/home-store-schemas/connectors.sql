CREATE TABLE connector_authorization_sessions
        (state TEXT PRIMARY KEY, origin TEXT NOT NULL, created_at INTEGER NOT NULL, configuration_json TEXT NOT NULL);

-- Current owner DDL: included for a new Home, independent of whether an old Home had used authorization yet.
CREATE TABLE connector_authorization_results (
  id TEXT PRIMARY KEY, state_hash TEXT UNIQUE NOT NULL, connection_id TEXT NOT NULL,
  service_id TEXT NOT NULL, status TEXT NOT NULL, expires_at INTEGER NOT NULL,
  setup_json TEXT, initiator_json TEXT);

CREATE TABLE connector_bindings (
        scope_id TEXT NOT NULL,
        plugin_id TEXT NOT NULL,
        slot_id TEXT NOT NULL,
        connection_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(scope_id, plugin_id, slot_id),
        FOREIGN KEY(connection_id) REFERENCES connector_connections(connection_id)
      );

CREATE TABLE connector_connection_targets (
        connection_id TEXT PRIMARY KEY,
        origin TEXT NOT NULL,
        FOREIGN KEY(connection_id) REFERENCES connector_connections(connection_id)
      );

CREATE TABLE connector_connection_declarers (
        connection_id TEXT PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        install_id TEXT NOT NULL,
        plugin_title TEXT NOT NULL,
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

CREATE TABLE connector_protocols (connection_id TEXT PRIMARY KEY, configuration_json TEXT NOT NULL);

CREATE UNIQUE INDEX connector_connections_credential_idx
        ON connector_connections(credential_ref) WHERE credential_ref IS NOT NULL;

CREATE INDEX connector_connections_service_idx
        ON connector_connections(service_id, created_at);

-- ASC-10: latest technical observations in the current complete connectors baseline.
CREATE TABLE connector_observations (
  connection_id TEXT PRIMARY KEY,
  check_json TEXT,
  call_json TEXT
);

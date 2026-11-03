CREATE TABLE plugin_runtime_installs (
  install_id TEXT PRIMARY KEY,
  record_json TEXT NOT NULL,
  publisher_trust TEXT NOT NULL CHECK (publisher_trust IN ('host', 'pinned', 'unsigned'))
);
CREATE TABLE plugin_runtime_release_artifacts (
  plugin_id TEXT NOT NULL,
  publisher_signature TEXT NOT NULL,
  version TEXT NOT NULL,
  manifest_digest TEXT NOT NULL,
  artifact_json TEXT NOT NULL,
  PRIMARY KEY (plugin_id, publisher_signature, version, manifest_digest)
);
CREATE TABLE plugin_private_values (
  install_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  item_value TEXT NOT NULL,
  PRIMARY KEY (install_id, item_key)
);
CREATE TABLE IF NOT EXISTS plugin_publishers (
  key_id TEXT PRIMARY KEY,
  public_key_spki_base64 TEXT NOT NULL,
  label TEXT NOT NULL,
  pinned_at TEXT NOT NULL,
  pinned_by TEXT NOT NULL,
  revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS plugin_consents (
  consent_id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL,
  publisher_signature TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('always_on', 'default_wiring', 'default_group', 'local_directory', 'project_reach')),
  subject TEXT NOT NULL,
  manifest_digest TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  granted_by TEXT NOT NULL CHECK (granted_by IN ('user', 'host_build')),
  revoked_at TEXT,
  approved_capability_ids TEXT,
  CHECK ((kind = 'project_reach' AND granted_by = 'user' AND approved_capability_ids IS NOT NULL AND json_valid(approved_capability_ids) AND json_type(approved_capability_ids) = 'array')
    OR (kind <> 'project_reach' AND approved_capability_ids IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS plugin_consents_active ON plugin_consents (plugin_id, publisher_signature, kind, subject) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS plugin_consents_plugin ON plugin_consents (plugin_id);
PRAGMA user_version = 1;

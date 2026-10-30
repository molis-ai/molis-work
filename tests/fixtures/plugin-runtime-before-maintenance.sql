-- Home Runtime v2, schema only; no business rows.
CREATE TABLE plugin_private_values (
  install_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  item_value TEXT NOT NULL,
  PRIMARY KEY (install_id, item_key)
);

CREATE TABLE plugin_runtime_installs (
  install_id TEXT PRIMARY KEY,
  record_json TEXT NOT NULL);

CREATE TABLE plugin_runtime_release_artifacts (
  plugin_id TEXT NOT NULL,
  publisher_signature TEXT NOT NULL,
  version TEXT NOT NULL,
  manifest_digest TEXT NOT NULL,
  artifact_json TEXT NOT NULL,
  PRIMARY KEY (plugin_id, publisher_signature, version, manifest_digest)
);

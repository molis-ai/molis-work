-- ac-trust T1: offline rehearsal only. Stop the Home and back it up before applying to a real Home.
-- Run with an API that stops at the first error (or sqlite3 -bail). On failure close/ROLLBACK;
-- never continue executing the remaining statements. No runtime reader invokes this file.
-- The Home Runtime store gets the consent ledger and the pinned publishers, and every installation record gets the Host's evidence
-- for it (`publisher_trust`): a record of code run in the Host process is `host`, one of generated (sandboxed) code is `unsigned`.
-- A record of neither is refused (the NOT NULL fails), not guessed.
BEGIN IMMEDIATE;
CREATE TEMP TABLE maintenance_v3_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO maintenance_v3_guard SELECT user_version = 2 FROM pragma_user_version;
SELECT maintenance_before();
CREATE TABLE plugin_runtime_installs_v3 (
  install_id TEXT PRIMARY KEY,
  record_json TEXT NOT NULL,
  publisher_trust TEXT NOT NULL CHECK (publisher_trust IN ('host', 'pinned', 'unsigned'))
);
INSERT INTO plugin_runtime_installs_v3 (install_id, record_json, publisher_trust)
  SELECT install_id,
    json_set(record_json, '$.publisher_trust', CASE json_extract(record_json, '$.execution') WHEN 'host' THEN 'host' WHEN 'sandbox' THEN 'unsigned' END),
    CASE json_extract(record_json, '$.execution') WHEN 'host' THEN 'host' WHEN 'sandbox' THEN 'unsigned' END
  FROM plugin_runtime_installs;
DROP TABLE plugin_runtime_installs;
ALTER TABLE plugin_runtime_installs_v3 RENAME TO plugin_runtime_installs;
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
  kind TEXT NOT NULL CHECK (kind IN ('always_on', 'default_wiring', 'default_group', 'local_directory')),
  subject TEXT NOT NULL,
  manifest_digest TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  granted_by TEXT NOT NULL CHECK (granted_by IN ('user', 'host_build')),
  revoked_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS plugin_consents_active ON plugin_consents (plugin_id, publisher_signature, kind, subject) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS plugin_consents_plugin ON plugin_consents (plugin_id);
PRAGMA user_version = 3;
DROP TABLE maintenance_v3_guard;
SELECT maintenance_after();
COMMIT;

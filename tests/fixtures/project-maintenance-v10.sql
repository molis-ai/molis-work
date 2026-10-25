-- ac-trust T1: offline rehearsal only. Stop the Home and back it up before applying to a real project.
-- Run with an API that stops at the first error (or sqlite3 -bail). On failure close/ROLLBACK;
-- never continue executing the remaining statements. No runtime reader invokes this file.
-- Every installation record gets the Host's evidence for it (`publisher_trust`): a record of code run in the Host process is
-- `host`, a record of generated (sandboxed) code is `unsigned`. A record of neither is refused (the NOT NULL fails), not guessed.
BEGIN IMMEDIATE;
CREATE TEMP TABLE maintenance_v10_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO maintenance_v10_guard SELECT user_version = 9 FROM pragma_user_version;
CREATE TABLE plugin_runtime_installs_v10 (install_id TEXT PRIMARY KEY, record_json TEXT NOT NULL,
      publisher_trust TEXT NOT NULL CHECK (publisher_trust IN ('host', 'pinned', 'unsigned')));
INSERT INTO plugin_runtime_installs_v10 (install_id, record_json, publisher_trust)
  SELECT install_id,
    json_set(record_json, '$.publisher_trust', CASE json_extract(record_json, '$.execution') WHEN 'host' THEN 'host' WHEN 'sandbox' THEN 'unsigned' END),
    CASE json_extract(record_json, '$.execution') WHEN 'host' THEN 'host' WHEN 'sandbox' THEN 'unsigned' END
  FROM plugin_runtime_installs;
DROP TABLE plugin_runtime_installs;
ALTER TABLE plugin_runtime_installs_v10 RENAME TO plugin_runtime_installs;
PRAGMA user_version = 10;
DROP TABLE maintenance_v10_guard;
COMMIT;

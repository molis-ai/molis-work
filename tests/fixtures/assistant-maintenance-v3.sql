-- PG-036 (C8-3): offline maintenance of assistant/assistant.db from version 2 to 3.
-- Stop the Home and back it up before applying to a real store. Run with an API that stops at the first error (or sqlite3 -bail);
-- on failure close/ROLLBACK, never continue executing the remaining statements. No runtime reader invokes this file.
-- Version 2 wrote Coding as the one executor kind: a work's `executor` is `{"kind":"coding","title":…,"session_id":…}` and a round's
-- `executor` is `"coding"`. Version 3 names the plugin: `{"kind":"plugin","plugin_id":"io.molis.work.coding",…}` and `"plugin"`.
-- A finished Send keeps its whole result in `assistant_requests.result` and hands it back for a repeated request id, so the work in
-- it is rewritten the same way. The tables, the sessions a work is related to (kind `coding_session`) and every other field stay as they are.
BEGIN IMMEDIATE;
CREATE TEMP TABLE maintenance_assistant_v3_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO maintenance_assistant_v3_guard SELECT user_version = 2 FROM pragma_user_version;
UPDATE assistant_works
  SET body = json_set(body, '$.executor.kind', 'plugin', '$.executor.plugin_id', 'io.molis.work.coding')
  WHERE json_extract(body, '$.executor.kind') = 'coding';
UPDATE assistant_rounds
  SET body = json_set(body, '$.executor', 'plugin')
  WHERE json_extract(body, '$.executor') = 'coding';
UPDATE assistant_requests
  SET result = json_set(result, '$.work.executor.kind', 'plugin', '$.work.executor.plugin_id', 'io.molis.work.coding')
  WHERE json_extract(result, '$.work.executor.kind') = 'coding';
PRAGMA user_version = 3;
DROP TABLE maintenance_assistant_v3_guard;
COMMIT;

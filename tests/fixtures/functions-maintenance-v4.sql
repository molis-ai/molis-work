-- PG-032 P2 (S-90): offline maintenance of functions/functions.db from version 3 to 4.
-- Stop the Home and back it up before applying to a real store. Run with an API that stops at the first error (or sqlite3 -bail);
-- on failure close/ROLLBACK, never continue executing the remaining statements. No runtime reader invokes this file.
-- Every judgment already there stays and gets no installation (it was recorded by the Host): `install_id` is empty. A judgment a plugin
-- installation records through `services.judgments` carries that installation's id from then on.
BEGIN IMMEDIATE;
CREATE TEMP TABLE maintenance_functions_v4_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO maintenance_functions_v4_guard SELECT user_version = 3 FROM pragma_user_version;
ALTER TABLE function_judgments ADD COLUMN install_id TEXT;
PRAGMA user_version = 4;
DROP TABLE maintenance_functions_v4_guard;
COMMIT;

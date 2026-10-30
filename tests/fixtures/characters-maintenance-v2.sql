-- Sessions cleanup SC-2 (D3): offline maintenance of characters/characters.sqlite from version 1 to 2.
-- Run through tests/fixtures/home-store-maintenance.mjs, which installs strict schema/integrity/row-count checks.
-- Without those checks this SQL refuses before changing business data. Stop the Home and back it up before applying to a real store. Run with an API that stops at the first error (or sqlite3 -bail);
-- on failure close/ROLLBACK, never continue executing the remaining statements. No runtime reader invokes this file.
-- Drafts are not touched. Native runs launched before version 2 stay where they were written (the Sessions registry) and are
-- not copied: Characters starts its own records empty.
BEGIN IMMEDIATE;
SELECT maintenance_before();
CREATE TEMP TABLE maintenance_characters_v2_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO maintenance_characters_v2_guard SELECT user_version = 1 FROM pragma_user_version;
CREATE TABLE character_runs (
  run_id TEXT PRIMARY KEY,
  panel_id TEXT NOT NULL UNIQUE,
  owner_actor_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  artifact_version INTEGER NOT NULL,
  title TEXT NOT NULL,
  task TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  workspace_path TEXT NOT NULL,
  runtime_id TEXT NOT NULL,
  bundle_path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('starting', 'dispatched', 'failed')),
  status_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX character_runs_by_character ON character_runs (owner_actor_id, project_id, character_id, created_at);
PRAGMA user_version = 2;
DROP TABLE maintenance_characters_v2_guard;
SELECT maintenance_after();
COMMIT;

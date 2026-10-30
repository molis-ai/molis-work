-- SYS-15-S6: offline rehearsal only. Stop the Home and back it up before applying to a real project.
-- Run with an API that stops at the first error (or sqlite3 -bail). On failure close/ROLLBACK;
-- never continue executing the remaining statements. No runtime reader invokes this file.
BEGIN IMMEDIATE;
CREATE TEMP TABLE maintenance_v9_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO maintenance_v9_guard SELECT user_version = 8 FROM pragma_user_version;
SELECT project_maintenance_before(9);
CREATE TABLE schedule_action_bindings (
  job_id TEXT PRIMARY KEY REFERENCES schedule_jobs(job_id) ON DELETE CASCADE,
  install_id TEXT NOT NULL,
  installation_generation TEXT NOT NULL,
  action_version INTEGER NOT NULL CHECK (action_version > 0)
);
-- Old jobs carry no trustworthy installation authority. Keep their original cadence and business
-- histories, but stop dispatch until their owner explicitly authorizes a new binding.
UPDATE schedule_jobs SET enabled = 0, lease_until = NULL, lease_token = NULL;
PRAGMA user_version = 9;
DROP TABLE maintenance_v9_guard;
SELECT project_maintenance_after(9);
COMMIT;

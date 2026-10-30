-- Pages v1 -> v2. Invoke through home-store-maintenance.mjs; no business startup or repair path.
BEGIN IMMEDIATE;
SELECT maintenance_before();
CREATE TABLE page_comments (page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE, thread_id TEXT NOT NULL,
  body TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(page_id,thread_id));
PRAGMA user_version=2;
SELECT maintenance_after();
COMMIT;

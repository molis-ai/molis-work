CREATE TABLE project_runtime_settings (project_id TEXT PRIMARY KEY, runtime_id TEXT, revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE project_runtime_setting_receipts (
  project_id TEXT NOT NULL, actor_id TEXT NOT NULL, request_id TEXT NOT NULL,
  request_json TEXT NOT NULL, result_json TEXT NOT NULL,
  PRIMARY KEY (project_id, actor_id, request_id)
);

CREATE TABLE dataset_receipts (project_id TEXT NOT NULL, request_id TEXT NOT NULL, dataset_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (project_id, request_id));

CREATE TABLE dataset_versions (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL,
      note TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

CREATE TABLE datasets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      columns_json TEXT NOT NULL,
      rows_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version INTEGER NOT NULL
    , project_id TEXT NOT NULL DEFAULT '', artifact_id TEXT NOT NULL DEFAULT '', artifact_version INTEGER NOT NULL DEFAULT 0, publication_pending_json TEXT);

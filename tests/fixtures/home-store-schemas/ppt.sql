CREATE TABLE presentation_copies (project_id TEXT NOT NULL, request_id TEXT NOT NULL, source_id TEXT NOT NULL, target_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (project_id, request_id));

CREATE TABLE presentations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      color_primary TEXT NOT NULL,
      color_background TEXT NOT NULL,
      color_text TEXT NOT NULL,
      slides_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version INTEGER NOT NULL
    , project_id TEXT NOT NULL DEFAULT '', artifact_id TEXT NOT NULL DEFAULT '', artifact_version INTEGER NOT NULL DEFAULT 0, publication_pending_json TEXT);

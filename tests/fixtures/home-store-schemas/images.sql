CREATE TABLE connections (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, api_format TEXT NOT NULL,
        base_url TEXT NOT NULL, model TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );

CREATE TABLE jobs (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, request_id TEXT NOT NULL,
        input_hash TEXT NOT NULL, connection_id TEXT NOT NULL, connection_name TEXT NOT NULL,
        api_format TEXT NOT NULL, model TEXT NOT NULL, prompt TEXT NOT NULL,
        size TEXT NOT NULL, aspect_ratio TEXT NOT NULL, status TEXT NOT NULL,
        images_json TEXT NOT NULL, error TEXT NOT NULL,
        created_at TEXT NOT NULL, finished_at TEXT, runner_id TEXT,
        UNIQUE (project_id, request_id)
      );

CREATE INDEX jobs_project_created ON jobs(project_id, created_at DESC);

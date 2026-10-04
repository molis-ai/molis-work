CREATE TABLE form_copies (project_id TEXT NOT NULL, request_id TEXT NOT NULL, source_id TEXT NOT NULL, target_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (project_id, request_id));

CREATE TABLE forms (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      share_id TEXT,
      questions_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version INTEGER NOT NULL
    , project_id TEXT NOT NULL DEFAULT '', artifact_id TEXT NOT NULL DEFAULT '', artifact_version INTEGER NOT NULL DEFAULT 0, publication_pending_json TEXT);

CREATE TABLE submissions (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL,
      answers_json TEXT NOT NULL,
      submitted_at TEXT NOT NULL
    , form_version INTEGER, questions_json TEXT, request_id TEXT, source TEXT);

CREATE UNIQUE INDEX submissions_request ON submissions (form_id, request_id) WHERE request_id IS NOT NULL;

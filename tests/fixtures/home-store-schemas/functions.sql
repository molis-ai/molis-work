CREATE TABLE function_judgments (
      judgment_id TEXT PRIMARY KEY,
      function_key TEXT NOT NULL,
      function_version INTEGER NOT NULL,
      subject_kind TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      board_id TEXT NOT NULL DEFAULT '',
      scene_id TEXT,
      outcome TEXT NOT NULL,
      suggested_json TEXT NOT NULL,
      error_code TEXT,
      created_at TEXT NOT NULL
    , scene_provenance_json TEXT, recommended_actions_json TEXT);

CREATE TABLE function_scene_bindings (
    scene_id TEXT NOT NULL,
    board_id TEXT NOT NULL,
    action_binding_json TEXT NOT NULL,
    binding_revision TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (scene_id, board_id)
  );

CREATE TABLE functions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      function_key TEXT NOT NULL UNIQUE,
      primitive TEXT NOT NULL,
      status TEXT NOT NULL,
      version INTEGER,
      model TEXT NOT NULL,
      instructions TEXT NOT NULL,
      criteria_json TEXT NOT NULL,
      config_hash TEXT NOT NULL,
      last_preview_json TEXT,
      samples_json TEXT NOT NULL DEFAULT '[]',
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    , scene_id TEXT, subject_kinds_json TEXT NOT NULL DEFAULT '[]', scene_map_json TEXT NOT NULL DEFAULT '{}', scene_version INTEGER, scene_provider_id TEXT, action_map_json TEXT NOT NULL DEFAULT '{}');

CREATE INDEX function_judgments_subject_idx
      ON function_judgments(subject_kind, subject_id, board_id, created_at);

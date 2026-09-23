CREATE TABLE conversation_messages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES workspace_actors(id) ON DELETE RESTRICT,
  author TEXT NOT NULL CHECK (author = 'user'),
  body TEXT NOT NULL,
  context_json TEXT NOT NULL,
  response_state TEXT NOT NULL CHECK (response_state = 'runtime_unavailable'),
  created_at TEXT NOT NULL
);

CREATE INDEX conversation_messages_workspace_created_idx
  ON conversation_messages(workspace_id, created_at, id);

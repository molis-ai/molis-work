-- Frozen v7 extracted from its public Registry + Ledger initializer before adding replication. Schema only.
CREATE TABLE context_edges (
    scope_kind TEXT NOT NULL CHECK (scope_kind IN ('personal', 'team_project')),
    scope_id TEXT NOT NULL,
    edge_key TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    relation_type TEXT NOT NULL,
    source_json TEXT NOT NULL,
    target_json TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    cause TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('active', 'removed')),
    PRIMARY KEY (scope_kind, scope_id, edge_key, revision)
  );
CREATE TABLE session_events (
      event_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('molis_work_tui', 'molis_work')),
      kind TEXT NOT NULL CHECK (kind IN (
        'user_message', 'runtime_message', 'tool', 'approval',
        'status', 'artifact', 'terminal_output'
      )),
      source_id TEXT NOT NULL,
      source_order INTEGER NOT NULL,
      occurred_at TEXT NOT NULL,
      content_ref TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(session_id, source, source_id)
    );
CREATE TABLE session_handoffs (
      package_id TEXT PRIMARY KEY,
      source_session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
      source_project_id TEXT NOT NULL,
      source_goal_id TEXT NOT NULL,
      target_runtime_id TEXT NOT NULL,
      target_project_id TEXT NOT NULL,
      target_workspace_id TEXT,
      target_workspace_path TEXT,
      destination_session_id TEXT REFERENCES sessions(session_id) ON DELETE SET NULL,
      state TEXT NOT NULL CHECK (state IN ('draft', 'sending', 'failed', 'sent', 'cancelled')),
      delivery_mode TEXT CHECK (delivery_mode IS NULL OR delivery_mode IN ('native', 'molis_work_fallback')),
      content_ref TEXT NOT NULL,
      content_digest TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      error_code TEXT,
      error_message TEXT,
      retryable INTEGER NOT NULL DEFAULT 1 CHECK (retryable IN (0, 1)),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sent_at TEXT
    );
CREATE TABLE session_messages (
        request_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, project_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL, session_id TEXT NOT NULL REFERENCES sessions(session_id),
        target_json TEXT NOT NULL, content_ref TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('pending','uncertain','failed','accepted')),
        attempt_count INTEGER NOT NULL DEFAULT 0, native_turn_id TEXT, error_code TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(actor_id, project_id, idempotency_key)
      );
CREATE TABLE session_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE sessions (
          session_id TEXT PRIMARY KEY,
          runtime_id TEXT NOT NULL,
          native_runtime_session_id TEXT,
          correlation_token TEXT,
          correlation_expires_at TEXT,
          surface_id TEXT,
          project_id TEXT,
          current_goal_id TEXT,
          workspace_id TEXT,
          workspace_path TEXT,
          title TEXT,
          status TEXT NOT NULL CHECK (status IN ('discovered', 'active', 'closed')),
          provenance TEXT NOT NULL CHECK (provenance IN (
            'molis_work_created', 'runtime_discovered', 'explicitly_linked'
          )),
          metadata_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
CREATE INDEX context_edges_source_idx ON context_edges
    (scope_kind, scope_id, relation_type, json_extract(source_json, '$.module'), json_extract(source_json, '$.id'));
CREATE INDEX session_events_timeline_idx
      ON session_events(session_id, occurred_at, source_order, event_id);
CREATE INDEX session_handoffs_destination_idx
      ON session_handoffs(destination_session_id, updated_at, package_id);
CREATE INDEX session_handoffs_source_idx
      ON session_handoffs(source_session_id, updated_at, package_id);
CREATE UNIQUE INDEX sessions_correlation_idx
          ON sessions(correlation_token) WHERE correlation_token IS NOT NULL;
CREATE UNIQUE INDEX sessions_native_identity_idx
          ON sessions(runtime_id, native_runtime_session_id)
          WHERE native_runtime_session_id IS NOT NULL;
CREATE INDEX sessions_project_idx ON sessions(project_id, updated_at, session_id);
CREATE UNIQUE INDEX sessions_surface_idx
          ON sessions(surface_id) WHERE surface_id IS NOT NULL;
CREATE INDEX sessions_workspace_idx ON sessions(workspace_id, updated_at, session_id);

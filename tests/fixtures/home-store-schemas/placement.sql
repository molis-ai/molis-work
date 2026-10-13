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

CREATE TABLE placement_titles (kind TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL, seen_at TEXT NOT NULL, PRIMARY KEY (kind, id));

CREATE INDEX context_edges_source_idx ON context_edges
      (scope_kind, scope_id, relation_type, json_extract(source_json, '$.module'), json_extract(source_json, '$.id'));

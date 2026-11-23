-- Frozen complete current baseline; test-only schema, no real Home receipt.

CREATE TABLE home_selections (
  project_id TEXT NOT NULL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('basic', 'page')),
  page_id TEXT,
  version INTEGER,
  revision TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((kind = 'basic' AND page_id IS NULL AND version IS NULL)
      OR (kind = 'page' AND page_id IS NOT NULL AND version IS NOT NULL))
);
CREATE TABLE home_page_versions (
  project_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  entry TEXT NOT NULL,
  actions TEXT NOT NULL,
  files TEXT NOT NULL,
  author TEXT NOT NULL CHECK (author IN ('assistant', 'person')),
  based_on INTEGER,
  origin TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, page_id, version)
);
CREATE TABLE home_page_blobs (
  project_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (project_id, sha256)
);
CREATE TABLE home_page_approvals (
  project_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  approved_actions TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  PRIMARY KEY (project_id, page_id, version)
);
CREATE TABLE home_page_receipts (
  project_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('draft_adopt', 'approval', 'select')),
  operation TEXT NOT NULL,
  request_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  receipt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, actor_id, kind, operation, request_id)
);
CREATE TABLE home_page_pruned (
  project_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  pruned_at TEXT NOT NULL,
  PRIMARY KEY (project_id, page_id, version)
);

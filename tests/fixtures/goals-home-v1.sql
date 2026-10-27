-- PG-094 S13: accepted new Home schema, preserving the source catalog's personal-method columns.
-- This is a normative v1 fixture, not a schema captured from a real Home.
CREATE TABLE personal_planning_method_packs (
  method_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  pack_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Frozen complete current baseline (batch 61, §13.7); test-only schema, no real Home receipt.
CREATE TABLE web_search_default (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  source_id TEXT NOT NULL,
  updated_at TEXT NOT NULL);
CREATE TABLE web_search_last_use (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  account_label TEXT,
  audience TEXT NOT NULL,
  used_at TEXT NOT NULL);

-- Frozen complete current baseline (batch 106, specs/unified-partition-plugins); test-only schema, no real Home receipt.
CREATE TABLE due_entries (
  install_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  partition_id TEXT NOT NULL,
  entry_key TEXT NOT NULL CHECK (length(entry_key) BETWEEN 1 AND 200),
  due_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('plugin', 'overview')),
  registered_at TEXT NOT NULL,
  PRIMARY KEY (install_id, partition_id, source, entry_key)
);
CREATE INDEX due_entries_due ON due_entries (due_at);
CREATE INDEX due_entries_partition ON due_entries (partition_id);
CREATE TABLE due_done (
  install_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  partition_id TEXT NOT NULL,
  entry_key TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('plugin', 'overview')),
  due_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('woken', 'expired')),
  done_at TEXT NOT NULL,
  PRIMARY KEY (install_id, partition_id, source, entry_key, due_at)
);
CREATE INDEX due_done_at ON due_done (done_at);

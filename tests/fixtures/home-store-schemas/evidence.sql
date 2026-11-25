-- Frozen complete current baseline (batch 106, specs/unified-partition-plugins); test-only schema, no real Home receipt.
CREATE TABLE evidence_holds (
  content_ref TEXT NOT NULL CHECK (length(content_ref) BETWEEN 1 AND 200),
  partition_id TEXT NOT NULL,
  owner_install TEXT NOT NULL,
  holder_key TEXT NOT NULL CHECK (length(holder_key) BETWEEN 1 AND 200),
  held_at TEXT NOT NULL,
  PRIMARY KEY (content_ref, partition_id, owner_install, holder_key)
);
CREATE INDEX evidence_holds_by_holder ON evidence_holds (partition_id, owner_install, holder_key);
CREATE INDEX evidence_holds_by_install ON evidence_holds (owner_install);

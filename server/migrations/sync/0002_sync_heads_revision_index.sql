-- Covering index for /v1/round MAX(h.revision) per (space, namespace) so head polling stays O(log N)
-- as tombstoned and purged sync_heads rows accumulate.
CREATE INDEX IF NOT EXISTS sync_heads_revision ON sync_heads(space, namespace, revision);

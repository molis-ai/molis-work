-- Same-version structure for the process-items cutover (specs/batch-06-shared-tools/current-version-adoption.md). The baseline stays v6:
-- a fresh database runs 0001 then this file; an existing v6 database gets this file only through a separately approved maintenance window.
-- quota::check_schema compares every object below with what the database holds, so an old v6 or a partial adoption is refused.
-- A failed condition inside a batch inserts its code here; the trigger aborts the whole batch, so a zero-row update can never pass silently.
CREATE TABLE sync_checks (code TEXT NOT NULL);
CREATE TRIGGER sync_checks_raise BEFORE INSERT ON sync_checks BEGIN
  SELECT RAISE(ABORT, NEW.code);
END;
-- One open plan per account: the exact members fixed before the seal, each converted by the Host owner and frozen here.
CREATE TABLE sync_cutover_plans (
  space TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL UNIQUE,
  policy_revision INTEGER NOT NULL,
  source_head INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()*1000)
);
CREATE TABLE sync_cutover_items (
  space TEXT NOT NULL,plan_id TEXT NOT NULL,key TEXT NOT NULL,source_revision INTEGER NOT NULL,
  operation TEXT NOT NULL,value TEXT NOT NULL,attachments TEXT NOT NULL,fingerprint TEXT NOT NULL,
  content_bytes INTEGER GENERATED ALWAYS AS (length(CAST(value AS BLOB))) STORED,
  CHECK(value<>'null' AND length(CAST(value AS BLOB))<=524288),
  PRIMARY KEY(space,key),UNIQUE(space,operation),
  FOREIGN KEY(plan_id) REFERENCES sync_cutover_plans(plan_id) ON DELETE CASCADE
);
-- The permanent seal. namespace is the private stream derived from cutover_id; it is never accepted from a request.
CREATE TABLE sync_cutovers (
  space TEXT PRIMARY KEY,
  cutover_id TEXT NOT NULL UNIQUE,
  namespace TEXT NOT NULL UNIQUE,
  sealed_policy_revision INTEGER NOT NULL,
  source_head INTEGER NOT NULL,
  reserved_bytes INTEGER NOT NULL CHECK(reserved_bytes>=0),
  consent_revision INTEGER NOT NULL CHECK(consent_revision>=1),
  adopting INTEGER NOT NULL CHECK(adopting IN (0,1)),
  history_read INTEGER NOT NULL CHECK(history_read IN (0,1)),
  selected INTEGER NOT NULL CHECK(selected IN (0,1)),
  completion_head INTEGER,
  completed_at INTEGER,
  sealed_at INTEGER NOT NULL DEFAULT (unixepoch()*1000)
);
-- Blob generations the sealed stream referenced: another collection reaches them only through a reference of its own.
CREATE TABLE sync_cutover_blobs (
  space TEXT NOT NULL,digest TEXT NOT NULL,generation TEXT NOT NULL,
  PRIMARY KEY(space,digest,generation)
);
DROP TRIGGER sync_blob_admission;
CREATE TRIGGER sync_blob_admission BEFORE INSERT ON sync_blobs BEGIN
  SELECT CASE WHEN COALESCE((SELECT used_bytes FROM sync_usage WHERE space=NEW.space),0)+COALESCE((SELECT reserved_bytes FROM sync_cutovers WHERE space=NEW.space),0)>100000000-NEW.size
    THEN RAISE(ABORT,'SYNC_QUOTA_EXCEEDED') END;
END;
DROP TRIGGER sync_events_validate;
-- Cutover checks run first, so a sealed or private stream always answers with its own code. A seed is an operation the seed route derives
-- inside a private stream; anywhere else a "seed:" prefix is ordinary. The sealed public stream takes no new event, though exact receipts still replay.
CREATE TRIGGER sync_events_validate BEFORE INSERT ON sync_events BEGIN
  SELECT CASE WHEN NEW.namespace='["io.molis.work.artifacts","molis","official-artifacts-binding","process_items",1]' AND EXISTS(SELECT 1 FROM sync_cutovers WHERE space=NEW.space)
    THEN RAISE(ABORT,'SYNC_COLLECTION_SEALED') END;
  SELECT CASE WHEN NEW.namespace LIKE '["process_items_adopted",%' AND NOT EXISTS(SELECT 1 FROM sync_cutovers WHERE space=NEW.space AND namespace=NEW.namespace)
    THEN RAISE(ABORT,'SYNC_CUTOVER_SCOPE') END;
  SELECT CASE WHEN NEW.namespace LIKE '["process_items_adopted",%' AND NEW.operation LIKE 'seed:%' AND NOT EXISTS(
    SELECT 1 FROM sync_cutovers c JOIN sync_cutover_items i ON i.space=c.space AND i.plan_id=c.cutover_id
    WHERE c.space=NEW.space AND c.namespace=NEW.namespace AND c.completed_at IS NULL AND c.adopting=1
      AND i.key=NEW.key AND i.operation=NEW.operation AND i.value=NEW.value AND i.attachments=NEW.attachments AND i.fingerprint=NEW.fingerprint
      AND NEW.base=0 AND NEW.action='write'
      AND EXISTS(SELECT 1 FROM sync_heads h WHERE h.space=c.space AND h.namespace='["io.molis.work.artifacts","molis","official-artifacts-binding","process_items",1]' AND h.key=i.key AND h.revision=i.source_revision AND h.deleted_at IS NULL AND h.purged_at IS NULL)
  ) THEN RAISE(ABORT,'SYNC_SEED_MISMATCH') END;
  SELECT CASE WHEN NEW.namespace LIKE '["process_items_adopted",%' AND NEW.operation NOT LIKE 'seed:%' AND EXISTS(SELECT 1 FROM sync_cutovers WHERE space=NEW.space AND namespace=NEW.namespace AND completed_at IS NULL)
    THEN RAISE(ABORT,'SYNC_CUTOVER_SEEDING') END;
  SELECT CASE WHEN NEW.namespace LIKE '["process_items_adopted",%' AND NEW.operation NOT LIKE 'seed:%'
    AND NOT EXISTS(SELECT 1 FROM sync_heads WHERE space=NEW.space AND namespace=NEW.namespace AND key=NEW.key)
    AND EXISTS(SELECT 1 FROM sync_heads WHERE space=NEW.space AND namespace='["io.molis.work.artifacts","molis","official-artifacts-binding","process_items",1]' AND key=NEW.key)
    THEN RAISE(ABORT,'SYNC_ITEM_RETIRED') END;
  SELECT CASE WHEN NOT (NEW.namespace LIKE '["process_items_adopted",%' AND NEW.operation LIKE 'seed:%') AND EXISTS(
    SELECT 1 FROM json_each(NEW.attachments) ref
      JOIN sync_cutover_blobs p ON p.space=NEW.space AND p.digest=json_extract(ref.value,'$.digest')
      JOIN sync_blobs b ON b.space=p.space AND b.digest=p.digest AND b.generation=p.generation
    WHERE NOT EXISTS(SELECT 1 FROM sync_events e,json_each(e.attachments) held WHERE e.space=NEW.space AND e.namespace=NEW.namespace AND json_extract(held.value,'$.digest')=p.digest)
  ) THEN RAISE(ABORT,'SYNC_BLOB_NOT_READY') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM sync_policy p, json_each(p.namespaces) n
    WHERE p.space=NEW.space AND p.revision=NEW.policy_revision AND n.value=NEW.namespace
  ) THEN RAISE(ABORT, 'SYNC_POLICY_CONFLICT') END;
  SELECT CASE WHEN COALESCE((SELECT revision FROM sync_heads WHERE space=NEW.space AND namespace=NEW.namespace AND key=NEW.key),0)<>NEW.base
    THEN RAISE(ABORT, 'SYNC_VERSION_CONFLICT') END;
  SELECT CASE WHEN NEW.source_revision IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sync_events source WHERE source.space=NEW.space AND source.namespace=NEW.namespace AND source.key=NEW.key AND source.revision=NEW.source_revision)
    THEN RAISE(ABORT,'SYNC_RECOVERY_MISSING') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM sync_heads WHERE space=NEW.space AND namespace=NEW.namespace AND key=NEW.key AND purged_at IS NOT NULL)
    THEN RAISE(ABORT,'SYNC_ITEM_PURGED') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM sync_heads WHERE space=NEW.space AND namespace=NEW.namespace AND key=NEW.key AND deleted_at IS NOT NULL AND deleted_at<=unixepoch()*1000-2592000000) AND NEW.value<>'null'
    THEN RAISE(ABORT,'SYNC_ITEM_EXPIRED') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.attachments) ref WHERE NOT EXISTS (
      SELECT 1 FROM sync_blobs b WHERE b.space=NEW.space AND b.digest=json_extract(ref.value,'$.digest')
        AND b.size=json_extract(ref.value,'$.size') AND b.ready=1 AND b.deleting=0
    )
  ) THEN RAISE(ABORT,'SYNC_BLOB_NOT_READY') END;
  SELECT CASE WHEN NEW.content_bytes>0 AND NOT (NEW.namespace LIKE '["process_items_adopted",%' AND NEW.operation LIKE 'seed:%') AND COALESCE((SELECT used_bytes FROM sync_usage WHERE space=NEW.space),0)+COALESCE((SELECT reserved_bytes FROM sync_cutovers WHERE space=NEW.space),0)>100000000-NEW.content_bytes
    THEN RAISE(ABORT, 'SYNC_QUOTA_EXCEEDED') END;
END;
-- A seed spends what begin reserved for it; ordinary writes never touch the reservation.
CREATE TRIGGER sync_events_seeded AFTER INSERT ON sync_events WHEN NEW.namespace LIKE '["process_items_adopted",%' AND NEW.operation LIKE 'seed:%' BEGIN
  UPDATE sync_cutovers SET reserved_bytes=MAX(0,reserved_bytes-NEW.content_bytes) WHERE space=NEW.space AND namespace=NEW.namespace;
END;

-- Current D1 baseline v6. No in-request schema creation or old-version fallback.
CREATE TABLE sync_schema (version INTEGER PRIMARY KEY CHECK(version=6));
INSERT INTO sync_schema(version) VALUES (6);
CREATE TABLE sync_usage (
  space TEXT PRIMARY KEY,
  used_bytes INTEGER NOT NULL CHECK(used_bytes>=0)
);
CREATE TABLE sync_policy (
  space TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  json TEXT NOT NULL,
  namespaces TEXT NOT NULL
);
CREATE TABLE sync_blobs (
  space TEXT NOT NULL,digest TEXT NOT NULL,size INTEGER NOT NULL CHECK(size>0 AND size<=100000000),
  ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN (0,1)),
  generation TEXT NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  deleting INTEGER NOT NULL DEFAULT 0 CHECK(deleting IN (0,1)),
  PRIMARY KEY(space,digest),UNIQUE(space,digest,generation)
);
CREATE TABLE sync_blob_parts (
  space TEXT NOT NULL,digest TEXT NOT NULL,part INTEGER NOT NULL,checksum TEXT NOT NULL,generation TEXT NOT NULL,
  PRIMARY KEY(space,digest,part),FOREIGN KEY(space,digest,generation) REFERENCES sync_blobs(space,digest,generation)
);
CREATE TRIGGER sync_blob_admission BEFORE INSERT ON sync_blobs BEGIN
  SELECT CASE WHEN COALESCE((SELECT used_bytes FROM sync_usage WHERE space=NEW.space),0)>100000000-NEW.size
    THEN RAISE(ABORT,'SYNC_QUOTA_EXCEEDED') END;
END;
CREATE TRIGGER sync_blob_charge AFTER INSERT ON sync_blobs BEGIN
  INSERT INTO sync_usage VALUES(NEW.space,NEW.size) ON CONFLICT(space) DO UPDATE SET used_bytes=used_bytes+excluded.used_bytes;
END;
CREATE TRIGGER sync_blob_release AFTER DELETE ON sync_blobs BEGIN
  UPDATE sync_usage SET used_bytes=used_bytes-OLD.size WHERE space=OLD.space;
END;
CREATE TABLE sync_receipts (
  space TEXT NOT NULL,namespace TEXT NOT NULL,operation TEXT NOT NULL,fingerprint TEXT NOT NULL,
  revision INTEGER NOT NULL,key TEXT NOT NULL,base INTEGER NOT NULL,action TEXT NOT NULL,source_revision INTEGER,PRIMARY KEY(space,namespace,operation)
);
CREATE TABLE sync_gc_jobs (
  space TEXT NOT NULL,digest TEXT NOT NULL,generation TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','done')),
  PRIMARY KEY(space,digest,generation)
);
CREATE TABLE sync_maintenance_state (id INTEGER PRIMARY KEY CHECK(id=1),cursor TEXT);
CREATE TABLE sync_rate_windows (bucket TEXT PRIMARY KEY,window INTEGER NOT NULL,hits INTEGER NOT NULL);
CREATE TABLE sync_events (
  revision INTEGER PRIMARY KEY AUTOINCREMENT,
  space TEXT NOT NULL,
  namespace TEXT NOT NULL,
  operation TEXT NOT NULL,
  key TEXT NOT NULL,
  base INTEGER NOT NULL,
  value TEXT NOT NULL,
  attachments TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'write' CHECK(action IN ('write','restore','archive')),
  source_revision INTEGER CHECK(source_revision IS NULL OR action='restore'),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  content_bytes INTEGER GENERATED ALWAYS AS (CASE WHEN value='null' THEN 0 ELSE length(CAST(value AS BLOB)) END) STORED,
  policy_revision INTEGER NOT NULL,
  CHECK(length(CAST(value AS BLOB))<=524288),
  UNIQUE(space, namespace, operation),
  UNIQUE(space,namespace,key,revision)
);
CREATE INDEX sync_events_pull ON sync_events(space, namespace, revision);
CREATE TABLE sync_history_pins (
  space TEXT NOT NULL,namespace TEXT NOT NULL,key TEXT NOT NULL,revision INTEGER NOT NULL,
  retained_at INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  PRIMARY KEY(space,namespace,revision),
  FOREIGN KEY(space,namespace,key,revision) REFERENCES sync_events(space,namespace,key,revision) ON DELETE CASCADE
);
-- Previous owner-consistent graphs survive for 30 days from replacement, not from their original creation.
CREATE TABLE sync_version_retention (
  space TEXT NOT NULL,namespace TEXT NOT NULL,key TEXT NOT NULL,revision INTEGER NOT NULL,
  retained_until INTEGER NOT NULL,
  PRIMARY KEY(space,namespace,revision),
  FOREIGN KEY(space,namespace,key,revision) REFERENCES sync_events(space,namespace,key,revision) ON DELETE CASCADE
);
CREATE INDEX sync_version_retention_deadline ON sync_version_retention(retained_until);
CREATE TABLE sync_heads (
  space TEXT NOT NULL, namespace TEXT NOT NULL, key TEXT NOT NULL, revision INTEGER NOT NULL,
  deleted_at INTEGER,purged_at INTEGER,
  PRIMARY KEY(space, namespace, key)
);
CREATE TRIGGER sync_events_validate BEFORE INSERT ON sync_events BEGIN
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
  SELECT CASE WHEN NEW.content_bytes>0 AND COALESCE((SELECT used_bytes FROM sync_usage WHERE space=NEW.space),0)>100000000-NEW.content_bytes
    THEN RAISE(ABORT, 'SYNC_QUOTA_EXCEEDED') END;
END;
CREATE TRIGGER sync_events_commit AFTER INSERT ON sync_events BEGIN
  INSERT INTO sync_version_retention(space,namespace,key,revision,retained_until)
    SELECT h.space,h.namespace,h.key,h.revision,NEW.created_at+2592000000 FROM sync_heads h
    WHERE h.space=NEW.space AND h.namespace=NEW.namespace AND h.key=NEW.key AND NEW.action<>'archive'
    ON CONFLICT(space,namespace,revision) DO UPDATE SET retained_until=MAX(sync_version_retention.retained_until,excluded.retained_until);
  INSERT INTO sync_heads SELECT NEW.space,NEW.namespace,NEW.key,NEW.revision,CASE WHEN NEW.value='null' THEN NEW.created_at ELSE NULL END,NULL WHERE NEW.action<>'archive'
    ON CONFLICT(space,namespace,key) DO UPDATE SET revision=excluded.revision,
      deleted_at=CASE WHEN excluded.deleted_at IS NULL THEN NULL ELSE COALESCE(sync_heads.deleted_at,excluded.deleted_at) END;
  INSERT INTO sync_receipts VALUES (NEW.space,NEW.namespace,NEW.operation,NEW.fingerprint,NEW.revision,NEW.key,NEW.base,NEW.action,NEW.source_revision);
  INSERT INTO sync_history_pins(space,namespace,key,revision) SELECT NEW.space,NEW.namespace,NEW.key,NEW.revision WHERE NEW.action='archive';
  INSERT INTO sync_usage VALUES (NEW.space,NEW.content_bytes)
    ON CONFLICT(space) DO UPDATE SET used_bytes=used_bytes+excluded.used_bytes;
END;
CREATE TRIGGER sync_events_immutable BEFORE UPDATE ON sync_events BEGIN
  SELECT RAISE(ABORT, 'SYNC_EVENTS_IMMUTABLE');
END;
CREATE TRIGGER sync_events_release AFTER DELETE ON sync_events BEGIN
  UPDATE sync_usage SET used_bytes=used_bytes-OLD.content_bytes WHERE space=OLD.space;
END;

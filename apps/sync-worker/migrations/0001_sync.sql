CREATE TABLE sync_policy (
  space TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  json TEXT NOT NULL,
  namespaces TEXT NOT NULL
);
CREATE TABLE sync_events (
  revision INTEGER PRIMARY KEY AUTOINCREMENT,
  space TEXT NOT NULL,
  namespace TEXT NOT NULL,
  operation TEXT NOT NULL,
  key TEXT NOT NULL,
  base INTEGER NOT NULL,
  value TEXT NOT NULL,
  policy_revision INTEGER NOT NULL,
  UNIQUE(space, namespace, operation)
);
CREATE INDEX sync_events_pull ON sync_events(space, namespace, revision);
CREATE TABLE sync_heads (
  space TEXT NOT NULL, namespace TEXT NOT NULL, key TEXT NOT NULL, revision INTEGER NOT NULL,
  PRIMARY KEY(space, namespace, key)
);
CREATE TRIGGER sync_events_validate BEFORE INSERT ON sync_events BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM sync_policy p, json_each(p.namespaces) n
    WHERE p.space=NEW.space AND p.revision=NEW.policy_revision AND n.value=NEW.namespace
  ) THEN RAISE(ABORT, 'SYNC_POLICY_CONFLICT') END;
  SELECT CASE WHEN COALESCE((SELECT revision FROM sync_heads WHERE space=NEW.space AND namespace=NEW.namespace AND key=NEW.key),0)<>NEW.base
    THEN RAISE(ABORT, 'SYNC_VERSION_CONFLICT') END;
END;
CREATE TRIGGER sync_events_commit AFTER INSERT ON sync_events BEGIN
  INSERT INTO sync_heads VALUES (NEW.space,NEW.namespace,NEW.key,NEW.revision)
    ON CONFLICT(space,namespace,key) DO UPDATE SET revision=excluded.revision;
END;

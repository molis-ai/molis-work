-- Frozen complete current baseline; test-only schema, no real Home receipt.

 CREATE TABLE pages_editor_versions(id TEXT PRIMARY KEY,version INTEGER NOT NULL);
  CREATE TABLE pages (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    body_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL,
    folder_id TEXT NOT NULL DEFAULT '',
    starred INTEGER NOT NULL DEFAULT 0,
    goal_id TEXT NOT NULL DEFAULT '',
    artifact_id TEXT NOT NULL DEFAULT '',
    artifact_version INTEGER NOT NULL DEFAULT 0,
    publication_pending_json TEXT
  );
  CREATE TABLE page_comments (page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE, thread_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(page_id,thread_id));
  CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE page_generations (project_id TEXT NOT NULL, request_id TEXT NOT NULL, updated_at TEXT NOT NULL, record_json TEXT NOT NULL, PRIMARY KEY(project_id, request_id));
  -- What an edit by an agent or a workflow replaced, kept a while so the person can take that edit back (single use).
  CREATE TABLE page_changes (change_id TEXT PRIMARY KEY, page_id TEXT NOT NULL, to_version INTEGER NOT NULL, before_json TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE page_imports (project_id TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL, document_ids_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(project_id, request_id));


    CREATE TABLE IF NOT EXISTS sync_1d900c4780ba07531e907e8a3c59_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sync_1d900c4780ba07531e907e8a3c59_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sync_1d900c4780ba07531e907e8a3c59_replica_changes_key ON sync_1d900c4780ba07531e907e8a3c59_replica_changes(key);
    CREATE TABLE IF NOT EXISTS sync_1d900c4780ba07531e907e8a3c59_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_1d900c4780ba07531e907e8a3c59_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_1d900c4780ba07531e907e8a3c59_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sync_1d900c4780ba07531e907e8a3c59_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);

CREATE TABLE sync_1d900c4780ba07531e907e8a3c59_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_1d900c4780ba07531e907e8a3c59_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
INSERT INTO sync_1d900c4780ba07531e907e8a3c59_context(id,project_id) VALUES(1,NULL);
INSERT INTO sync_1d900c4780ba07531e907e8a3c59_replica_state(id,device) VALUES(1,lower(hex(randomblob(16))));
CREATE TRIGGER "sync_1d900c4780ba07531e907e8a3c59_track_0_insert" AFTER INSERT ON "folders" BEGIN INSERT INTO sync_1d900c4780ba07531e907e8a3c59_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'folder',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_1d900c4780ba07531e907e8a3c59_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_1d900c4780ba07531e907e8a3c59_track_0_update" AFTER UPDATE ON "folders" BEGIN INSERT INTO sync_1d900c4780ba07531e907e8a3c59_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'folder',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_1d900c4780ba07531e907e8a3c59_replica_state WHERE id=1)=0;INSERT INTO sync_1d900c4780ba07531e907e8a3c59_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'folder',OLD."id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'folder',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_1d900c4780ba07531e907e8a3c59_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_1d900c4780ba07531e907e8a3c59_track_0_delete" AFTER DELETE ON "folders" BEGIN INSERT INTO sync_1d900c4780ba07531e907e8a3c59_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'folder',OLD."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_1d900c4780ba07531e907e8a3c59_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_1d900c4780ba07531e907e8a3c59_track_1_insert" AFTER INSERT ON "pages" BEGIN INSERT INTO sync_1d900c4780ba07531e907e8a3c59_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'document',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_1d900c4780ba07531e907e8a3c59_replica_state WHERE id=1)=0;INSERT INTO "pages_editor_versions" ("id","version") SELECT NEW."id",NEW."version" WHERE 1=1 ON CONFLICT ("id") DO UPDATE SET "version"=MAX("version",excluded."version"); END;
CREATE TRIGGER "sync_1d900c4780ba07531e907e8a3c59_track_1_update" AFTER UPDATE ON "pages" BEGIN INSERT INTO sync_1d900c4780ba07531e907e8a3c59_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'document',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_1d900c4780ba07531e907e8a3c59_replica_state WHERE id=1)=0;INSERT INTO sync_1d900c4780ba07531e907e8a3c59_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'document',OLD."id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'document',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_1d900c4780ba07531e907e8a3c59_replica_state WHERE id=1)=0;INSERT INTO "pages_editor_versions" ("id","version") SELECT NEW."id",NEW."version" WHERE 1=1 ON CONFLICT ("id") DO UPDATE SET "version"=MAX("version",excluded."version"); END;
CREATE TRIGGER "sync_1d900c4780ba07531e907e8a3c59_track_1_delete" AFTER DELETE ON "pages" BEGIN INSERT INTO sync_1d900c4780ba07531e907e8a3c59_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'document',OLD."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_1d900c4780ba07531e907e8a3c59_replica_state WHERE id=1)=0; END;

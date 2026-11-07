-- Frozen complete current baseline; test-only schema, no real Home receipt.
CREATE TABLE issues (
    id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
    type TEXT NOT NULL CHECK(type IN ('bug','experience','feature')), description TEXT NOT NULL CHECK(length(description) <= 100000),
    context_json TEXT NOT NULL, images_json TEXT NOT NULL, submitter_id TEXT NOT NULL,
    entered_via TEXT NOT NULL CHECK(entered_via IN ('manual','assistant','mcp')),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL CHECK(version >= 1)
  ); CREATE INDEX issues_by_submitter_created ON issues(submitter_id,created_at DESC,id DESC); CREATE TABLE issue_editor_versions(id TEXT PRIMARY KEY,version INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS sync_547a53110031b73814823e489835_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sync_547a53110031b73814823e489835_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sync_547a53110031b73814823e489835_replica_changes_key ON sync_547a53110031b73814823e489835_replica_changes(key);
    CREATE TABLE IF NOT EXISTS sync_547a53110031b73814823e489835_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_547a53110031b73814823e489835_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_547a53110031b73814823e489835_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sync_547a53110031b73814823e489835_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);

CREATE TABLE sync_547a53110031b73814823e489835_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_547a53110031b73814823e489835_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
INSERT INTO sync_547a53110031b73814823e489835_context(id,project_id) VALUES(1,NULL);
INSERT INTO sync_547a53110031b73814823e489835_replica_state(id,device) VALUES(1,lower(hex(randomblob(16))));
CREATE TRIGGER "sync_547a53110031b73814823e489835_track_0_insert" AFTER INSERT ON "issues" BEGIN INSERT INTO sync_547a53110031b73814823e489835_replica_changes(key) SELECT key FROM (SELECT json_array('issue',NEW."id") AS key WHERE NEW."submitter_id" IS json_extract((SELECT descriptor FROM molis_storage_space WHERE singleton=1),'$.ownerUserId')) WHERE (SELECT applying FROM sync_547a53110031b73814823e489835_replica_state WHERE id=1)=0;INSERT INTO "issue_editor_versions" ("id","version") SELECT NEW."id",NEW."version" WHERE NEW."submitter_id" IS json_extract((SELECT descriptor FROM molis_storage_space WHERE singleton=1),'$.ownerUserId') ON CONFLICT ("id") DO UPDATE SET "version"=MAX("version",excluded."version"); END;
CREATE TRIGGER "sync_547a53110031b73814823e489835_track_0_update" AFTER UPDATE ON "issues" BEGIN INSERT INTO sync_547a53110031b73814823e489835_replica_changes(key) SELECT key FROM (SELECT json_array('issue',NEW."id") AS key WHERE NEW."submitter_id" IS json_extract((SELECT descriptor FROM molis_storage_space WHERE singleton=1),'$.ownerUserId')) WHERE (SELECT applying FROM sync_547a53110031b73814823e489835_replica_state WHERE id=1)=0;INSERT INTO sync_547a53110031b73814823e489835_replica_changes(key) SELECT key FROM (SELECT json_array('issue',OLD."id") AS key WHERE OLD."submitter_id" IS json_extract((SELECT descriptor FROM molis_storage_space WHERE singleton=1),'$.ownerUserId') EXCEPT SELECT json_array('issue',NEW."id") AS key WHERE NEW."submitter_id" IS json_extract((SELECT descriptor FROM molis_storage_space WHERE singleton=1),'$.ownerUserId')) WHERE (SELECT applying FROM sync_547a53110031b73814823e489835_replica_state WHERE id=1)=0;INSERT INTO "issue_editor_versions" ("id","version") SELECT NEW."id",NEW."version" WHERE NEW."submitter_id" IS json_extract((SELECT descriptor FROM molis_storage_space WHERE singleton=1),'$.ownerUserId') ON CONFLICT ("id") DO UPDATE SET "version"=MAX("version",excluded."version"); END;
CREATE TRIGGER "sync_547a53110031b73814823e489835_track_0_delete" AFTER DELETE ON "issues" BEGIN INSERT INTO sync_547a53110031b73814823e489835_replica_changes(key) SELECT key FROM (SELECT json_array('issue',OLD."id") AS key WHERE OLD."submitter_id" IS json_extract((SELECT descriptor FROM molis_storage_space WHERE singleton=1),'$.ownerUserId')) WHERE (SELECT applying FROM sync_547a53110031b73814823e489835_replica_state WHERE id=1)=0; END;

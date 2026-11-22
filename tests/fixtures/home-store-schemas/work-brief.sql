  CREATE TABLE briefs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL DEFAULT '',
    actor_id TEXT NOT NULL DEFAULT '',
    scope TEXT NOT NULL CHECK (scope IN ('home', 'topic', 'personal')),
    title TEXT NOT NULL,
    current_version INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    fixed_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    artifact_id TEXT NOT NULL DEFAULT '',
    artifact_version INTEGER NOT NULL DEFAULT 0,
    publication_pending_json TEXT
  );
  CREATE UNIQUE INDEX briefs_project_home ON briefs (project_id) WHERE scope = 'home';
  CREATE UNIQUE INDEX briefs_personal ON briefs (actor_id) WHERE scope = 'personal';
  CREATE INDEX briefs_project ON briefs (project_id, updated_at);
  CREATE TABLE brief_versions (
    brief_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    base_version INTEGER,
    as_of TEXT NOT NULL,
    created_at TEXT NOT NULL,
    produced_by_json TEXT NOT NULL,
    body_json TEXT NOT NULL,
    PRIMARY KEY (brief_id, version)
  );
  CREATE TABLE brief_edits (
    id TEXT PRIMARY KEY,
    brief_id TEXT NOT NULL,
    claim_id TEXT NOT NULL,
    text TEXT,
    base_version INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    at TEXT NOT NULL
  );
  CREATE INDEX brief_edits_brief ON brief_edits (brief_id, at);
  CREATE TABLE brief_proposals (
    id TEXT PRIMARY KEY,
    brief_id TEXT NOT NULL UNIQUE,
    base_version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    produced_by_json TEXT NOT NULL,
    body_json TEXT NOT NULL,
    conflicts_json TEXT NOT NULL
  );
  CREATE TABLE brief_next_marks (
    brief_id TEXT NOT NULL,
    option_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('later', 'handed', 'running', 'done', 'failed', 'stale')),
    card_json TEXT,
    actor_id TEXT NOT NULL,
    at TEXT NOT NULL,
    PRIMARY KEY (brief_id, option_id)
  );
  CREATE TABLE brief_requests (
    project_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    result_json TEXT NOT NULL,
    at TEXT NOT NULL,
    PRIMARY KEY (project_id, actor_id, request_id)
  );
  CREATE TABLE brief_editor_versions (id TEXT NOT NULL, project_id TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY (id, project_id));


    CREATE TABLE IF NOT EXISTS sync_99b05d64d7577ed2f59d3aae7365_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sync_99b05d64d7577ed2f59d3aae7365_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sync_99b05d64d7577ed2f59d3aae7365_replica_changes_key ON sync_99b05d64d7577ed2f59d3aae7365_replica_changes(key);
    CREATE TABLE IF NOT EXISTS sync_99b05d64d7577ed2f59d3aae7365_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_99b05d64d7577ed2f59d3aae7365_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_99b05d64d7577ed2f59d3aae7365_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sync_99b05d64d7577ed2f59d3aae7365_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);

CREATE TABLE sync_99b05d64d7577ed2f59d3aae7365_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_99b05d64d7577ed2f59d3aae7365_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_context(id,project_id) VALUES(1,NULL);
INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_replica_state(id,device) VALUES(1,lower(hex(randomblob(16))));
CREATE TRIGGER "sync_99b05d64d7577ed2f59d3aae7365_track_0_insert" AFTER INSERT ON "briefs" BEGIN INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'brief',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_99b05d64d7577ed2f59d3aae7365_replica_state WHERE id=1)=0;INSERT INTO "brief_editor_versions" ("id","project_id","version") SELECT NEW."id",NEW."project_id",NEW."version" WHERE 1=1 ON CONFLICT ("id","project_id") DO UPDATE SET "version"=MAX("version",excluded."version"); END;
CREATE TRIGGER "sync_99b05d64d7577ed2f59d3aae7365_track_0_update" AFTER UPDATE ON "briefs" BEGIN INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'brief',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_99b05d64d7577ed2f59d3aae7365_replica_state WHERE id=1)=0;INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'brief',OLD."id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'brief',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_99b05d64d7577ed2f59d3aae7365_replica_state WHERE id=1)=0;INSERT INTO "brief_editor_versions" ("id","project_id","version") SELECT NEW."id",NEW."project_id",NEW."version" WHERE 1=1 ON CONFLICT ("id","project_id") DO UPDATE SET "version"=MAX("version",excluded."version"); END;
CREATE TRIGGER "sync_99b05d64d7577ed2f59d3aae7365_track_0_delete" AFTER DELETE ON "briefs" BEGIN INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'brief',OLD."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_99b05d64d7577ed2f59d3aae7365_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_99b05d64d7577ed2f59d3aae7365_track_1_insert" AFTER INSERT ON "brief_versions" BEGIN INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'brief',sync_parent."id") AS key FROM "briefs" AS sync_parent WHERE 1=1 AND sync_parent."id"=NEW."brief_id") WHERE (SELECT applying FROM sync_99b05d64d7577ed2f59d3aae7365_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_99b05d64d7577ed2f59d3aae7365_track_1_update" AFTER UPDATE ON "brief_versions" BEGIN INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'brief',sync_parent."id") AS key FROM "briefs" AS sync_parent WHERE 1=1 AND sync_parent."id"=NEW."brief_id") WHERE (SELECT applying FROM sync_99b05d64d7577ed2f59d3aae7365_replica_state WHERE id=1)=0;INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'brief',sync_parent."id") AS key FROM "briefs" AS sync_parent WHERE 1=1 AND sync_parent."id"=OLD."brief_id" EXCEPT SELECT json_array(sync_parent."project_id",'brief',sync_parent."id") AS key FROM "briefs" AS sync_parent WHERE 1=1 AND sync_parent."id"=NEW."brief_id") WHERE (SELECT applying FROM sync_99b05d64d7577ed2f59d3aae7365_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_99b05d64d7577ed2f59d3aae7365_track_1_delete" AFTER DELETE ON "brief_versions" BEGIN INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'brief',sync_parent."id") AS key FROM "briefs" AS sync_parent WHERE 1=1 AND sync_parent."id"=OLD."brief_id") WHERE (SELECT applying FROM sync_99b05d64d7577ed2f59d3aae7365_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_99b05d64d7577ed2f59d3aae7365_track_2_insert" AFTER INSERT ON "brief_edits" BEGIN INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'brief',sync_parent."id") AS key FROM "briefs" AS sync_parent WHERE 1=1 AND sync_parent."id"=NEW."brief_id") WHERE (SELECT applying FROM sync_99b05d64d7577ed2f59d3aae7365_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_99b05d64d7577ed2f59d3aae7365_track_2_update" AFTER UPDATE ON "brief_edits" BEGIN INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'brief',sync_parent."id") AS key FROM "briefs" AS sync_parent WHERE 1=1 AND sync_parent."id"=NEW."brief_id") WHERE (SELECT applying FROM sync_99b05d64d7577ed2f59d3aae7365_replica_state WHERE id=1)=0;INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'brief',sync_parent."id") AS key FROM "briefs" AS sync_parent WHERE 1=1 AND sync_parent."id"=OLD."brief_id" EXCEPT SELECT json_array(sync_parent."project_id",'brief',sync_parent."id") AS key FROM "briefs" AS sync_parent WHERE 1=1 AND sync_parent."id"=NEW."brief_id") WHERE (SELECT applying FROM sync_99b05d64d7577ed2f59d3aae7365_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_99b05d64d7577ed2f59d3aae7365_track_2_delete" AFTER DELETE ON "brief_edits" BEGIN INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'brief',sync_parent."id") AS key FROM "briefs" AS sync_parent WHERE 1=1 AND sync_parent."id"=OLD."brief_id") WHERE (SELECT applying FROM sync_99b05d64d7577ed2f59d3aae7365_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_99b05d64d7577ed2f59d3aae7365_track_3_insert" AFTER INSERT ON "brief_proposals" BEGIN INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'brief',sync_parent."id") AS key FROM "briefs" AS sync_parent WHERE 1=1 AND sync_parent."id"=NEW."brief_id") WHERE (SELECT applying FROM sync_99b05d64d7577ed2f59d3aae7365_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_99b05d64d7577ed2f59d3aae7365_track_3_update" AFTER UPDATE ON "brief_proposals" BEGIN INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'brief',sync_parent."id") AS key FROM "briefs" AS sync_parent WHERE 1=1 AND sync_parent."id"=NEW."brief_id") WHERE (SELECT applying FROM sync_99b05d64d7577ed2f59d3aae7365_replica_state WHERE id=1)=0;INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'brief',sync_parent."id") AS key FROM "briefs" AS sync_parent WHERE 1=1 AND sync_parent."id"=OLD."brief_id" EXCEPT SELECT json_array(sync_parent."project_id",'brief',sync_parent."id") AS key FROM "briefs" AS sync_parent WHERE 1=1 AND sync_parent."id"=NEW."brief_id") WHERE (SELECT applying FROM sync_99b05d64d7577ed2f59d3aae7365_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_99b05d64d7577ed2f59d3aae7365_track_3_delete" AFTER DELETE ON "brief_proposals" BEGIN INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'brief',sync_parent."id") AS key FROM "briefs" AS sync_parent WHERE 1=1 AND sync_parent."id"=OLD."brief_id") WHERE (SELECT applying FROM sync_99b05d64d7577ed2f59d3aae7365_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_99b05d64d7577ed2f59d3aae7365_track_4_insert" AFTER INSERT ON "brief_next_marks" BEGIN INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'brief',sync_parent."id") AS key FROM "briefs" AS sync_parent WHERE 1=1 AND sync_parent."id"=NEW."brief_id") WHERE (SELECT applying FROM sync_99b05d64d7577ed2f59d3aae7365_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_99b05d64d7577ed2f59d3aae7365_track_4_update" AFTER UPDATE ON "brief_next_marks" BEGIN INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'brief',sync_parent."id") AS key FROM "briefs" AS sync_parent WHERE 1=1 AND sync_parent."id"=NEW."brief_id") WHERE (SELECT applying FROM sync_99b05d64d7577ed2f59d3aae7365_replica_state WHERE id=1)=0;INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'brief',sync_parent."id") AS key FROM "briefs" AS sync_parent WHERE 1=1 AND sync_parent."id"=OLD."brief_id" EXCEPT SELECT json_array(sync_parent."project_id",'brief',sync_parent."id") AS key FROM "briefs" AS sync_parent WHERE 1=1 AND sync_parent."id"=NEW."brief_id") WHERE (SELECT applying FROM sync_99b05d64d7577ed2f59d3aae7365_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_99b05d64d7577ed2f59d3aae7365_track_4_delete" AFTER DELETE ON "brief_next_marks" BEGIN INSERT INTO sync_99b05d64d7577ed2f59d3aae7365_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'brief',sync_parent."id") AS key FROM "briefs" AS sync_parent WHERE 1=1 AND sync_parent."id"=OLD."brief_id") WHERE (SELECT applying FROM sync_99b05d64d7577ed2f59d3aae7365_replica_state WHERE id=1)=0; END;

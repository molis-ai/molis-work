PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE page_changes (change_id TEXT PRIMARY KEY, page_id TEXT NOT NULL, to_version INTEGER NOT NULL, before_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE page_comments (page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE, thread_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(page_id,thread_id));
CREATE TABLE page_generations (project_id TEXT NOT NULL, request_id TEXT NOT NULL, updated_at TEXT NOT NULL, record_json TEXT NOT NULL, PRIMARY KEY(project_id, request_id));
CREATE TABLE page_imports (project_id TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL, document_ids_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(project_id, request_id));
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
CREATE TABLE pages_editor_versions(id TEXT PRIMARY KEY,version INTEGER NOT NULL);
CREATE TABLE sync_32ffaf99782a7333c6784e247a81_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_32ffaf99782a7333c6784e247a81_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_32ffaf99782a7333c6784e247a81_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_32ffaf99782a7333c6784e247a81_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_32ffaf99782a7333c6784e247a81_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_32ffaf99782a7333c6784e247a81_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_32ffaf99782a7333c6784e247a81_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_32ffaf99782a7333c6784e247a81_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
INSERT INTO "pages"("id","project_id","title","body_json","created_at","updated_at","version","folder_id","starred","goal_id","artifact_id","artifact_version","publication_pending_json") VALUES('627980f7-efff-4baa-9c83-600964434fc9','project-6439ad62-5652-4a40-909e-65912fa0f834','金样页面 seed 已改','{"type":"doc","content":[{"type":"paragraph"}]}','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z',2,'',0,'','',0,NULL);
INSERT INTO "pages"("id","project_id","title","body_json","created_at","updated_at","version","folder_id","starred","goal_id","artifact_id","artifact_version","publication_pending_json") VALUES('7f6819a5-0618-4635-b388-abc023d4a3b3','personal','金样摆放 seed','{"type":"doc","content":[{"type":"paragraph"}]}','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z',1,'',0,'','',0,NULL);
INSERT INTO "pages_editor_versions"("id","version") VALUES('627980f7-efff-4baa-9c83-600964434fc9',2);
INSERT INTO "pages_editor_versions"("id","version") VALUES('7f6819a5-0618-4635-b388-abc023d4a3b3',1);
INSERT INTO "sync_32ffaf99782a7333c6784e247a81_context"("id","project_id") VALUES(1,NULL);
INSERT INTO "sync_32ffaf99782a7333c6784e247a81_replica_changes"("seq","key") VALUES(1,'["project-6439ad62-5652-4a40-909e-65912fa0f834","document","627980f7-efff-4baa-9c83-600964434fc9"]');
INSERT INTO "sync_32ffaf99782a7333c6784e247a81_replica_changes"("seq","key") VALUES(2,'["project-6439ad62-5652-4a40-909e-65912fa0f834","document","627980f7-efff-4baa-9c83-600964434fc9"]');
INSERT INTO "sync_32ffaf99782a7333c6784e247a81_replica_changes"("seq","key") VALUES(3,'["personal","document","7f6819a5-0618-4635-b388-abc023d4a3b3"]');
INSERT INTO "sync_32ffaf99782a7333c6784e247a81_replica_changes"("seq","key") VALUES(4,'["project-6439ad62-5652-4a40-909e-65912fa0f834","document","7f6819a5-0618-4635-b388-abc023d4a3b3"]');
INSERT INTO "sync_32ffaf99782a7333c6784e247a81_replica_changes"("seq","key") VALUES(5,'["personal","document","7f6819a5-0618-4635-b388-abc023d4a3b3"]');
INSERT INTO "sync_32ffaf99782a7333c6784e247a81_replica_changes"("seq","key") VALUES(6,'["personal","document","7f6819a5-0618-4635-b388-abc023d4a3b3"]');
INSERT INTO "sync_32ffaf99782a7333c6784e247a81_replica_changes"("seq","key") VALUES(7,'["project-6439ad62-5652-4a40-909e-65912fa0f834","document","7f6819a5-0618-4635-b388-abc023d4a3b3"]');
INSERT INTO "sync_32ffaf99782a7333c6784e247a81_replica_state"("id","device","cursor","applying") VALUES(1,'173c40f8ccbbc544328e23878d7f8250',0,0);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('sync_32ffaf99782a7333c6784e247a81_replica_changes',7);
CREATE INDEX sync_32ffaf99782a7333c6784e247a81_replica_changes_key ON sync_32ffaf99782a7333c6784e247a81_replica_changes(key);
CREATE TRIGGER "sync_32ffaf99782a7333c6784e247a81_track_0_delete" AFTER DELETE ON "folders" BEGIN INSERT INTO sync_32ffaf99782a7333c6784e247a81_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'folder',OLD."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_32ffaf99782a7333c6784e247a81_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_32ffaf99782a7333c6784e247a81_track_0_insert" AFTER INSERT ON "folders" BEGIN INSERT INTO sync_32ffaf99782a7333c6784e247a81_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'folder',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_32ffaf99782a7333c6784e247a81_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_32ffaf99782a7333c6784e247a81_track_0_update" AFTER UPDATE ON "folders" BEGIN INSERT INTO sync_32ffaf99782a7333c6784e247a81_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'folder',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_32ffaf99782a7333c6784e247a81_replica_state WHERE id=1)=0;INSERT INTO sync_32ffaf99782a7333c6784e247a81_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'folder',OLD."id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'folder',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_32ffaf99782a7333c6784e247a81_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_32ffaf99782a7333c6784e247a81_track_1_delete" AFTER DELETE ON "pages" BEGIN INSERT INTO sync_32ffaf99782a7333c6784e247a81_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'document',OLD."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_32ffaf99782a7333c6784e247a81_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_32ffaf99782a7333c6784e247a81_track_1_insert" AFTER INSERT ON "pages" BEGIN INSERT INTO sync_32ffaf99782a7333c6784e247a81_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'document',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_32ffaf99782a7333c6784e247a81_replica_state WHERE id=1)=0;INSERT INTO "pages_editor_versions" ("id","version") SELECT NEW."id",NEW."version" WHERE 1=1 ON CONFLICT ("id") DO UPDATE SET "version"=MAX("version",excluded."version"); END;
CREATE TRIGGER "sync_32ffaf99782a7333c6784e247a81_track_1_update" AFTER UPDATE ON "pages" BEGIN INSERT INTO sync_32ffaf99782a7333c6784e247a81_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'document',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_32ffaf99782a7333c6784e247a81_replica_state WHERE id=1)=0;INSERT INTO sync_32ffaf99782a7333c6784e247a81_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'document',OLD."id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'document',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_32ffaf99782a7333c6784e247a81_replica_state WHERE id=1)=0;INSERT INTO "pages_editor_versions" ("id","version") SELECT NEW."id",NEW."version" WHERE 1=1 ON CONFLICT ("id") DO UPDATE SET "version"=MAX("version",excluded."version"); END;
PRAGMA user_version=1;
COMMIT;

PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE context_edges (
    scope_kind TEXT NOT NULL CHECK (scope_kind IN ('personal', 'team_project')),
    scope_id TEXT NOT NULL,
    edge_key TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    relation_type TEXT NOT NULL,
    source_json TEXT NOT NULL,
    target_json TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    cause TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('active', 'removed')),
    PRIMARY KEY (scope_kind, scope_id, edge_key, revision)
  );
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE placement_titles (kind TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL, seen_at TEXT NOT NULL, PRIMARY KEY (kind, id));
INSERT INTO "context_edges"("scope_kind","scope_id","edge_key","revision","relation_type","source_json","target_json","actor_id","cause","recorded_at","state") VALUES('personal','placement','["location","pages_document","7f6819a5-0618-4635-b388-abc023d4a3b3"]',1,'placement.location','{"module":"plugins","object_type":"pages_document","id":"7f6819a5-0618-4635-b388-abc023d4a3b3","version":null,"scope":{"kind":"personal","id":"placement"},"project_id":null}','{"module":"projects","id":"personal","version":null,"scope":{"kind":"personal","id":"placement"},"project_id":null}','module:placement','placement.seen','2026-01-15T09:00:00.000Z','active');
INSERT INTO "context_edges"("scope_kind","scope_id","edge_key","revision","relation_type","source_json","target_json","actor_id","cause","recorded_at","state") VALUES('personal','placement','["location","pages_document","7f6819a5-0618-4635-b388-abc023d4a3b3"]',2,'placement.location','{"module":"plugins","object_type":"pages_document","id":"7f6819a5-0618-4635-b388-abc023d4a3b3","version":null,"scope":{"kind":"personal","id":"placement"},"project_id":null}','{"module":"projects","id":"project-6439ad62-5652-4a40-909e-65912fa0f834","version":null,"scope":{"kind":"personal","id":"placement"},"project_id":null}','module:placement','placement.move:personal','2026-01-15T09:00:00.000Z','active');
INSERT INTO "context_edges"("scope_kind","scope_id","edge_key","revision","relation_type","source_json","target_json","actor_id","cause","recorded_at","state") VALUES('personal','placement','["location","pages_document","7f6819a5-0618-4635-b388-abc023d4a3b3"]',3,'placement.location','{"module":"plugins","object_type":"pages_document","id":"7f6819a5-0618-4635-b388-abc023d4a3b3","version":null,"scope":{"kind":"personal","id":"placement"},"project_id":null}','{"module":"projects","id":"personal","version":null,"scope":{"kind":"personal","id":"placement"},"project_id":null}','module:placement','placement.move:project-6439ad62-5652-4a40-909e-65912fa0f834','2026-01-15T09:00:00.000Z','active');
INSERT INTO "context_edges"("scope_kind","scope_id","edge_key","revision","relation_type","source_json","target_json","actor_id","cause","recorded_at","state") VALUES('personal','placement','["used_in","pages_document","7f6819a5-0618-4635-b388-abc023d4a3b3","project-6439ad62-5652-4a40-909e-65912fa0f834"]',1,'placement.used_in','{"module":"plugins","object_type":"pages_document","id":"7f6819a5-0618-4635-b388-abc023d4a3b3","version":null,"scope":{"kind":"personal","id":"placement"},"project_id":null}','{"module":"projects","id":"project-6439ad62-5652-4a40-909e-65912fa0f834","version":null,"scope":{"kind":"personal","id":"placement"},"project_id":null}','module:placement','placement.link','2026-01-15T09:00:00.000Z','active');
INSERT INTO "context_edges"("scope_kind","scope_id","edge_key","revision","relation_type","source_json","target_json","actor_id","cause","recorded_at","state") VALUES('personal','placement','["used_in","pages_document","7f6819a5-0618-4635-b388-abc023d4a3b3","project-6439ad62-5652-4a40-909e-65912fa0f834"]',2,'placement.used_in','{"module":"plugins","object_type":"pages_document","id":"7f6819a5-0618-4635-b388-abc023d4a3b3","version":null,"scope":{"kind":"personal","id":"placement"},"project_id":null}','{"module":"projects","id":"project-6439ad62-5652-4a40-909e-65912fa0f834","version":null,"scope":{"kind":"personal","id":"placement"},"project_id":null}','module:placement','placement.moved_into_project','2026-01-15T09:00:00.000Z','removed');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
INSERT INTO "placement_titles"("kind","id","title","seen_at") VALUES('pages_document','7f6819a5-0618-4635-b388-abc023d4a3b3','金样摆放 seed','2026-01-15T09:00:00.000Z');
CREATE INDEX context_edges_source_idx ON context_edges
    (scope_kind, scope_id, relation_type, json_extract(source_json, '$.module'), json_extract(source_json, '$.id'));
PRAGMA user_version=1;
COMMIT;

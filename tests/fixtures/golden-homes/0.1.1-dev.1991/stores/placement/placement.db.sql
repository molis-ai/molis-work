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
INSERT INTO "context_edges"("scope_kind","scope_id","edge_key","revision","relation_type","source_json","target_json","actor_id","cause","recorded_at","state") VALUES('personal','placement','["location","pages_document","f54b4713-6f10-4787-813c-5cd7c6a7142d"]',1,'placement.location','{"module":"plugins","object_type":"pages_document","id":"f54b4713-6f10-4787-813c-5cd7c6a7142d","version":null,"scope":{"kind":"personal","id":"placement"},"project_id":null}','{"module":"projects","id":"personal","version":null,"scope":{"kind":"personal","id":"placement"},"project_id":null}','module:placement','placement.seen','2026-01-15T09:00:00.000Z','active');
INSERT INTO "context_edges"("scope_kind","scope_id","edge_key","revision","relation_type","source_json","target_json","actor_id","cause","recorded_at","state") VALUES('personal','placement','["location","pages_document","f54b4713-6f10-4787-813c-5cd7c6a7142d"]',2,'placement.location','{"module":"plugins","object_type":"pages_document","id":"f54b4713-6f10-4787-813c-5cd7c6a7142d","version":null,"scope":{"kind":"personal","id":"placement"},"project_id":null}','{"module":"projects","id":"project-be251f3d-abc0-4340-9e9f-ca73b29292fa","version":null,"scope":{"kind":"personal","id":"placement"},"project_id":null}','module:placement','placement.move:personal','2026-01-15T09:00:00.000Z','active');
INSERT INTO "context_edges"("scope_kind","scope_id","edge_key","revision","relation_type","source_json","target_json","actor_id","cause","recorded_at","state") VALUES('personal','placement','["location","pages_document","f54b4713-6f10-4787-813c-5cd7c6a7142d"]',3,'placement.location','{"module":"plugins","object_type":"pages_document","id":"f54b4713-6f10-4787-813c-5cd7c6a7142d","version":null,"scope":{"kind":"personal","id":"placement"},"project_id":null}','{"module":"projects","id":"personal","version":null,"scope":{"kind":"personal","id":"placement"},"project_id":null}','module:placement','placement.move:project-be251f3d-abc0-4340-9e9f-ca73b29292fa','2026-01-15T09:00:00.000Z','active');
INSERT INTO "context_edges"("scope_kind","scope_id","edge_key","revision","relation_type","source_json","target_json","actor_id","cause","recorded_at","state") VALUES('personal','placement','["used_in","pages_document","f54b4713-6f10-4787-813c-5cd7c6a7142d","project-be251f3d-abc0-4340-9e9f-ca73b29292fa"]',1,'placement.used_in','{"module":"plugins","object_type":"pages_document","id":"f54b4713-6f10-4787-813c-5cd7c6a7142d","version":null,"scope":{"kind":"personal","id":"placement"},"project_id":null}','{"module":"projects","id":"project-be251f3d-abc0-4340-9e9f-ca73b29292fa","version":null,"scope":{"kind":"personal","id":"placement"},"project_id":null}','module:placement','placement.link','2026-01-15T09:00:00.000Z','active');
INSERT INTO "context_edges"("scope_kind","scope_id","edge_key","revision","relation_type","source_json","target_json","actor_id","cause","recorded_at","state") VALUES('personal','placement','["used_in","pages_document","f54b4713-6f10-4787-813c-5cd7c6a7142d","project-be251f3d-abc0-4340-9e9f-ca73b29292fa"]',2,'placement.used_in','{"module":"plugins","object_type":"pages_document","id":"f54b4713-6f10-4787-813c-5cd7c6a7142d","version":null,"scope":{"kind":"personal","id":"placement"},"project_id":null}','{"module":"projects","id":"project-be251f3d-abc0-4340-9e9f-ca73b29292fa","version":null,"scope":{"kind":"personal","id":"placement"},"project_id":null}','module:placement','placement.moved_into_project','2026-01-15T09:00:00.000Z','removed');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
INSERT INTO "placement_titles"("kind","id","title","seen_at") VALUES('pages_document','f54b4713-6f10-4787-813c-5cd7c6a7142d','金样摆放 seed','2026-01-15T09:00:00.000Z');
CREATE INDEX context_edges_source_idx ON context_edges
    (scope_kind, scope_id, relation_type, json_extract(source_json, '$.module'), json_extract(source_json, '$.id'));
PRAGMA user_version=1;
COMMIT;

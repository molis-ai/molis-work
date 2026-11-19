PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE memory_candidates (
  candidate_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, state TEXT NOT NULL, body TEXT NOT NULL
);
CREATE TABLE memory_changes (
  change_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, memory_id TEXT, at TEXT NOT NULL, body TEXT NOT NULL
);
CREATE TABLE memory_markers (
  actor_id TEXT NOT NULL, key TEXT NOT NULL, at TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (actor_id, key)
);
CREATE TABLE memory_owners (
  scope TEXT NOT NULL, owner TEXT NOT NULL, project_id TEXT, title TEXT NOT NULL, subject TEXT, PRIMARY KEY (scope, owner)
);
CREATE TABLE memory_pairs (
  pair_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, state TEXT NOT NULL, body TEXT NOT NULL
);
CREATE TABLE memory_prefs (
  actor_id TEXT NOT NULL, key TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (actor_id, key)
);
CREATE TABLE memory_revisions (
  memory_id TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (memory_id, version)
);
CREATE TABLE memory_signal_events (
  event_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, key TEXT NOT NULL, occurrence TEXT NOT NULL, at TEXT NOT NULL
);
CREATE TABLE memory_uses (
  memory_id TEXT NOT NULL, receipt_id TEXT NOT NULL, at TEXT NOT NULL, work_id TEXT, state TEXT NOT NULL, body TEXT NOT NULL,
  PRIMARY KEY (memory_id, receipt_id)
);
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
INSERT INTO "memory_changes"("change_id","actor_id","memory_id","at","body") VALUES('change-08aac1c1-97da-49b3-9cc7-95b4581d6800:edited:once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend','web-user','once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend','2026-01-15T09:00:00.000Z','{"change_id":"change-08aac1c1-97da-49b3-9cc7-95b4581d6800:edited:once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend","operation_id":"08aac1c1-97da-49b3-9cc7-95b4581d6800","actor_id":"web-user","owner":"web-user","kind":"edited","memory_id":"once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend","scope":"personal","project_id":null,"text":"金样记忆 seed 已改","by":"person","rule":null,"reason":null,"work":null,"at":"2026-01-15T09:00:00.000Z","undoable":false,"state":"active","undo":null}');
INSERT INTO "memory_changes"("change_id","actor_id","memory_id","at","body") VALUES('change-2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e:kept:once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend','web-user','once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend','2026-01-15T09:00:00.000Z','{"change_id":"change-2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e:kept:once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend","operation_id":"2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e","applied_version":1,"actor_id":"web-user","owner":"web-user","kind":"kept","memory_id":"once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend","scope":"personal","project_id":null,"text":"金样记忆 seed","by":"person","rule":null,"reason":null,"work":null,"at":"2026-01-15T09:00:00.000Z","undoable":false,"state":"active","undo":null}');
INSERT INTO "memory_markers"("actor_id","key","at","body") VALUES('web-user','memory-operation:08aac1c1-97da-49b3-9cc7-95b4581d6800:change-request','2026-01-15T09:00:00.000Z','{"kind":"update","scope":"personal","owner":"web-user","memory_id":"once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend","expected_version":1,"operation_id":"08aac1c1-97da-49b3-9cc7-95b4581d6800:change-request","at":"2026-01-15T09:00:00.000Z","phase":"pending"}');
INSERT INTO "memory_markers"("actor_id","key","at","body") VALUES('web-user','memory-operation:08aac1c1-97da-49b3-9cc7-95b4581d6800:change:once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend','2026-01-15T09:00:00.000Z','{"kind":"update","scope":"personal","owner":"web-user","memory_id":"once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend","expected_version":1,"original_state":"active","operation_id":"08aac1c1-97da-49b3-9cc7-95b4581d6800:change:once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend","at":"2026-01-15T09:00:00.000Z","phase":"pending"}');
INSERT INTO "memory_markers"("actor_id","key","at","body") VALUES('web-user','memory-operation:08aac1c1-97da-49b3-9cc7-95b4581d6800:update:once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend','2026-01-15T09:00:00.000Z','{"kind":"update","scope":"personal","owner":"web-user","memory_id":"once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend","expected_version":1,"operation_id":"08aac1c1-97da-49b3-9cc7-95b4581d6800:update:once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend","at":"2026-01-15T09:00:00.000Z","phase":"committed","result":{"memory_id":"once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend","version":2}}');
INSERT INTO "memory_markers"("actor_id","key","at","body") VALUES('web-user','memory-operation:2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e:append','2026-01-15T09:00:00.000Z','{"kind":"append","scope":"personal","owner":"web-user","operation_id":"2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e:append","at":"2026-01-15T09:00:00.000Z","phase":"committed","result":{"memory_id":"once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend","version":1}}');
INSERT INTO "memory_markers"("actor_id","key","at","body") VALUES('web-user','memory-operation:2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e:commit','2026-01-15T09:00:00.000Z','{"kind":"commit","scope":"personal","owner":"web-user","operation_id":"2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e:commit","at":"2026-01-15T09:00:00.000Z","phase":"committed","result":{"memory_id":"once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend","version":1}}');
INSERT INTO "memory_markers"("actor_id","key","at","body") VALUES('web-user','memory-operation:2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e:write','2026-01-15T09:00:00.000Z','{"kind":"write","scope":"personal","owner":"web-user","operation_id":"2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e:write","at":"2026-01-15T09:00:00.000Z","phase":"pending"}');
INSERT INTO "memory_markers"("actor_id","key","at","body") VALUES('web-user','upkeep-session','2026-01-15T09:00:00.000Z','{"session_id":"1-55rcw"}');
INSERT INTO "memory_prefs"("actor_id","key","body") VALUES('web-user','personal','{"enabled":true,"task_recall":true,"form":true,"auto":false,"learn_from_work":true,"learn_from_ui":true,"consumers":{"assistant":true,"agent":true,"ui":true,"plugin":true,"mcp":false},"plugins":{},"class_restrictions":[]}');
INSERT INTO "memory_prefs"("actor_id","key","body") VALUES('web-user','project-default','{"enabled":true,"task_recall":true,"form":true,"auto":false,"learn_from_work":true,"learn_from_ui":true,"consumers":{"assistant":true,"agent":true,"ui":true,"plugin":true,"mcp":true},"plugins":{},"class_restrictions":[]}');
INSERT INTO "memory_revisions"("memory_id","version","body") VALUES('once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend',1,'{"version":1,"change":"created","by":"person","at":"2026-01-15T09:00:00.000Z"}');
INSERT INTO "memory_revisions"("memory_id","version","body") VALUES('once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend',2,'{"version":2,"change":"edited","by":"person","at":"2026-01-15T09:00:00.000Z"}');
INSERT INTO "memory_uses"("memory_id","receipt_id","at","work_id","state","body") VALUES('once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend','memory-a-1jyf7:task','2026-01-15T09:00:00.000Z','work-4904e289-f1d1-457b-825d-76b4dfce9081','response-observed','{"memory_id":"once.user.8.web-user.2aac4f5f-f0e2-4084-a5a8-b5aa00f6163e_3aappend","memory_version":2,"receipt_id":"memory-a-1jyf7:task","at":"2026-01-15T09:00:00.000Z","time_basis":"run-start","consumer":"assistant","title":"工作「金样对话 seed」","work_id":"work-4904e289-f1d1-457b-825d-76b4dfce9081","source":"run-context","run":{"run_id":"c-6tfd4","session_id":"3-4vyh1"},"evidence_call_id":"call-1","state":"response-observed"}');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
CREATE INDEX memory_candidates_actor ON memory_candidates(actor_id);
CREATE INDEX memory_changes_actor ON memory_changes(actor_id, at);
CREATE INDEX memory_changes_memory ON memory_changes(memory_id);
CREATE INDEX memory_signal_key ON memory_signal_events(actor_id, key);
CREATE INDEX memory_uses_receipt ON memory_uses(receipt_id);
CREATE INDEX memory_uses_work ON memory_uses(work_id);
PRAGMA user_version=3;
COMMIT;

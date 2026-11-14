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
INSERT INTO "memory_changes"("change_id","actor_id","memory_id","at","body") VALUES('change-6c391e81-8dd7-436f-b044-b3740bd3cd10:kept:once.user.8.web-user.6c391e81-8dd7-436f-b044-b3740bd3cd10_3aappend','web-user','once.user.8.web-user.6c391e81-8dd7-436f-b044-b3740bd3cd10_3aappend','2026-01-15T09:00:00.000Z','{"change_id":"change-6c391e81-8dd7-436f-b044-b3740bd3cd10:kept:once.user.8.web-user.6c391e81-8dd7-436f-b044-b3740bd3cd10_3aappend","operation_id":"6c391e81-8dd7-436f-b044-b3740bd3cd10","applied_version":1,"actor_id":"web-user","owner":"web-user","kind":"kept","memory_id":"once.user.8.web-user.6c391e81-8dd7-436f-b044-b3740bd3cd10_3aappend","scope":"personal","project_id":null,"text":"金样记忆 seed","by":"person","rule":null,"reason":null,"work":null,"at":"2026-01-15T09:00:00.000Z","undoable":false,"state":"active","undo":null}');
INSERT INTO "memory_changes"("change_id","actor_id","memory_id","at","body") VALUES('change-ec8dd18d-d42c-49f8-8c6c-a7343a0cfa9d:edited:once.user.8.web-user.6c391e81-8dd7-436f-b044-b3740bd3cd10_3aappend','web-user','once.user.8.web-user.6c391e81-8dd7-436f-b044-b3740bd3cd10_3aappend','2026-01-15T09:00:00.000Z','{"change_id":"change-ec8dd18d-d42c-49f8-8c6c-a7343a0cfa9d:edited:once.user.8.web-user.6c391e81-8dd7-436f-b044-b3740bd3cd10_3aappend","operation_id":"ec8dd18d-d42c-49f8-8c6c-a7343a0cfa9d","actor_id":"web-user","owner":"web-user","kind":"edited","memory_id":"once.user.8.web-user.6c391e81-8dd7-436f-b044-b3740bd3cd10_3aappend","scope":"personal","project_id":null,"text":"金样记忆 seed 已改","by":"person","rule":null,"reason":null,"work":null,"at":"2026-01-15T09:00:00.000Z","undoable":false,"state":"active","undo":null}');
INSERT INTO "memory_markers"("actor_id","key","at","body") VALUES('web-user','memory-operation:6c391e81-8dd7-436f-b044-b3740bd3cd10:append','2026-01-15T09:00:00.000Z','{"kind":"append","scope":"personal","owner":"web-user","operation_id":"6c391e81-8dd7-436f-b044-b3740bd3cd10:append","at":"2026-01-15T09:00:00.000Z","phase":"committed","result":{"memory_id":"once.user.8.web-user.6c391e81-8dd7-436f-b044-b3740bd3cd10_3aappend","version":1}}');
INSERT INTO "memory_markers"("actor_id","key","at","body") VALUES('web-user','memory-operation:6c391e81-8dd7-436f-b044-b3740bd3cd10:commit','2026-01-15T09:00:00.000Z','{"kind":"commit","scope":"personal","owner":"web-user","operation_id":"6c391e81-8dd7-436f-b044-b3740bd3cd10:commit","at":"2026-01-15T09:00:00.000Z","phase":"committed","result":{"memory_id":"once.user.8.web-user.6c391e81-8dd7-436f-b044-b3740bd3cd10_3aappend","version":1}}');
INSERT INTO "memory_markers"("actor_id","key","at","body") VALUES('web-user','memory-operation:6c391e81-8dd7-436f-b044-b3740bd3cd10:write','2026-01-15T09:00:00.000Z','{"kind":"write","scope":"personal","owner":"web-user","operation_id":"6c391e81-8dd7-436f-b044-b3740bd3cd10:write","at":"2026-01-15T09:00:00.000Z","phase":"pending"}');
INSERT INTO "memory_markers"("actor_id","key","at","body") VALUES('web-user','memory-operation:ec8dd18d-d42c-49f8-8c6c-a7343a0cfa9d:change:once.user.8.web-user.6c391e81-8dd7-436f-b044-b3740bd3cd10_3aappend','2026-01-15T09:00:00.000Z','{"kind":"update","scope":"personal","owner":"web-user","memory_id":"once.user.8.web-user.6c391e81-8dd7-436f-b044-b3740bd3cd10_3aappend","expected_version":1,"original_state":"active","operation_id":"ec8dd18d-d42c-49f8-8c6c-a7343a0cfa9d:change:once.user.8.web-user.6c391e81-8dd7-436f-b044-b3740bd3cd10_3aappend","at":"2026-01-15T09:00:00.000Z","phase":"pending"}');
INSERT INTO "memory_markers"("actor_id","key","at","body") VALUES('web-user','memory-operation:ec8dd18d-d42c-49f8-8c6c-a7343a0cfa9d:update:once.user.8.web-user.6c391e81-8dd7-436f-b044-b3740bd3cd10_3aappend','2026-01-15T09:00:00.000Z','{"kind":"update","scope":"personal","owner":"web-user","memory_id":"once.user.8.web-user.6c391e81-8dd7-436f-b044-b3740bd3cd10_3aappend","expected_version":1,"operation_id":"ec8dd18d-d42c-49f8-8c6c-a7343a0cfa9d:update:once.user.8.web-user.6c391e81-8dd7-436f-b044-b3740bd3cd10_3aappend","at":"2026-01-15T09:00:00.000Z","phase":"committed","result":{"memory_id":"once.user.8.web-user.6c391e81-8dd7-436f-b044-b3740bd3cd10_3aappend","version":2}}');
INSERT INTO "memory_markers"("actor_id","key","at","body") VALUES('web-user','upkeep-session','2026-01-15T09:00:00.000Z','{"session_id":"1-4qfst"}');
INSERT INTO "memory_prefs"("actor_id","key","body") VALUES('web-user','personal','{"enabled":true,"task_recall":true,"form":true,"auto":false,"learn_from_work":true,"learn_from_ui":true,"consumers":{"assistant":true,"agent":true,"ui":true,"plugin":true,"mcp":false},"plugins":{}}');
INSERT INTO "memory_prefs"("actor_id","key","body") VALUES('web-user','project-default','{"enabled":true,"task_recall":true,"form":true,"auto":false,"learn_from_work":true,"learn_from_ui":true,"consumers":{"assistant":true,"agent":true,"ui":true,"plugin":true,"mcp":true},"plugins":{}}');
INSERT INTO "memory_revisions"("memory_id","version","body") VALUES('once.user.8.web-user.6c391e81-8dd7-436f-b044-b3740bd3cd10_3aappend',1,'{"version":1,"text":"金样记忆 seed","kind":"preference","applies":{},"snapshot":{"origin":"2026年1月15日 · 你在设置里添加","meta":{"classification":{"scenes":["common"],"lifecycle":"long-term"},"kind":"preference","source":"manual","basis":"explicit","approved_by":{"by":"person"}}},"change":"created","by":"person","at":"2026-01-15T09:00:00.000Z"}');
INSERT INTO "memory_revisions"("memory_id","version","body") VALUES('once.user.8.web-user.6c391e81-8dd7-436f-b044-b3740bd3cd10_3aappend',2,'{"version":2,"text":"金样记忆 seed 已改","kind":"preference","applies":{},"snapshot":{"origin":"2026年1月15日 · 你在设置里添加","meta":{"classification":{"scenes":["common"],"lifecycle":"long-term"},"kind":"preference","source":"manual","basis":"explicit","approved_by":{"by":"person"}}},"change":"edited","by":"person","at":"2026-01-15T09:00:00.000Z"}');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
CREATE INDEX memory_candidates_actor ON memory_candidates(actor_id);
CREATE INDEX memory_changes_actor ON memory_changes(actor_id, at);
CREATE INDEX memory_changes_memory ON memory_changes(memory_id);
CREATE INDEX memory_signal_key ON memory_signal_events(actor_id, key);
CREATE INDEX memory_uses_receipt ON memory_uses(receipt_id);
CREATE INDEX memory_uses_work ON memory_uses(work_id);
PRAGMA user_version=1;
COMMIT;

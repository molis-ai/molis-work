PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE assistant_cards (
  card_id TEXT PRIMARY KEY, work_id TEXT NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL
);
CREATE TABLE assistant_followups (
  followup_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, body TEXT NOT NULL
);
CREATE TABLE assistant_jobs (
  key TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, told INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL
);
CREATE TABLE assistant_notices (
  notice_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL,
  dedupe TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(actor_id, dedupe)
);
CREATE TABLE assistant_observed (
  actor_id TEXT NOT NULL, work_id TEXT NOT NULL, state TEXT NOT NULL, PRIMARY KEY(actor_id, work_id)
);
CREATE TABLE assistant_requests (
  actor_id TEXT NOT NULL, request_id TEXT NOT NULL, work_id TEXT, state TEXT NOT NULL, result TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY(actor_id, request_id)
);
CREATE TABLE assistant_rounds (
  work_id TEXT NOT NULL, run_id TEXT NOT NULL, position INTEGER NOT NULL, body TEXT NOT NULL,
  PRIMARY KEY(work_id, run_id)
);
CREATE TABLE assistant_settings (
  actor_id TEXT NOT NULL, key TEXT NOT NULL, revision INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY(actor_id, key)
);
CREATE TABLE assistant_undos (
  undo_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, body TEXT NOT NULL
);
CREATE TABLE assistant_unsettled (
  change_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, told INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL
);
CREATE TABLE assistant_usage (
  run_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, ended_at TEXT NOT NULL, input INTEGER NOT NULL, output INTEGER NOT NULL, cached INTEGER NOT NULL
);
CREATE TABLE assistant_works (
  work_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL
);
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
INSERT INTO "assistant_notices"("notice_id","actor_id","work_id","kind","state","dedupe","created_at","body") VALUES('706ab703-797e-43cc-a3f7-bd26a7b6a431','web-user','work-1b9aa86c-cdc1-4df3-b845-b3e5264b9fda','completed','new','work-1b9aa86c-cdc1-4df3-b845-b3e5264b9fda:b-1e7sl:completed:completed','2026-01-15T09:00:00.000Z','{"kind":"completed","work_id":"work-1b9aa86c-cdc1-4df3-b845-b3e5264b9fda","work_title":"金样对话 seed","text":"「金样对话 seed」做完了","notice_id":"706ab703-797e-43cc-a3f7-bd26a7b6a431","state":"new","created_at":"2026-01-15T09:00:00.000Z"}');
INSERT INTO "assistant_observed"("actor_id","work_id","state") VALUES('web-user','work-1b9aa86c-cdc1-4df3-b845-b3e5264b9fda','completed');
INSERT INTO "assistant_requests"("actor_id","request_id","work_id","state","result","created_at") VALUES('web-user','6b1b52b1-b089-44de-a69c-2f8e5fa31b78','work-1b9aa86c-cdc1-4df3-b845-b3e5264b9fda','done','{"work":{"work_id":"work-1b9aa86c-cdc1-4df3-b845-b3e5264b9fda","executor":{"kind":"assistant"},"revision":6,"title":"金样对话 seed","scope":{"kind":"personal"},"origin":null,"state":"running","session_id":"3-8075v","draft":"","created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","archived":false},"outcome":"started","run_id":"b-1e7sl"}','2026-01-15T09:00:00.000Z');
INSERT INTO "assistant_rounds"("work_id","run_id","position","body") VALUES('work-1b9aa86c-cdc1-4df3-b845-b3e5264b9fda','b-1e7sl',1,'{"run_id":"b-1e7sl","text":"金样对话 seed","materials":[],"context":null,"started_at":"2026-01-15T09:00:00.000Z","memory_receipt":"recall-3b797fee-0254-4b9e-aef4-a1194ee90dcb"}');
INSERT INTO "assistant_settings"("actor_id","key","revision","value") VALUES('web-user','daily_tokens',1,'120000');
INSERT INTO "assistant_usage"("run_id","actor_id","work_id","ended_at","input","output","cached") VALUES('b-1e7sl','web-user','work-1b9aa86c-cdc1-4df3-b845-b3e5264b9fda','2026-01-15T09:00:00.000Z',3,2,0);
INSERT INTO "assistant_works"("work_id","actor_id","revision","updated_at","archived","body") VALUES('work-1b9aa86c-cdc1-4df3-b845-b3e5264b9fda','web-user',6,'2026-01-15T09:00:00.000Z',0,'{"work_id":"work-1b9aa86c-cdc1-4df3-b845-b3e5264b9fda","revision":6,"title":"金样对话 seed","scope":{"kind":"personal"},"origin":null,"executor":{"kind":"assistant"},"session_id":"3-8075v","draft":"","created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","archived":false,"actor_id":"web-user","graph_id":"4-6t6s2"}');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
CREATE INDEX assistant_cards_by_work ON assistant_cards(work_id, created_at);
CREATE INDEX assistant_notices_open ON assistant_notices(actor_id, state, created_at);
CREATE INDEX assistant_usage_by_day ON assistant_usage(actor_id, ended_at);
CREATE INDEX assistant_works_by_actor ON assistant_works(actor_id, archived, updated_at);
CREATE INDEX context_edges_source_idx ON context_edges
    (scope_kind, scope_id, relation_type, json_extract(source_json, '$.module'), json_extract(source_json, '$.id'));
PRAGMA user_version=1;
COMMIT;

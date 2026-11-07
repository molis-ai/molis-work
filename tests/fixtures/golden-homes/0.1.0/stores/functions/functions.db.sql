PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE function_judgments (
    judgment_id TEXT PRIMARY KEY,
    function_key TEXT NOT NULL,
    function_version INTEGER NOT NULL,
    subject_kind TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    project_id TEXT NOT NULL DEFAULT '',
    scene_id TEXT,
    outcome TEXT NOT NULL,
    suggested_json TEXT NOT NULL,
    error_code TEXT,
    created_at TEXT NOT NULL,
    scene_provenance_json TEXT,
    recommended_actions_json TEXT,
    install_id TEXT
  );
CREATE TABLE function_scene_bindings (
    scene_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    action_binding_json TEXT NOT NULL,
    binding_revision TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (scene_id, project_id)
  );
CREATE TABLE functions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    function_key TEXT NOT NULL UNIQUE,
    primitive TEXT NOT NULL,
    status TEXT NOT NULL,
    version INTEGER,
    model TEXT NOT NULL,
    instructions TEXT NOT NULL,
    criteria_json TEXT NOT NULL,
    config_hash TEXT NOT NULL,
    last_preview_json TEXT,
    samples_json TEXT NOT NULL DEFAULT '[]',
    published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    scene_id TEXT,
    subject_kinds_json TEXT NOT NULL DEFAULT '[]',
    scene_map_json TEXT NOT NULL DEFAULT '{}',
    scene_version INTEGER,
    scene_provider_id TEXT,
    action_map_json TEXT NOT NULL DEFAULT '{}'
  );
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
INSERT INTO "functions"("id","name","function_key","primitive","status","version","model","instructions","criteria_json","config_hash","last_preview_json","samples_json","published_at","created_at","updated_at","scene_id","subject_kinds_json","scene_map_json","scene_version","scene_provider_id","action_map_json") VALUES('c6651e53-93e4-4377-84d4-18e794fee309','金样判断 seed 已改','seed','choice','draft',NULL,'jev-latest','','[{"key":"yes","description":""},{"key":"no","description":""}]','bdb98a32761e435f672b8be2b74bf66e498eb758fc2629eb53594a41187a5e69',NULL,'[]',NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.001Z',NULL,'[]','{}',NULL,NULL,'{}');
INSERT INTO "functions"("id","name","function_key","primitive","status","version","model","instructions","criteria_json","config_hash","last_preview_json","samples_json","published_at","created_at","updated_at","scene_id","subject_kinds_json","scene_map_json","scene_version","scene_provider_id","action_map_json") VALUES('declared:io.molis.work.feed:system_admit_inbox','是否进 Inbox','system_admit_inbox','choice','published',1,'jev-latest','看这条消息要不要进 Inbox。','[{"key":"inbox.admit","description":"进入 Inbox"},{"key":"feed.open","description":"留在 Feed"}]','b40b58a00472aa145f8cbf35446f168c327b539686c09b12ad9cb8da058cd1a9','{"input":"declared","outcome":"ok","primitive":"choice","choice":"inbox.admit","noul":null,"score":null,"legend":null,"probabilities":{},"confidence":null,"model":"jev-latest","config_hash":"b40b58a00472aa145f8cbf35446f168c327b539686c09b12ad9cb8da058cd1a9","at":"2026-01-15T09:00:00.000Z"}','[]','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z','feed.capture','["feed_item"]','{}',NULL,NULL,'{}');
INSERT INTO "functions"("id","name","function_key","primitive","status","version","model","instructions","criteria_json","config_hash","last_preview_json","samples_json","published_at","created_at","updated_at","scene_id","subject_kinds_json","scene_map_json","scene_version","scene_provider_id","action_map_json") VALUES('declared:io.molis.work.inbox:system_pick_inbox_next','挑 Inbox 下一步','system_pick_inbox_next','choice','published',1,'jev-latest','看这条 Inbox 该显示哪个按钮。','[{"key":"inbox.done","description":"标记已处理"},{"key":"inbox.dismiss","description":"忽略"}]','4900961af159ac459fb9baadaecc36d8866a379f1fd66d4a0b2852191dcd76d9','{"input":"declared","outcome":"ok","primitive":"choice","choice":"inbox.done","noul":null,"score":null,"legend":null,"probabilities":{},"confidence":null,"model":"jev-latest","config_hash":"4900961af159ac459fb9baadaecc36d8866a379f1fd66d4a0b2852191dcd76d9","at":"2026-01-15T09:00:00.000Z"}','[]','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z','inbox.next','["inbox_entry"]','{}',NULL,NULL,'{}');
INSERT INTO "functions"("id","name","function_key","primitive","status","version","model","instructions","criteria_json","config_hash","last_preview_json","samples_json","published_at","created_at","updated_at","scene_id","subject_kinds_json","scene_map_json","scene_version","scene_provider_id","action_map_json") VALUES('declared:system.home:system_pick_home_dock','首页事项处理建议','system_pick_home_dock','choice','published',1,'jev-latest','根据事项原文，在当前可用动作中推荐完成或忽略，由用户决定是否执行。','[{"key":"inbox.done","description":"做完了"},{"key":"inbox.dismiss","description":"忽略"}]','0f809430f895d7549ceca0a7fba1be4c074a8dfcec359c1b8767718d77cee9be','{"input":"declared","outcome":"ok","primitive":"choice","choice":"inbox.done","noul":null,"score":null,"legend":null,"probabilities":{},"confidence":null,"model":"jev-latest","config_hash":"0f809430f895d7549ceca0a7fba1be4c074a8dfcec359c1b8767718d77cee9be","at":"2026-01-15T09:00:00.000Z"}','[]','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z','home.dock','["inbox_entry"]','{"inbox.done":"offer.9ad11b2e52f9acddae0370cdb05ad218678e358b8189d896eadd6ed4d7","inbox.dismiss":"offer.142d11c71ad8c459929915e7e9af8d0da181866d16f02d3558a5b0d1a9"}',NULL,NULL,'{}');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
CREATE INDEX function_judgments_subject_idx
    ON function_judgments(subject_kind, subject_id, project_id, created_at);
PRAGMA user_version=1;
COMMIT;

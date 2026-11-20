PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE prompt_history (
  key TEXT NOT NULL, revision INTEGER NOT NULL, action TEXT NOT NULL, body TEXT, base_version INTEGER NOT NULL, at TEXT NOT NULL, actor_id TEXT NOT NULL, default_ref TEXT,
  PRIMARY KEY (key, revision)
);
CREATE TABLE prompt_overrides (
  key TEXT PRIMARY KEY, revision INTEGER NOT NULL, base_version INTEGER NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL, actor_id TEXT NOT NULL, default_ref TEXT
);
CREATE TABLE prompt_uses (
  key TEXT NOT NULL, at TEXT NOT NULL, version INTEGER NOT NULL, user_revision INTEGER, caller TEXT NOT NULL, source_ref TEXT
);
CREATE TABLE skill_cases (
  case_id TEXT PRIMARY KEY, owner_ref TEXT NOT NULL, title TEXT NOT NULL, task TEXT NOT NULL, material TEXT, expected TEXT NOT NULL, origin TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE skill_drafts (
  draft_id TEXT PRIMARY KEY, scope_ref TEXT NOT NULL, target TEXT NOT NULL, fields TEXT NOT NULL, replacements TEXT NOT NULL, revision INTEGER NOT NULL,
  origin TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, actor_id TEXT NOT NULL, discarded_at TEXT
);
CREATE TABLE skill_lineage (
  scope_ref TEXT NOT NULL, skill_id TEXT NOT NULL, source TEXT NOT NULL, replacements TEXT NOT NULL, seen_version INTEGER NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (scope_ref, skill_id)
);
CREATE TABLE skill_settings (
  scope_ref TEXT NOT NULL, install_id TEXT NOT NULL, skill_id TEXT NOT NULL, state TEXT NOT NULL, enabled_at TEXT NOT NULL, enabled_by TEXT NOT NULL,
  revision INTEGER PRIMARY KEY AUTOINCREMENT, updated_at TEXT NOT NULL, actor_id TEXT NOT NULL,
  UNIQUE (scope_ref, install_id, skill_id)
);
CREATE TABLE skill_trials (
  trial_id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, draft_revision INTEGER NOT NULL, case_id TEXT NOT NULL, cells TEXT NOT NULL, verdict TEXT NOT NULL,
  ran_at TEXT NOT NULL, actor_id TEXT NOT NULL
);
CREATE TABLE skill_uses (
  install_id TEXT NOT NULL, skill_id TEXT NOT NULL, version INTEGER NOT NULL, name TEXT NOT NULL, ref TEXT NOT NULL, scope_ref TEXT NOT NULL,
  caller TEXT NOT NULL, run_ref TEXT, at TEXT NOT NULL
);
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
INSERT INTO "prompt_history"("key","revision","action","body","base_version","at","actor_id","default_ref") VALUES('io.molis.work.assistant/assistant-thread',1,'save','金样提示词 seed',2,'2026-01-15T09:00:00.000Z','web-user',NULL);
INSERT INTO "prompt_overrides"("key","revision","base_version","body","updated_at","actor_id","default_ref") VALUES('io.molis.work.assistant/assistant-thread',1,2,'金样提示词 seed','2026-01-15T09:00:00.000Z','web-user',NULL);
INSERT INTO "prompt_uses"("key","at","version","user_revision","caller","source_ref") VALUES('io.molis.work.assistant/assistant-base','2026-01-15T09:00:00.000Z',5,NULL,'agent:io.molis.work.assistant',NULL);
INSERT INTO "prompt_uses"("key","at","version","user_revision","caller","source_ref") VALUES('io.molis.work.assistant/assistant-compaction','2026-01-15T09:00:00.000Z',1,NULL,'agent:io.molis.work.assistant',NULL);
INSERT INTO "prompt_uses"("key","at","version","user_revision","caller","source_ref") VALUES('io.molis.work.assistant/assistant-delegated','2026-01-15T09:00:00.000Z',2,NULL,'agent:io.molis.work.assistant',NULL);
INSERT INTO "prompt_uses"("key","at","version","user_revision","caller","source_ref") VALUES('io.molis.work.assistant/assistant-ending-review','2026-01-15T09:00:00.000Z',2,NULL,'agent:io.molis.work.assistant',NULL);
INSERT INTO "prompt_uses"("key","at","version","user_revision","caller","source_ref") VALUES('io.molis.work.assistant/assistant-main','2026-01-15T09:00:00.000Z',1,NULL,'agent:io.molis.work.assistant',NULL);
INSERT INTO "prompt_uses"("key","at","version","user_revision","caller","source_ref") VALUES('io.molis.work.assistant/assistant-thread','2026-01-15T09:00:00.000Z',2,1,'agent:io.molis.work.assistant',NULL);
INSERT INTO "prompt_uses"("key","at","version","user_revision","caller","source_ref") VALUES('io.molis.work.assistant/assistant-work','2026-01-15T09:00:00.000Z',3,NULL,'agent:io.molis.work.assistant',NULL);
DELETE FROM sqlite_sequence;
CREATE INDEX prompt_uses_by_key ON prompt_uses(key, at);
CREATE INDEX skill_cases_by_owner ON skill_cases(owner_ref, created_at);
CREATE INDEX skill_drafts_by_scope ON skill_drafts(scope_ref, discarded_at);
CREATE INDEX skill_trials_by_draft ON skill_trials(draft_id, ran_at);
CREATE INDEX skill_uses_by_skill ON skill_uses(install_id, skill_id, at);
PRAGMA user_version=1;
COMMIT;

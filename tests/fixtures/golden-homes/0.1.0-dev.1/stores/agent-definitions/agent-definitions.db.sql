PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE personal_prompt_overrides_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE personal_prompt_overrides_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE personal_prompt_overrides_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE personal_prompt_overrides_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE personal_prompt_overrides_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE personal_prompt_overrides_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
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
INSERT INTO "personal_prompt_overrides_replica_changes"("seq","key") VALUES(1,'io.molis.work.assistant/assistant-thread');
INSERT INTO "personal_prompt_overrides_replica_changes"("seq","key") VALUES(2,'io.molis.work.feed/feed.information-plan');
INSERT INTO "personal_prompt_overrides_replica_state"("id","device","cursor","applying") VALUES(1,'2aa3d18e54c1169c9c4a16bc01c5090c',0,0);
INSERT INTO "prompt_history"("key","revision","action","body","base_version","at","actor_id","default_ref") VALUES('io.molis.work.assistant/assistant-thread',1,'save','金样提示词 seed',2,'2026-01-15T09:00:00.000Z','web-user',NULL);
INSERT INTO "prompt_history"("key","revision","action","body","base_version","at","actor_id","default_ref") VALUES('io.molis.work.feed/feed.information-plan',1,'save','r1',2,'2026-11-20T00:00:00.000Z','me',NULL);
INSERT INTO "prompt_history"("key","revision","action","body","base_version","at","actor_id","default_ref") VALUES('io.molis.work.feed/feed.information-plan',2,'save','r2',2,'2026-11-20T00:00:00.000Z','me',NULL);
INSERT INTO "prompt_overrides"("key","revision","base_version","body","updated_at","actor_id","default_ref") VALUES('io.molis.work.assistant/assistant-thread',1,2,'金样提示词 seed','2026-01-15T09:00:00.000Z','web-user',NULL);
INSERT INTO "prompt_overrides"("key","revision","base_version","body","updated_at","actor_id","default_ref") VALUES('io.molis.work.feed/feed.information-plan',2,2,'edited system:information/information.plan','2026-11-20T00:00:00.000Z','me',NULL);
INSERT INTO "prompt_uses"("key","at","version","user_revision","caller","source_ref") VALUES('io.molis.work.assistant/assistant-base','2026-01-15T09:00:00.000Z',5,NULL,'agent:io.molis.work.assistant',NULL);
INSERT INTO "prompt_uses"("key","at","version","user_revision","caller","source_ref") VALUES('io.molis.work.assistant/assistant-compaction','2026-01-15T09:00:00.000Z',1,NULL,'agent:io.molis.work.assistant',NULL);
INSERT INTO "prompt_uses"("key","at","version","user_revision","caller","source_ref") VALUES('io.molis.work.assistant/assistant-delegated','2026-01-15T09:00:00.000Z',2,NULL,'agent:io.molis.work.assistant',NULL);
INSERT INTO "prompt_uses"("key","at","version","user_revision","caller","source_ref") VALUES('io.molis.work.assistant/assistant-ending-review','2026-01-15T09:00:00.000Z',2,NULL,'agent:io.molis.work.assistant',NULL);
INSERT INTO "prompt_uses"("key","at","version","user_revision","caller","source_ref") VALUES('io.molis.work.assistant/assistant-main','2026-01-15T09:00:00.000Z',1,NULL,'agent:io.molis.work.assistant',NULL);
INSERT INTO "prompt_uses"("key","at","version","user_revision","caller","source_ref") VALUES('io.molis.work.assistant/assistant-thread','2026-01-15T09:00:00.000Z',2,1,'agent:io.molis.work.assistant',NULL);
INSERT INTO "prompt_uses"("key","at","version","user_revision","caller","source_ref") VALUES('io.molis.work.assistant/assistant-work','2026-01-15T09:00:00.000Z',4,NULL,'agent:io.molis.work.assistant',NULL);
INSERT INTO "prompt_uses"("key","at","version","user_revision","caller","source_ref") VALUES('io.molis.work.feed/feed.information-plan','2026-11-20T00:00:00.000Z',2,2,'plan',NULL);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('personal_prompt_overrides_replica_changes',2);
CREATE INDEX personal_prompt_overrides_replica_changes_key ON personal_prompt_overrides_replica_changes(key);
CREATE INDEX prompt_uses_by_key ON prompt_uses(key, at);
CREATE INDEX skill_cases_by_owner ON skill_cases(owner_ref, created_at);
CREATE INDEX skill_drafts_by_scope ON skill_drafts(scope_ref, discarded_at);
CREATE INDEX skill_trials_by_draft ON skill_trials(draft_id, ran_at);
CREATE INDEX skill_uses_by_skill ON skill_uses(install_id, skill_id, at);
CREATE TRIGGER personal_prompt_overrides_delete AFTER DELETE ON prompt_overrides BEGIN INSERT INTO personal_prompt_overrides_replica_changes(key) SELECT OLD.key WHERE (SELECT applying FROM personal_prompt_overrides_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER personal_prompt_overrides_insert AFTER INSERT ON prompt_overrides BEGIN INSERT INTO personal_prompt_overrides_replica_changes(key) SELECT NEW.key WHERE (SELECT applying FROM personal_prompt_overrides_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER personal_prompt_overrides_update AFTER UPDATE ON prompt_overrides BEGIN INSERT INTO personal_prompt_overrides_replica_changes(key) SELECT NEW.key WHERE (SELECT applying FROM personal_prompt_overrides_replica_state WHERE id=1)=0 AND (1=1); END;
PRAGMA user_version=1;
COMMIT;

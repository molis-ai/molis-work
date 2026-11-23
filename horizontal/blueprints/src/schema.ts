import type { HomeStoreDeclaration, SqliteBaseline } from "@molis-ai/molis-work-storage";
import { blueprintConfigJournal } from './replication.js';

export const BLUEPRINTS_STORE = "blueprints";
export const BLUEPRINTS_BASELINE: SqliteBaseline = {
  version: /* @version database.blueprints_baseline */ 2,
  schema: `
    CREATE TABLE blueprint_drafts (
      draft_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, project_id TEXT, revision INTEGER NOT NULL,
      locale TEXT NOT NULL, blueprint_json TEXT NOT NULL
    );
    CREATE TABLE adoptions (
      preview_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, origin_project TEXT, origin_detached INTEGER NOT NULL DEFAULT 0, project_id TEXT,
      preview_json TEXT NOT NULL, title_json TEXT NOT NULL, adoption_id TEXT UNIQUE, apply_request TEXT, selection_json TEXT,
      undo_request TEXT, undo_operation TEXT
    );
    CREATE UNIQUE INDEX adoptions_personal_request ON adoptions (actor_id, apply_request) WHERE origin_project IS NULL;
    CREATE UNIQUE INDEX adoptions_project_request ON adoptions (actor_id, origin_project, apply_request) WHERE origin_project IS NOT NULL AND origin_detached=0;
    CREATE TABLE adoption_steps (
      preview_id TEXT NOT NULL REFERENCES adoptions(preview_id) ON DELETE CASCADE,
      part_id TEXT NOT NULL, position INTEGER NOT NULL, plan_json TEXT NOT NULL,
      apply_json TEXT NOT NULL, undo_json TEXT, revision INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (preview_id, part_id)
    );
  ` + blueprintConfigJournal.schema,
  upgrades: [{ from: 1, sql: blueprintConfigJournal.upgrade }],
};
export const BLUEPRINTS_HOME_STORE: HomeStoreDeclaration = { path: BLUEPRINTS_STORE, library: { baseline: BLUEPRINTS_BASELINE } };

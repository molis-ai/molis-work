import type { HomeStoreDeclaration, SqliteBaseline } from "@molis-ai/molis-work-storage";

/**
 * The Functions store's one current schema (repository-anti-corruption §4.1): new stores are created from it, existing
 * ones must already be at its version, in the column order existing stores have; registered as `FUNCTIONS_HOME_STORE` (W4-11).
 * Current schema (PG-032 P2, S-90): `function_judgments.install_id` names the plugin installation that recorded a judgment through
 * `services.judgments` and is empty for a judgment the Host recorded itself; a plugin reads and loses only its own.
 */
export const FUNCTIONS_STORE_BASELINE: SqliteBaseline = { version: 1, schema: `
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
  CREATE INDEX function_judgments_subject_idx
    ON function_judgments(subject_kind, subject_id, project_id, created_at);
  CREATE TABLE function_scene_bindings (
    scene_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    action_binding_json TEXT NOT NULL,
    binding_revision TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (scene_id, project_id)
  );
` };

export const FUNCTIONS_HOME_STORE: HomeStoreDeclaration = { path: "functions", library: { baseline: FUNCTIONS_STORE_BASELINE } };

import type { HomePluginDatabaseDeclaration, PluginProjectRowsDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

const BRIEF_EDITOR_VERSIONS = "CREATE TABLE brief_editor_versions (id TEXT NOT NULL, project_id TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY (id, project_id));";

/**
 * What goes when a project is deleted, which the platform deletes from this library itself (PG-024): the project's briefs with their
 * versions, edits, proposals, next-step marks and request receipts. A personal brief has no project (`project_id` is empty) and stays.
 * A brief's fixed versions are pinned to the project's 成果库 in the same transaction as the row (`artifact_join`).
 */
const WORK_BRIEF_PROJECT_ROWS: PluginProjectRowsDeclaration = { label: { key: "work-brief.project-deletion.data" }, order: 45,
  artifact_join: { table: "briefs", id_column: "id", version_column: "version", artifact_id_column: "artifact_id",
    artifact_version_column: "artifact_version", write_columns: ["updated_at", "fixed_json"], pending_column: "publication_pending_json" },
  tables: [
    { table: "brief_versions", column: "brief_id", parent: "briefs" },
    { table: "brief_edits", column: "brief_id", parent: "briefs" },
    { table: "brief_proposals", column: "brief_id", parent: "briefs" },
    { table: "brief_next_marks", column: "brief_id", parent: "briefs" },
    { table: "brief_requests", column: "project_id" },
    { table: "brief_editor_versions", column: "project_id" },
    { table: "briefs", column: "project_id" },
  ] };

/**
 * Work Brief's one library in the Home, shared by its two halves: each project's half reads and writes its project's rows, the Home
 * half the person's own brief and, with the person's reach, the open items of their projects' briefs. Only this plugin reads and
 * writes these tables. Versions are append-only; a brief's `version` is its row revision (the artifact join's compare-and-set).
 */
export const WORK_BRIEF_DATABASE: HomePluginDatabaseDeclaration = { project_rows: WORK_BRIEF_PROJECT_ROWS, store_name: "work-brief",
  version: /* @version database.work_brief_database */ 1,
  read_permission: "work-brief:read", write_permission: "work-brief:write", schema: `
  CREATE TABLE briefs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL DEFAULT '',
    actor_id TEXT NOT NULL DEFAULT '',
    scope TEXT NOT NULL CHECK (scope IN ('home', 'topic', 'personal')),
    title TEXT NOT NULL,
    current_version INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    fixed_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    artifact_id TEXT NOT NULL DEFAULT '',
    artifact_version INTEGER NOT NULL DEFAULT 0,
    publication_pending_json TEXT
  );
  CREATE UNIQUE INDEX briefs_project_home ON briefs (project_id) WHERE scope = 'home';
  CREATE UNIQUE INDEX briefs_personal ON briefs (actor_id) WHERE scope = 'personal';
  CREATE INDEX briefs_project ON briefs (project_id, updated_at);
  CREATE TABLE brief_versions (
    brief_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    base_version INTEGER,
    as_of TEXT NOT NULL,
    created_at TEXT NOT NULL,
    produced_by_json TEXT NOT NULL,
    body_json TEXT NOT NULL,
    PRIMARY KEY (brief_id, version)
  );
  CREATE TABLE brief_edits (
    id TEXT PRIMARY KEY,
    brief_id TEXT NOT NULL,
    claim_id TEXT NOT NULL,
    text TEXT,
    base_version INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    at TEXT NOT NULL
  );
  CREATE INDEX brief_edits_brief ON brief_edits (brief_id, at);
  CREATE TABLE brief_proposals (
    id TEXT PRIMARY KEY,
    brief_id TEXT NOT NULL UNIQUE,
    base_version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    produced_by_json TEXT NOT NULL,
    body_json TEXT NOT NULL,
    conflicts_json TEXT NOT NULL
  );
  CREATE TABLE brief_next_marks (
    brief_id TEXT NOT NULL,
    option_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('later', 'handed', 'running', 'done', 'failed', 'stale')),
    card_json TEXT,
    actor_id TEXT NOT NULL,
    at TEXT NOT NULL,
    PRIMARY KEY (brief_id, option_id)
  );
  CREATE TABLE brief_requests (
    project_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    result_json TEXT NOT NULL,
    at TEXT NOT NULL,
    PRIMARY KEY (project_id, actor_id, request_id)
  );
  ${BRIEF_EDITOR_VERSIONS}
` };

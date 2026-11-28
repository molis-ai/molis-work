import { OVERVIEW_TABLE_SQL, type PartitionPluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

const BRIEF_EDITOR_VERSIONS = "CREATE TABLE brief_editor_versions (id TEXT PRIMARY KEY, version INTEGER NOT NULL);";

/**
 * Work Brief's library in each partition it is enabled in, the personal space as well as each project (`databases.partition`,
 * specs/unified-partition-plugins §5, batch 109): `<partition>/libraries/work-brief.db`, so no row names its partition and deleting a project
 * takes the whole file. Only this plugin reads and writes these tables. Versions are append-only; a brief's `version` is its row revision
 * (the pin's compare-and-set). A fixed version is pinned to the partition's 成果库 in the same transaction as the row (`pinned_rows`). The
 * partition's own brief keeps a `brief` row in the platform's overview table, which the personal space's overview reads across partitions.
 */
export const WORK_BRIEF_DATABASE: PartitionPluginDatabaseDeclaration = { store_name: "work-brief", deletion: { label: { key: "work-brief.project-deletion.data" }, order: 45 },
  version: /* @version database.work_brief_database */ 1,
  read_permission: "work-brief:read", write_permission: "work-brief:write",
  pinned_rows: { table: "briefs", id_column: "id", version_column: "version", artifact_id_column: "artifact_id",
    artifact_version_column: "artifact_version", write_columns: ["updated_at", "fixed_json"], pending_column: "publication_pending_json" },
  schema: `
  CREATE TABLE briefs (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL CHECK (scope IN ('home', 'topic')),
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
  CREATE UNIQUE INDEX briefs_home ON briefs (scope) WHERE scope = 'home';
  CREATE INDEX briefs_updated ON briefs (updated_at);
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
    actor_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    result_json TEXT NOT NULL,
    at TEXT NOT NULL,
    PRIMARY KEY (actor_id, request_id)
  );
  ${BRIEF_EDITOR_VERSIONS}
  ${OVERVIEW_TABLE_SQL}
` };

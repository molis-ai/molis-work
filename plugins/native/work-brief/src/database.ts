import type { HomePluginDatabaseDeclaration, PluginProjectRowsDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

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
    { table: "briefs", column: "project_id" },
  ] };

/**
 * A stored sentence as the words it was: `{ "literal": … }`. A reference holds at most 2000 UTF-16 units, never more than a text's UTF-8 bytes,
 * so a longer one is cut to 999 characters and an ellipsis (each at most two units).
 */
const literal = (text: string) => `json_object('literal', CASE WHEN length(CAST(${text} AS BLOB)) <= 2000 THEN ${text} ELSE substr(${text}, 1, 999) || '…' END)`;
/** A source's name kept as words; an empty one, which no reference holds, as the plugin's id. */
const nameAsText = (row: string) => `json_set(${row}, '$.name', ${literal(`CASE WHEN json_extract(${row}, '$.name') = '' THEN json_extract(${row}, '$.plugin_id') ELSE json_extract(${row}, '$.name') END`)})`;
/** A card's outcome kept as words; an empty one is no outcome. */
const outcomeAsText = (doc: string, path: string) => `CASE WHEN json_extract(${doc}, '${path}') = '' THEN json_remove(${doc}, '${path}') ELSE json_set(${doc}, '${path}', ${literal(`json_extract(${doc}, '${path}')`)}) END`;
/** Every element of the array at `array` in `table.column` that `needs` it, changed by `change`; the others and the order as they were. */
const eachElement = (table: string, column: string, array: string, needs: (element: string) => string, change: (element: string) => string) =>
  `UPDATE ${table} SET ${column} = json_set(${column}, '${array}', json((SELECT json_group_array(json(CASE WHEN ${needs("e.value")} THEN ${change("e.value")} ELSE e.value END) ORDER BY e.key) FROM json_each(${column}, '${array}') e)))
    WHERE EXISTS (SELECT 1 FROM json_each(${column}, '${array}') e WHERE ${needs("e.value")});`;
const namesAt = (table: string, column: string, body: string) => eachElement(table, column, `${body}.sources`, row => `json_type(${row}, '$.name') = 'text'`, nameAsText);
const outcomesAt = (table: string, column: string, body: string) => eachElement(table, column, `${body}.next`, option => `json_type(${option}, '$.act.card.outcome') = 'text'`,
  option => outcomeAsText(option, "$.act.card.outcome"));

/**
 * 1 → 2 (BL-work-brief-source-name-text, BL-action-card-outcome-text; user 2026-11-17): a source's name and a card's outcome were kept as display
 * text in the language of the day they were written, and are now references that read in the language shown. Text already written cannot be
 * taken back to its key, so it stays the words it was, as a `literal`: in versions, proposals, the answers kept for repeated requests, and the
 * cards of next-step marks. A fixed version in the 成果库 is the platform's record and stays as it was fixed.
 */
const WORK_BRIEF_STORED_TEXT_SQL = [
  ...[["brief_versions", "body_json", "$"], ["brief_proposals", "body_json", "$"], ["brief_requests", "result_json", "$.version"], ["brief_requests", "result_json", "$.proposal.body"]]
    .flatMap(([table, column, body]) => [namesAt(table!, column!, body!), outcomesAt(table!, column!, body!)]),
  `UPDATE brief_next_marks SET card_json = ${outcomeAsText("card_json", "$.outcome")} WHERE json_type(card_json, '$.outcome') = 'text';`,
].join("\n");

/**
 * Work Brief's one library in the Home, shared by its two halves: each project's half reads and writes its project's rows, the Home
 * half the person's own brief and, with the person's reach, the open items of their projects' briefs. Only this plugin reads and
 * writes these tables. Versions are append-only; a brief's `version` is its row revision (the artifact join's compare-and-set).
 */
export const WORK_BRIEF_DATABASE: HomePluginDatabaseDeclaration = { project_rows: WORK_BRIEF_PROJECT_ROWS, store_name: "work-brief",
  version: /* @version database.work_brief_database */ 2, upgrades: [{ from: 1, sql: WORK_BRIEF_STORED_TEXT_SQL }], read_permission: "work-brief:read", write_permission: "work-brief:write", schema: `
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
` };

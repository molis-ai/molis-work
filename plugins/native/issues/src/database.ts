import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

export const ISSUES_DATABASE: PluginDatabaseDeclaration = {
  store_name: "issues", version: 2, read_permission: "issues:read", write_permission: "issues:write",
  schema: `CREATE TABLE issues (
    id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
    type TEXT NOT NULL CHECK(type IN ('bug','experience','feature')), description TEXT NOT NULL CHECK(length(description) <= 100000),
    context_json TEXT NOT NULL, images_json TEXT NOT NULL, submitter_id TEXT NOT NULL,
    entered_via TEXT NOT NULL CHECK(entered_via IN ('manual','assistant','mcp')),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL CHECK(version >= 1)
  ); CREATE INDEX issues_by_submitter_created ON issues(submitter_id,created_at DESC,id DESC);`,
};

import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * Risk's tables in each project's library (`databases.project`, PG-020): the risks themselves, what each is linked to, and its
 * history. Only this plugin reads and writes them. A risk's reviews are not here: they are Schedule's tasks, found by the risk they
 * are about (specs/risk-plugin/implementation.md §4.5), so no second copy of their time or state is kept.
 */
export const RISK_PROJECT_DATABASE: PluginDatabaseDeclaration = {
  store_name: "risk",
  version: /* @version database.risk_project_database */ 1,
  schema: `
    CREATE TABLE IF NOT EXISTS risk_items (
      risk_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      statement TEXT NOT NULL,
      impact TEXT NOT NULL CHECK (impact IN ('high', 'medium', 'low')),
      likelihood TEXT NOT NULL CHECK (likelihood IN ('high', 'medium', 'low')),
      treatment TEXT NOT NULL,
      owner_name TEXT,
      status TEXT NOT NULL CHECK (status IN ('open', 'mitigating', 'accepted', 'closed')),
      revision INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      closed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS risk_items_status_idx ON risk_items(project_id, status, updated_at);
    CREATE TABLE IF NOT EXISTS risk_links (
      risk_id TEXT NOT NULL REFERENCES risk_items(risk_id) ON DELETE CASCADE,
      subject_kind TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      added_by TEXT NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (risk_id, subject_kind, subject_id)
    );
    CREATE INDEX IF NOT EXISTS risk_links_subject_idx ON risk_links(subject_kind, subject_id);
    CREATE TABLE IF NOT EXISTS risk_events (
      event_id TEXT PRIMARY KEY,
      risk_id TEXT NOT NULL REFERENCES risk_items(risk_id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('created', 'updated', 'status', 'note', 'linked', 'unlinked')),
      detail_json TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS risk_events_risk_idx ON risk_events(risk_id, at);
  `,
  read_permission: "storage:private",
  write_permission: "storage:private",
};

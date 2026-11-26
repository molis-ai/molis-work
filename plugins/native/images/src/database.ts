import { OVERVIEW_TABLE_SQL, type PartitionPluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * The images store's one current schema (repository-anti-corruption §4.1): new stores are created from it, existing ones must already be at
 * its version. Each partition Images is enabled in keeps its own (`<partition>/libraries/images.db`, specs/unified-partition-plugins §4.2,
 * batch 108), and its pictures in that partition's plugin files; deleting a project takes both. The image services are the person's and
 * live in `person_settings` (`connections.ts`). `project_id` is always this partition's: the synced and copied record still names it until
 * batch 111 rewrites the keys of every plugin with business objects.
 */
export const IMAGES_DATABASE: PartitionPluginDatabaseDeclaration = {
  deletion: { label: { key: "images.project-deletion.data" }, order: 90 },
  store_name: "images", version: /* @version database.images_database */ 1, upgrades: [], read_permission: "storage:private", write_permission: "storage:private", schema: `
  CREATE TABLE jobs (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, request_id TEXT NOT NULL,
    input_hash TEXT NOT NULL, connection_id TEXT NOT NULL, connection_name TEXT NOT NULL,
    api_format TEXT NOT NULL, model TEXT NOT NULL, prompt TEXT NOT NULL,
    size TEXT NOT NULL, aspect_ratio TEXT NOT NULL, status TEXT NOT NULL,
    images_json TEXT NOT NULL, error TEXT NOT NULL,
    created_at TEXT NOT NULL, finished_at TEXT, runner_id TEXT,
    UNIQUE (project_id, request_id)
  );
  CREATE INDEX jobs_project_created ON jobs(project_id, created_at DESC);
  ${OVERVIEW_TABLE_SQL}
` };

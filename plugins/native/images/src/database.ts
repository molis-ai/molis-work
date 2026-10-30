import type { HomePluginDatabaseDeclaration, PluginProjectRowsDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { IMAGES_ASSETS } from "./owner-files.js";

/**
 * A project's jobs, and the pictures they hold in `assets/`, which the platform deletes with the project (PG-024). Pending and
 * running jobs are stopped first by the platform's background jobs (PG-038); a job finishing in another process loses its record.
 */
const IMAGES_PROJECT_ROWS: PluginProjectRowsDeclaration = {
  label: "图片生成记录和已生成的图片", order: 90,
  tables: [{ table: "jobs", column: "project_id" }],
  files: [{ table: "jobs", column: "images_json", key: "filename", directory: IMAGES_ASSETS }],
};

/** Private data only: credentials are owned by the Host secret store. */
/**
 * The images store's one current schema (repository-anti-corruption §4.1): new stores are created from it, existing ones
 * must already be at its version.
 */
export const IMAGES_DATABASE: HomePluginDatabaseDeclaration = { project_rows: IMAGES_PROJECT_ROWS, store_name: "images", version: 1, read_permission: "storage:private", write_permission: "storage:private", schema: `
  CREATE TABLE connections (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, api_format TEXT NOT NULL,
    base_url TEXT NOT NULL, model TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
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
` };

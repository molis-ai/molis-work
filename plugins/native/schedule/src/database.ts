import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

// The tables live here, not beside the code that reads them: the manifest declares this file, and tasks, reminders and operations
// import the manifest, so declaring from them would load the manifest half-made.

/** Conversation tasks and their turns. */
const SCHEDULE_TASKS_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS schedule_conversation_tasks (
      task_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      instructions TEXT NOT NULL,
      hour INTEGER NOT NULL,
      minute INTEGER NOT NULL,
      notify_important INTEGER NOT NULL CHECK (notify_important IN (0, 1)),
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
      unread INTEGER NOT NULL CHECK (unread IN (0, 1)),
      job_id TEXT,
      last_run_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS schedule_conversation_tasks_enabled_idx
      ON schedule_conversation_tasks(enabled, updated_at);
    CREATE TABLE IF NOT EXISTS schedule_conversation_turns (
      turn_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('user', 'assistant', 'system')),
      text TEXT NOT NULL,
      important INTEGER NOT NULL CHECK (important IN (0, 1)),
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES schedule_conversation_tasks(task_id)
    );
    CREATE INDEX IF NOT EXISTS schedule_conversation_turns_task_idx
      ON schedule_conversation_turns(task_id, created_at);
`;

/** Plugin reminders. */
const SCHEDULE_REMINDERS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS schedule_plugin_reminders (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, plugin_id TEXT NOT NULL, installation_id TEXT,
    record_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS schedule_plugin_reminders_owner ON schedule_plugin_reminders(project_id, plugin_id, installation_id);
`;

/** Scheduled operations and their occurrences. */
const SCHEDULED_OPERATIONS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS schedule_operations (
    project_id TEXT NOT NULL, id TEXT NOT NULL, job_id TEXT NOT NULL UNIQUE, record_json TEXT NOT NULL,
    PRIMARY KEY (project_id, id)
  );
  CREATE TABLE IF NOT EXISTS schedule_operation_occurrences (
    project_id TEXT NOT NULL, operation_id TEXT NOT NULL, due_at TEXT NOT NULL, record_json TEXT NOT NULL,
    PRIMARY KEY (project_id, operation_id, due_at)
  );
`;

/**
 * Schedule's own tables in each project's library (`databases.project`, PG-020): conversation tasks and their turns, plugin
 * reminders, scheduled operations and their occurrences. The jobs themselves are the Scheduler's, in the library's baseline. The
 * platform makes these the first time the library opens with Schedule and refuses to open them again if their version or shape
 * has changed, stopping only Schedule.
 */
export const SCHEDULE_PROJECT_DATABASE: PluginDatabaseDeclaration = {
  store_name: "schedule",
  version: 1,
  schema: [SCHEDULE_TASKS_SCHEMA_SQL, SCHEDULE_REMINDERS_SCHEMA_SQL, SCHEDULED_OPERATIONS_SCHEMA_SQL].join("\n"),
  read_permission: "storage:private",
  write_permission: "storage:private",
};

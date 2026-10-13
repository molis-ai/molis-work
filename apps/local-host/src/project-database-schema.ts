import { LOCAL_JOURNAL_SCHEMA_SQL, LOCAL_OPAQUE_BLOB_SCHEMA_SQL, type SqliteBaseline } from "@molis-ai/molis-work-storage";
import {
  GOAL_BOARDS_SCHEMA_SQL,
  GOAL_EVENT_FACTS_SCHEMA_SQL,
  GOAL_EVENT_STATE_SCHEMA_SQL,
  GOAL_INPUT_BINDINGS_SCHEMA_SQL,
  GOALS_SCHEMA_SQL,
} from "@molis-ai/molis-work-module-goals";
import { GOVERNANCE_SCHEMA_SQL } from "@molis-ai/molis-work-module-governance-collaboration";
import { ARTIFACTS_SCHEMA_SQL, PROCESS_ITEMS_SCHEMA_SQL } from "@molis-ai/molis-work-module-artifacts";
import { CONTEXT_LEDGER_SCHEMA } from "@molis-ai/molis-work-module-context-ledger";
import { SOURCES_SCHEMA_SQL } from "@molis-ai/molis-work-module-sources";
import { SIGNALS_SCHEMA_SQL } from "@molis-ai/molis-work-module-signals";
import { ATTENTION_SCHEMA_SQL } from "@molis-ai/molis-work-module-attention-resumption";
import { FEED_SCHEMA_SQL } from "@molis-ai/molis-work-module-feed";
import { LISTENER_HOST_SCHEMA_SQL } from "@molis-ai/molis-work-service-listener-host";
import { SCHEDULER_SCHEMA_SQL } from "@molis-ai/molis-work-service-scheduler";
import {
  PLUGIN_EVENTS_SCHEMA_SQL,
  PLUGIN_PRIVATE_STORAGE_SCHEMA_SQL,
  PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL,
  PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL,
  PLUGIN_WIRING_SCHEMA_SQL,
} from "@molis-ai/molis-work-plugin-runtime";
import { FEED_OUT_RULES_SCHEMA_SQL } from "@molis-ai/molis-work-plugin-feed";
import { SCHEDULE_REMINDERS_SCHEMA_SQL, SCHEDULE_TASKS_SCHEMA_SQL, SCHEDULED_OPERATIONS_SCHEMA_SQL } from "@molis-ai/molis-work-plugin-schedule";
import { CODING_SCHEMA_SQL } from "@molis-ai/molis-work-plugin-coding";
import { PROJECT_BROWSING_SETTINGS_SCHEMA_SQL } from "./project-browsing-settings.js";

/**
 * A project's database (`projects/<id>/molis-work.db`) as one current schema (repository-anti-corruption §4.1): every
 * owner that keeps tables there hands over its creation statements, and the host creates them all at once with the
 * version. A database at another version is refused, never upgraded in place. Owners still create their own tables
 * when they open (`IF NOT EXISTS`), which is a no-op here; changing any of them means a new version.
 */
export const PROJECT_DATABASE_BASELINE: SqliteBaseline = {
  version: 7,
  schema: [
    GOAL_BOARDS_SCHEMA_SQL,
    GOALS_SCHEMA_SQL,
    GOAL_INPUT_BINDINGS_SCHEMA_SQL,
    GOAL_EVENT_FACTS_SCHEMA_SQL,
    GOAL_EVENT_STATE_SCHEMA_SQL,
    GOVERNANCE_SCHEMA_SQL,
    ARTIFACTS_SCHEMA_SQL,
    PROCESS_ITEMS_SCHEMA_SQL,
    LOCAL_JOURNAL_SCHEMA_SQL,
    CONTEXT_LEDGER_SCHEMA,
    SOURCES_SCHEMA_SQL,
    SIGNALS_SCHEMA_SQL,
    LISTENER_HOST_SCHEMA_SQL,
    ATTENTION_SCHEMA_SQL,
    FEED_SCHEMA_SQL,
    FEED_OUT_RULES_SCHEMA_SQL,
    LOCAL_OPAQUE_BLOB_SCHEMA_SQL,
    PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL,
    PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL,
    PLUGIN_PRIVATE_STORAGE_SCHEMA_SQL,
    PLUGIN_EVENTS_SCHEMA_SQL,
    PLUGIN_WIRING_SCHEMA_SQL,
    SCHEDULER_SCHEMA_SQL,
    SCHEDULE_TASKS_SCHEMA_SQL,
    SCHEDULE_REMINDERS_SCHEMA_SQL,
    SCHEDULED_OPERATIONS_SCHEMA_SQL,
    CODING_SCHEMA_SQL,
    PROJECT_BROWSING_SETTINGS_SCHEMA_SQL,
  ].join("\n"),
};

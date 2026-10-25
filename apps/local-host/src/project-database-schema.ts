import { LOCAL_JOURNAL_SCHEMA_SQL, LOCAL_OPAQUE_BLOB_SCHEMA_SQL, type SqliteBaseline } from "@molis-ai/molis-work-storage";
import { PROJECT_ROOT_SCHEMA_SQL } from "@molis-ai/molis-work-module-projects";
import { ARTIFACTS_SCHEMA_SQL, PROCESS_ITEMS_SCHEMA_SQL } from "@molis-ai/molis-work-module-artifacts";
import { CONTEXT_LEDGER_SCHEMA } from "@molis-ai/molis-work-module-context-ledger";
import { SOURCES_SCHEMA_SQL } from "@molis-ai/molis-work-plugin-feed/store";
import { SIGNALS_SCHEMA_SQL } from "@molis-ai/molis-work-plugin-feed/store";
import { ATTENTION_SCHEMA_SQL } from "@molis-ai/molis-work-module-attention-resumption";
import { FEED_SCHEMA_SQL } from "@molis-ai/molis-work-plugin-feed/store";
import { LISTENER_HOST_SCHEMA_SQL } from "@molis-ai/molis-work-plugin-feed/store";
import { SCHEDULER_SCHEMA_SQL } from "@molis-ai/molis-work-service-scheduler";
import {
  PLUGIN_EVENTS_SCHEMA_SQL,
  PLUGIN_PRIVATE_STORAGE_SCHEMA_SQL,
  PLUGIN_PROJECT_DATABASES_SCHEMA_SQL,
  PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL,
  PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL,
  PLUGIN_WIRING_SCHEMA_SQL,
} from "@molis-ai/molis-work-plugin-runtime";
import { PROJECT_BROWSING_SETTINGS_SCHEMA_SQL } from "./project-browsing-settings.js";

/**
 * A project's database (`projects/<id>/molis-work.db`) as one current schema (repository-anti-corruption §4.1): every
 * platform and Module owner that keeps tables there hands over its creation statements, and the host creates them all at
 * once with the version. A database at another version is refused, never upgraded in place. Owners still create their own
 * tables when they open (`IF NOT EXISTS`), which is a no-op here; changing any of them means a new version.
 *
 * No plugin's table is here (PLIB-01): a plugin declares its own in its Manifest (`databases.project`), and the platform makes
 * them the first time the library opens with that plugin and records them in `plugin_project_databases`
 * (`project-plugin-databases.ts`). The project's root row comes first; every project table points its foreign key at it.
 * Goals' and Governance's tables are not here either: Goals declares them (S8).
 */
export const PROJECT_DATABASE_BASELINE: SqliteBaseline = {
  version: 10,
  schema: [
    PROJECT_ROOT_SCHEMA_SQL,
    ARTIFACTS_SCHEMA_SQL,
    PROCESS_ITEMS_SCHEMA_SQL,
    LOCAL_JOURNAL_SCHEMA_SQL,
    CONTEXT_LEDGER_SCHEMA,
    SOURCES_SCHEMA_SQL,
    SIGNALS_SCHEMA_SQL,
    LISTENER_HOST_SCHEMA_SQL,
    ATTENTION_SCHEMA_SQL,
    FEED_SCHEMA_SQL,
    LOCAL_OPAQUE_BLOB_SCHEMA_SQL,
    PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL,
    PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL,
    PLUGIN_PRIVATE_STORAGE_SCHEMA_SQL,
    PLUGIN_EVENTS_SCHEMA_SQL,
    PLUGIN_WIRING_SCHEMA_SQL,
    PLUGIN_PROJECT_DATABASES_SCHEMA_SQL,
    SCHEDULER_SCHEMA_SQL,
    PROJECT_BROWSING_SETTINGS_SCHEMA_SQL,
  ].join("\n"),
};

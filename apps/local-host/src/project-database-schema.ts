import { PROJECT_REPLICATION_SCHEMA_SQL } from './project-replication-schema.js';
import { STORAGE_SPACE_SCHEMA_SQL } from "@molis-ai/molis-work-storage";
import { LOCAL_JOURNAL_SCHEMA_SQL, LOCAL_OPAQUE_BLOB_SCHEMA_SQL, personalConfigJournal, replicaMarkSql, replicaSchemaSql, type SqliteBaseline } from "@molis-ai/molis-work-storage";
import { MATERIAL_RECENT_USES_SCHEMA_SQL, PROJECT_GUIDANCE_SCHEMA_SQL, PROJECT_ROOT_SCHEMA_SQL, SINGLE_PROJECT_ROOT_SQL } from "@molis-ai/molis-work-module-projects";
import { ARTIFACTS_SCHEMA_SQL, PROCESS_ITEMS_SCHEMA_SQL } from "@molis-ai/molis-work-module-artifacts";
import { CONTEXT_LEDGER_SCHEMA } from "@molis-ai/molis-work-module-context-ledger";
import { attentionContentReplicationDefinition, ATTENTION_SCHEMA_SQL } from "@molis-ai/molis-work-module-attention-resumption";
import { ACCEPTANCE_SCHEMA_SQL } from "@molis-ai/molis-work-module-acceptance";
import { SCHEDULER_SCHEMA_SQL } from "@molis-ai/molis-work-service-scheduler";
import { SURFACE_CORRECTIONS_SCHEMA_SQL, SURFACE_CONFIG_JOURNAL, surfaceConfigJournal } from "@molis-ai/molis-work-service-surfaces";
import { PROJECT_APPROVALS_SCHEMA_SQL } from "@molis-ai/molis-work-service-project-approvals";
import { PROJECT_RUNTIME_SETTINGS_SCHEMA_SQL } from "./project-runtime-settings.js";
import {
  PLUGIN_EVENTS_SCHEMA_SQL,
  PLUGIN_NOTIFICATIONS_SCHEMA_SQL,
  PLUGIN_PRIVATE_STORAGE_SCHEMA_SQL,
  PLUGIN_PROJECT_DATABASES_SCHEMA_SQL,
  PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL,
  PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL,
  PLUGIN_WIRING_SCHEMA_SQL,
} from "@molis-ai/molis-work-plugin-runtime";

/**
 * A project's database (`projects/<id>/molis-work.db`) as one current schema (repository-anti-corruption §4.1): every
 * platform and Module owner that keeps tables there hands over its creation statements, and the host creates them all at
 * once with the version. The Host upgrade process runs the declared steps before the normal owner opens the database. Owners still create their own
 * tables when they open (`IF NOT EXISTS`), which is a no-op here; changing any of them means a new version.
 *
 * No plugin's table is here (PLIB-01): a plugin declares its own in its Manifest (`databases.project`), and the platform makes
 * them the first time the library opens with that plugin and records them in `plugin_project_databases`
 * (`project-plugin-databases.ts`). The project's root row comes first; every project table points its foreign key at it.
 * Platform project approvals (`horizontal/project-approvals`), project guidance (`modules/projects`), and acceptance
 * (`modules/acceptance`) live in this baseline; plugin-owned tables (Goals, Feed, Coding, Inbox, Risk, Schedule) are declared by their plugins.
 */
const surfaceTracking = surfaceConfigJournal(SINGLE_PROJECT_ROOT_SQL);
const SURFACE_CONFIG_TRACKING = personalConfigJournal(SURFACE_CONFIG_JOURNAL, surfaceTracking.table, surfaceTracking.key, surfaceTracking.eligible);

/**
 * The journal of the person's waiting list ("等你", `system.attention`, 44B): one key per project, `[project, 'project_attention', project]`,
 * marked by every change to the attention tables. It is the platform's, so it is here whichever plugin shows the list; until 44B it was
 * the Inbox plugin's sync section and went with Inbox.
 */
export const ATTENTION_SYNC_JOURNAL = "attention";
const attentionKey = (row: string) => `json_array(${row}.project_id,'project_attention',${row}.project_id)`;
const attentionTables = attentionContentReplicationDefinition().tables.map(table => table.name);
const ATTENTION_SYNC_TRACKING_SQL = replicaSchemaSql(ATTENTION_SYNC_JOURNAL)
  + `\nINSERT INTO ${ATTENTION_SYNC_JOURNAL}_replica_state(id,device) VALUES(1,lower(hex(randomblob(16))));\n`
  + attentionTables.flatMap(table => (["INSERT", "UPDATE", "DELETE"] as const).map(change =>
    `CREATE TRIGGER ${ATTENTION_SYNC_JOURNAL}_${table}_${change.toLowerCase()} AFTER ${change} ON ${table} BEGIN ${replicaMarkSql(attentionKey(change === "DELETE" ? "OLD" : "NEW"), undefined, ATTENTION_SYNC_JOURNAL)} END;`)).join("\n");

const PROJECT_DATABASE_SCHEMA = [
  STORAGE_SPACE_SCHEMA_SQL,
  PROJECT_ROOT_SCHEMA_SQL,
  ARTIFACTS_SCHEMA_SQL,
  PROCESS_ITEMS_SCHEMA_SQL,
  LOCAL_JOURNAL_SCHEMA_SQL,
  CONTEXT_LEDGER_SCHEMA,
  ATTENTION_SCHEMA_SQL,
  ATTENTION_SYNC_TRACKING_SQL,
  LOCAL_OPAQUE_BLOB_SCHEMA_SQL,
  PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL,
  PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL,
  PLUGIN_PRIVATE_STORAGE_SCHEMA_SQL,
  PLUGIN_EVENTS_SCHEMA_SQL,
  PLUGIN_NOTIFICATIONS_SCHEMA_SQL,
  PLUGIN_WIRING_SCHEMA_SQL,
  PLUGIN_PROJECT_DATABASES_SCHEMA_SQL,
  SCHEDULER_SCHEMA_SQL,
  MATERIAL_RECENT_USES_SCHEMA_SQL,
  PROJECT_REPLICATION_SCHEMA_SQL,
  SURFACE_CORRECTIONS_SCHEMA_SQL,
  SURFACE_CONFIG_TRACKING.schema,
  PROJECT_APPROVALS_SCHEMA_SQL,
  PROJECT_RUNTIME_SETTINGS_SCHEMA_SQL,
  PROJECT_GUIDANCE_SCHEMA_SQL,
  ACCEPTANCE_SCHEMA_SQL,
].join("\n");

export const PROJECT_DATABASE_BASELINE: SqliteBaseline = {
  version: /* @version database.project_database_baseline */ 1,
  schema: PROJECT_DATABASE_SCHEMA,
  upgrades: [],
};

import { ADOPTED_PROCESS_ITEMS_JOURNAL_SQL, ADOPTED_PROCESS_ITEMS_TRIGGERS_SQL, PROJECT_REPLICATION_SCHEMA_SQL } from './project-replication-schema.js';
import { STORAGE_SPACE_SCHEMA_SQL } from "@molis-ai/molis-work-storage";
import { LOCAL_JOURNAL_SCHEMA_SQL, LOCAL_OPAQUE_BLOB_SCHEMA_SQL, type SqliteBaseline } from "@molis-ai/molis-work-storage";
import { MATERIAL_RECENT_USES_SCHEMA_SQL, PROJECT_ROOT_SCHEMA_SQL } from "@molis-ai/molis-work-module-projects";
import { ARTIFACTS_SCHEMA_SQL, PROCESS_ITEMS_SCHEMA_SQL } from "@molis-ai/molis-work-module-artifacts";
import { CONTEXT_LEDGER_SCHEMA } from "@molis-ai/molis-work-module-context-ledger";
import { ATTENTION_SCHEMA_SQL } from "@molis-ai/molis-work-module-attention-resumption";
import { SCHEDULER_SCHEMA_SQL } from "@molis-ai/molis-work-service-scheduler";
import { SURFACE_CORRECTIONS_SCHEMA_SQL } from "@molis-ai/molis-work-service-surfaces";
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
 * once with the version. A database at another version is refused, never upgraded in place. Owners still create their own
 * tables when they open (`IF NOT EXISTS`), which is a no-op here; changing any of them means a new version.
 *
 * No plugin's table is here (PLIB-01): a plugin declares its own in its Manifest (`databases.project`), and the platform makes
 * them the first time the library opens with that plugin and records them in `plugin_project_databases`
 * (`project-plugin-databases.ts`). The project's root row comes first; every project table points its foreign key at it.
 * Goals' and Governance's tables are not here either: Goals declares them (S8), and Feed declares the Feed items, Sources, Signals and
 * Listener Host tables along with its out rules.
 */
/** The six process-item journal triggers, by the names both journals give them. */
export const PROCESS_ITEMS_TRIGGER_NAMES: readonly string[] = ["identity", "version"].flatMap(row => ["insert", "update", "delete"].map(operation => `process_items_sync_${row}_${operation}`));

/**
 * The library as version 2 left it, with the adopted process-items journal: the layout the Files retirement's adoption brings a version-2
 * library to before it takes the later steps (`project-layout.ts`). Version 3 adds the surface corrections after it.
 */
export const PROJECT_DATABASE_VERSION_2_SCHEMA = [
  STORAGE_SPACE_SCHEMA_SQL,
  PROJECT_ROOT_SCHEMA_SQL,
  ARTIFACTS_SCHEMA_SQL,
  PROCESS_ITEMS_SCHEMA_SQL,
  LOCAL_JOURNAL_SCHEMA_SQL,
  CONTEXT_LEDGER_SCHEMA,
  ATTENTION_SCHEMA_SQL,
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
].join("\n");

export const PROJECT_DATABASE_BASELINE: SqliteBaseline = {
  version: /* @version database.project_database_baseline */ 3,
  schema: `${PROJECT_DATABASE_VERSION_2_SCHEMA}\n${SURFACE_CORRECTIONS_SCHEMA_SQL}`,
  upgrades: [
    // 1 → 2 (specs/shared-sources-and-surfaces §2.1, §3): where a project was browsed is no setting any more, and 「最近用过」 starts empty.
    // The step also lands on the adopted process-items journal (user 2026-11-12, specs/batch-06-shared-tools/current-version-adoption.md):
    // the same trigger names now mark the new journal, the original journal stays untouched. Structure only; business rows are not converted.
    { from: 1, sql: `DROP TABLE project_browsing_settings;\n${MATERIAL_RECENT_USES_SCHEMA_SQL}\n${PROCESS_ITEMS_TRIGGER_NAMES.map(name => `DROP TRIGGER ${name};`).join("\n")}\n${ADOPTED_PROCESS_ITEMS_JOURNAL_SQL}\n${ADOPTED_PROCESS_ITEMS_TRIGGERS_SQL}`,
      reduces_rows: ["project_browsing_settings"] },
    // 2 → 3: the Host keeps the person's corrections of what a surface showed (batch 15).
    { from: 2, sql: SURFACE_CORRECTIONS_SCHEMA_SQL },
  ],
};

import { basename, dirname, join, relative } from "node:path";
import { readdirSync } from "node:fs";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginProjectTablesVersion } from "@molis-ai/molis-work-plugin-runtime";
import {
  CATALOG_VERSION_ACCESS, catalogOwner, entryAt, openHomeSqliteFile, openSqliteConnection, readDatabaseSpace, readUpgradeStore, SECRET_STORE_FILE,
  upgradeFailedRefusal, upgradeStepsProblem, USER_VERSION_ACCESS, type HomeStore, type StorageSpace,
} from "@molis-ai/molis-work-storage";
import { SHELF_CATALOG_FILE } from "@molis-ai/molis-work-module-shelf";
import { BROWSER_SITES_FILE } from "./browser/browser-surfaces.js";
import { COMPUTER_RECORD_FILE, COMPUTER_RECORD_ID } from "./computer/computer-records.js";
import { COMPUTER_SETTINGS_FILE } from "./computer/computer-settings.js";
import { MCP_TOOL_PREFERENCE_FILE } from "./mcp-settings-store.js";
import { MODEL_PREFERENCE_FILE } from "./model-configuration.js";
import { ONBOARDING_FILE } from "./onboarding.js";
import { PROJECT_ARRIVAL_FILE } from "./project-arrival.js";
import { listProjectDatabasePaths } from "@molis-ai/molis-work-module-projects";
import { assertCatalogOwner, CATALOG_BASELINE, catalogBaselineFor } from "./catalog-schema.js";
import { assertArtifactDatabaseFiles } from "./artifact-row-storage-policy.js";
import { homeStores, platformModelPreferences } from "./home-stores.js";
import type { HomeUpgradeDescriptor } from "./home-upgrade-stores.js";
import { PROJECT_DATABASE_BASELINE } from "./project-database-schema.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { projectDatabasePlugins, upgradePluginLibrary, upgradePluginTables } from "./project-plugin-databases.js";

const CATALOG = join("projects", "catalog.db"), PROJECT_LIBRARY = join("projects", "*", "molis-work.db");

/**
 * Every project, recycled ones too, since they can come back: `listProjects` leaves those out (§2.3). Read only, at whatever version the
 * catalog is, because this runs before the catalog is upgraded, and without leaving side files on a closed one, because this also runs with no lock.
 * A catalog too new for this build is not read any further: it reports itself. Nothing here reads a path from the catalog: each is worked out from the project's id.
 */
export function projectDatabases(home: string, space?: StorageSpace): readonly string[] {
  const file = join(home, CATALOG);
  if (!entryAt(file)) return [];
  if (space) assertArtifactDatabaseFiles(file);
  return readUpgradeStore(file, db => {
    if (CATALOG_VERSION_ACCESS.read(db) > CATALOG_BASELINE.version) return [];
    assertCatalogOwner(catalogOwner(db), file);
    if (space && JSON.stringify(readDatabaseSpace(db)) !== JSON.stringify(space)) {
      throw upgradeFailedRefusal(CATALOG, "invalid_path", "目录库的空间与当前 Home 不一致");
    }
    return listProjectDatabasePaths(db, join(home, "projects")).map(database => relative(home, database));
  });
}

/** A library partitioned by project has one file per project. No built-in plugin declares one today; the code it would use does. */
function partitionFiles(home: string, store: HomeStore): readonly string[] {
  const projects = join(store.path, "projects");
  if (!entryAt(join(home, projects))?.isDirectory()) return [];
  return readdirSync(join(home, projects)).sort().map(project => join(projects, project, store.library!.file ?? `${store.path}.db`));
}

/** A file's name for messages, from the Home down: never the absolute path. */
const label = (file: string, depth: number): string => (depth <= 1 ? basename(file) : join(label(dirname(file), depth - 1), basename(file)));

/**
 * A plugin's own library in the Home, upgraded by the plugin's checks (§2.4) on a connection of its own: `openSqliteConnection`, which the
 * upgrade process calls only once every other connection on the file is closed, and which is closed again before this returns or throws.
 */
export function upgradePluginLibraryFile(file: string, manifest: PluginManifest): void {
  const db = openSqliteConnection(file);
  try { upgradePluginLibrary(db, label(file, 2), manifest); }
  finally { db.close(); }
}

function libraryDescriptor(store: HomeStore): HomeUpgradeDescriptor {
  const { baseline, partition } = store.library!, name = store.library!.file ?? `${store.path}.db`;
  const pattern = partition ? join(store.path, "projects", "*", name) : join(store.path, name);
  const plugin = PLATFORM_PLUGIN_REGISTRATIONS.map(entry => entry.manifest)
    .find(manifest => manifest.plugin_id === store.owner && manifest.databases?.home?.store_name === store.path);
  return { owner: store.owner, pattern, baseline, open: file => openHomeSqliteFile(file), ...(partition ? { paths: (home: string) => partitionFiles(home, store) } : {}),
    ...(plugin ? { upgrade: (file: string) => upgradePluginLibraryFile(file, plugin) } : {}) };
}

/** The SQLite files a plugin's tables are in: their pattern, the files behind it, and the version they must be at before the tables are touched. */
export interface PluginTablesLibrary {
  readonly pattern: string;
  readonly paths: (home: string) => readonly string[];
  readonly version: number;
}

const PROJECT_LIBRARIES: PluginTablesLibrary = { pattern: PROJECT_LIBRARY, paths: projectDatabases, version: PROJECT_DATABASE_BASELINE.version };

/**
 * A plugin's tables in every project's library (§2.4), one unit per plugin and file at `<file>#<store>`, after the file's own. Their version
 * is read from the ledger inside the file, and only from a file this build can read; they are upgraded only in a file at this build's version.
 */
export function pluginTablesDescriptor(manifest: PluginManifest, library: PluginTablesLibrary = PROJECT_LIBRARIES): HomeUpgradeDescriptor {
  const declaration = manifest.databases!.project!, store = `#${declaration.store_name}`;
  return {
    owner: manifest.plugin_id, pattern: library.pattern + store, paths: home => library.paths(home).map(file => file + store),
    tables: {
      version: declaration.version,
      read: file => readUpgradeStore(file, db => (USER_VERSION_ACCESS.read(db) > library.version ? undefined : pluginProjectTablesVersion(db, manifest.plugin_id))),
      problem: found => upgradeStepsProblem({ version: declaration.version, schema: declaration.schema, upgrades: declaration.upgrades ?? [] }, found),
      upgrade: file => {
        const db = openSqliteConnection(file);
        try {
          if (USER_VERSION_ACCESS.read(db) !== library.version) {
            throw upgradeFailedRefusal(label(file, 3), "prerequisite_failed", "插件的表所在的库本身还不是这个程序的版本，插件的表没有动。");
          }
          upgradePluginTables(db, label(file, 3), manifest);
        } finally { db.close(); }
      },
    },
  };
}

/** One round's record each. The folder's name is checked the way the owner checks it: anything else there is not a record. */
function computerRecords(home: string): readonly string[] {
  const records = join("computer", "records");
  if (!entryAt(join(home, records))?.isDirectory()) return [];
  return readdirSync(join(home, records)).filter(name => COMPUTER_RECORD_ID.test(name)).sort().map(name => join(records, name, "record.json"));
}

/** The JSON files of §2.6. `config/installation.json` and `release.json` are not here: the installer upgrades them when it reads them. */
const platformFiles = (): readonly HomeUpgradeDescriptor[] => [
  { owner: "apps/local-host", pattern: join("config", "mcp-tools.json"), file: MCP_TOOL_PREFERENCE_FILE },
  { owner: "apps/local-host", pattern: join("config", "onboarding.json"), file: ONBOARDING_FILE },
  { owner: "apps/local-host", pattern: join("config", "project-arrival.json"), file: PROJECT_ARRIVAL_FILE },
  { owner: "apps/local-host", pattern: join("browser", "sites.json"), file: BROWSER_SITES_FILE },
  { owner: "apps/local-host", pattern: join("computer", "settings.json"), file: COMPUTER_SETTINGS_FILE },
  { owner: "apps/local-host", pattern: join("computer", "records", "*", "record.json"), file: COMPUTER_RECORD_FILE, paths: computerRecords },
  { owner: "modules/shelf", pattern: join("shelf", "catalog.json"), file: SHELF_CATALOG_FILE },
  { owner: "packages/storage", pattern: join("feed", "secrets.json"), file: SECRET_STORE_FILE },
  ...platformModelPreferences().map(({ owner, path }) => ({ owner, pattern: path, file: MODEL_PREFERENCE_FILE })),
];

/**
 * What the upgrade process looks after (upgrade-chain-design §2.3), in the order they upgrade: the catalog first, then each project's library,
 * then each built-in plugin's tables in it (§2.4), then the libraries and files of the Home. Only the plugins this
 * build ships are here. An installed plugin's library keeps its own check until U4 opens that door. The search index is rebuilt, so it is not
 * here. Nor are the old Alchemist's two stores: they stay at version 1 with their own refusal until the plugin is redone (user 2026-11-08, BL-377).
 */
export function platformUpgradeDescriptors(): readonly HomeUpgradeDescriptor[] {
  return [
    { owner: "apps/local-host", pattern: CATALOG, baseline: CATALOG_BASELINE, baselineFor: catalogBaselineFor, version: CATALOG_VERSION_ACCESS, open: file => openSqliteConnection(file) },
    { owner: "apps/local-host", pattern: PROJECT_LIBRARY, baseline: PROJECT_DATABASE_BASELINE, open: file => openSqliteConnection(file), paths: projectDatabases },
    ...projectDatabasePlugins().map(manifest => pluginTablesDescriptor(manifest)),
    ...homeStores().stores.filter(store => store.library !== undefined).map(libraryDescriptor),
    ...platformFiles(),
  ];
}

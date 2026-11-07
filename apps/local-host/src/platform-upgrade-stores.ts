import { join, relative } from "node:path";
import { lstatSync, readdirSync } from "node:fs";
import { CATALOG_VERSION_ACCESS, LocalSqliteStorage, openHomeSqliteFile, openSqliteConnection, SECRET_STORE_FILE, type HomeStore } from "@molis-ai/molis-work-storage";
import { SHELF_CATALOG_FILE } from "@molis-ai/molis-work-module-shelf";
import { BROWSER_SITES_FILE } from "./browser/browser-surfaces.js";
import { COMPUTER_RECORD_FILE, COMPUTER_RECORD_ID } from "./computer/computer-records.js";
import { COMPUTER_SETTINGS_FILE } from "./computer/computer-settings.js";
import { MCP_TOOL_PREFERENCE_FILE } from "./mcp-settings-store.js";
import { MODEL_PREFERENCE_FILE } from "./model-configuration.js";
import { ONBOARDING_FILE } from "./onboarding.js";
import { PROJECT_ARRIVAL_FILE } from "./project-arrival.js";
import { listCatalogProjectsForUninstall } from "@molis-ai/molis-work-module-projects";
import { assertOwnedCatalog, CATALOG_BASELINE } from "./catalog-schema.js";
import { homeStores, platformModelPreferences } from "./home-stores.js";
import type { HomeUpgradeDescriptor } from "./home-upgrade-stores.js";
import { PROJECT_DATABASE_BASELINE } from "./project-database-schema.js";

const CATALOG = join("projects", "catalog.db");

/**
 * Every project, recycled ones too, since they can come back: `listProjects` leaves those out (§2.3). Read only, at whatever version the
 * catalog is, because this runs before the catalog is upgraded. Nothing here reads a path from the catalog: each is worked out from the project's id.
 */
function projectDatabases(home: string): readonly string[] {
  const file = join(home, CATALOG);
  if (!lstatSync(file, { throwIfNoEntry: false })) return [];
  const storage = new LocalSqliteStorage(file, { readonly: true });
  try {
    assertOwnedCatalog(storage, file);
    return listCatalogProjectsForUninstall(storage.db, join(home, "projects")).map(project => relative(home, project.database_path));
  } finally { storage.close(); }
}

/** A library partitioned by project has one file per project. No built-in plugin declares one today; the code it would use does. */
function partitionFiles(home: string, store: HomeStore): readonly string[] {
  const projects = join(store.path, "projects");
  if (!lstatSync(join(home, projects), { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(join(home, projects)).sort().map(project => join(projects, project, store.library!.file ?? `${store.path}.db`));
}

function libraryDescriptor(store: HomeStore): HomeUpgradeDescriptor {
  const { baseline, partition } = store.library!, name = store.library!.file ?? `${store.path}.db`;
  const pattern = partition ? join(store.path, "projects", "*", name) : join(store.path, name);
  return { owner: store.owner, pattern, baseline, open: file => openHomeSqliteFile(file), ...(partition ? { paths: (home: string) => partitionFiles(home, store) } : {}) };
}

/** One round's record each. The folder's name is checked the way the owner checks it: anything else there is not a record. */
function computerRecords(home: string): readonly string[] {
  const records = join("computer", "records");
  if (!lstatSync(join(home, records), { throwIfNoEntry: false })?.isDirectory()) return [];
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
 * What the upgrade process looks after (upgrade-chain-design §2.3), in the order they upgrade: the catalog first. Only the plugins this
 * build ships are here. An installed plugin's library keeps its own check until U4 opens that door. The search index is rebuilt, so it is not
 * here. Nor are the old Alchemist's two stores: they stay at version 1 with their own refusal until the plugin is redone (user 2026-11-08, BL-377).
 */
export function platformUpgradeDescriptors(): readonly HomeUpgradeDescriptor[] {
  return [
    { owner: "apps/local-host", pattern: CATALOG, baseline: CATALOG_BASELINE, version: CATALOG_VERSION_ACCESS, open: file => openSqliteConnection(file) },
    { owner: "apps/local-host", pattern: join("projects", "*", "molis-work.db"), baseline: PROJECT_DATABASE_BASELINE, open: file => openSqliteConnection(file), paths: projectDatabases },
    ...homeStores().stores.filter(store => store.library !== undefined).map(libraryDescriptor),
    ...platformFiles(),
  ];
}

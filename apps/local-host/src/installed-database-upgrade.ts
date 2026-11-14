import { lstatSync, realpathSync, type Stats } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  SqlitePluginPrivateStorage, SqlitePluginRuntimeRepository, inspectPluginProjectDatabase, pluginManifestDigest, pluginProjectDatabaseErrors,
  pluginProjectTablesVersion, upgradePluginHomeLibrary, upgradePluginProjectTables,
  type PluginRuntimeDatabase,
} from "@molis-ai/molis-work-plugin-runtime";
import {
  homeSqlitePath, homeStoreRegistry, openHomeSqliteFile, openSqliteConnection, readDatabaseSpace, readStorageSpace, snapshotFileStat,
} from "@molis-ai/molis-work-storage";
import { listProjectRoots, projectDatabasePath } from "@molis-ai/molis-work-module-projects";
import {
  INSTALLED_LIBRARY_UPGRADE_LEDGER, advanceInstalledLibraryUpgrade, checkInstalledLibraryUpgrade, checkUpgradeInput,
  installedLibraryLedgerFile, installedLibrarySnapshots, validateInstalledSandboxHomeSchema,
} from "./installed-plugin-libraries.js";
import { HOME_PLUGIN_RUNTIME_HOME_STORE, openReadOnlyHomePluginStore } from "./home-plugin-store.js";
import { pluginLibraryUpgradeInspector, projectPluginSchemaInspector } from "./plugin-library-inspection.js";
import type { DatabaseUpgradeCall } from "./project-statement-protocol.js";

type HomeCall = Extract<DatabaseUpgradeCall, { op: "upgrade-home-database" }>;
type ProjectCall = Extract<DatabaseUpgradeCall, { op: "upgrade-project-database" }>;

function stageInstallRow(db: PluginRuntimeDatabase, { target, change }: DatabaseUpgradeCall, qualifier = ""): void {
  const { current, next, approval, previous } = change;
  const records = new SqlitePluginRuntimeRepository(db, qualifier);
  const stored = records.get(current.install_id);
  if (!stored || JSON.stringify(stored) !== JSON.stringify(current) || current.execution !== "sandbox" ||
      current.version !== previous.version || current.manifest_digest !== pluginManifestDigest(previous) || next.manifest_digest !== pluginManifestDigest(target) ||
      next.plugin_id !== current.plugin_id || target.plugin_id !== current.plugin_id || target.publisher.signature !== current.publisher_signature ||
      next.install_id !== current.install_id || next.installation_generation !== current.installation_generation) {
    throw new ActionError("actions.provider_replaced", "安装记录或原发行版已变化，升级没有提交");
  }
  records.save(next);
  if (approval) new SqlitePluginPrivateStorage(db as ConstructorParameters<typeof SqlitePluginPrivateStorage>[0], qualifier).saveValue(approval.installId, approval.key, approval.value);
}

const storageRefusal = () => pluginProjectDatabaseErrors.upgrade_failed("无法证明所选存储库及其原安装归属，插件库没有升级");

function assertBound(db: PluginRuntimeDatabase, home: string) {
  const space = readStorageSpace(home);
  if (!space || JSON.stringify(space) !== JSON.stringify(readDatabaseSpace(db))) throw storageRefusal();
}

function verifiedDatabaseFile(file: string): Stats {
  const identity = snapshotFileStat(file);
  for (const suffix of ["-journal", "-wal", "-shm"]) {
    if (lstatSync(file + suffix, { throwIfNoEntry: false })) snapshotFileStat(file + suffix);
  }
  return identity;
}

function upgradeProject(request: ProjectCall, publish: () => void): void {
  const home = realpathSync(request.home);
  const file = projectDatabasePath(join(home, "projects"), request.projectId);
  if (realpathSync(request.path) !== file) throw storageRefusal();
  verifiedDatabaseFile(file);
  const db = openSqliteConnection(file, { fileMustExist: true, timeout: 1000 });
  try {
    assertBound(db, home);
    if (db.pragma("user_version", { simple: true }) !== request.platformVersion) throw storageRefusal();
    const roots = listProjectRoots(db);
    if (roots.length !== 1 || roots[0]?.project_id !== request.projectId) throw storageRefusal();
    const label = `projects/${request.projectId}/${basename(file)}`;
    const { current, previous: oldManifest } = request.change;
    const previous = oldManifest.databases!.project!, declaration = request.target.databases!.project!;
    const owner = { plugin_id: current.plugin_id, publisher_signature: current.publisher_signature };
    const found = pluginProjectTablesVersion(db, request.change.current.plugin_id);
    if (found !== undefined && found > previous.version) throw pluginProjectDatabaseErrors.store_too_new("项目插件库来自比当前安装更新的版本");
    const result = upgradePluginProjectTables(db, { ...owner, declaration }, pluginLibraryUpgradeInspector, {
      path: label,
      beforeSteps: () => { checkUpgradeInput(() => inspectPluginProjectDatabase(db, { ...owner, declaration: previous }, projectPluginSchemaInspector, label)); },
      beforeCommit: () => { stageInstallRow(db, request); publish(); },
    });
    if (!result || result.from === result.to) throw storageRefusal();
  } finally { db.close(); }
}

const RUNTIME = "installed_plugin_runtime";

function attachUpgradeDatabase(db: ReturnType<typeof openHomeSqliteFile>, path: string, alias: typeof RUNTIME | typeof INSTALLED_LIBRARY_UPGRADE_LEDGER): void {
  const url = pathToFileURL(path);
  url.searchParams.set("mode", "rw");
  db.prepare(`ATTACH DATABASE ? AS "${alias}"`).run(url.href);
  requireRollbackJournal(db, alias);
}

/** SQLite uses its durable super-journal for a multi-file commit in rollback-journal mode. */
function requireRollbackJournal(db: ReturnType<typeof openHomeSqliteFile>, alias: string): void {
  if (db.prepare(`PRAGMA "${alias}".journal_mode=DELETE`).get()?.journal_mode !== "delete") {
    throw pluginProjectDatabaseErrors.upgrade_failed("插件升级所需的原子提交日志暂不可用");
  }
  db.exec(`PRAGMA "${alias}".synchronous=EXTRA`);
  if (db.prepare(`PRAGMA "${alias}".synchronous`).get()?.synchronous !== 3) throw storageRefusal();
}

function upgradeHome(request: HomeCall, publish: () => void): void {
  const home = realpathSync(request.home), previous = request.change.previous.databases?.home, target = request.target.databases?.home;
  if (!previous || !target || previous.store_name !== target.store_name) throw storageRefusal();
  const reserved = homeStoreRegistry(request.reserved);
  const owner = request.change.current;
  const library = homeSqlitePath(home, previous.store_name), ledger = installedLibraryLedgerFile(home);
  const runtime = homeSqlitePath(home, HOME_PLUGIN_RUNTIME_HOME_STORE.path);
  const identities = [library, ledger, runtime].map(verifiedDatabaseFile);
  if (identities.some(identity => identity.dev !== identities[0]!.dev) || new Set(identities.map(identity => identity.ino)).size !== 3) throw storageRefusal();
  const recorded = installedLibrarySnapshots(home, reserved).find(row => row.plugin_id === owner.plugin_id);
  if (recorded?.store_name !== previous.store_name || recorded.publisher_signature !== owner.publisher_signature) throw storageRefusal();
  const runtimeInspection = openReadOnlyHomePluginStore(home);
  if (!runtimeInspection) throw storageRefusal();
  runtimeInspection.close();
  const url = pathToFileURL(library);
  url.searchParams.set("mode", "rw");
  const db = openHomeSqliteFile(url.href);
  try {
    validateInstalledSandboxHomeSchema(target);
    db.exec("PRAGMA busy_timeout=1000");
    requireRollbackJournal(db, "main");
    attachUpgradeDatabase(db, ledger, INSTALLED_LIBRARY_UPGRADE_LEDGER);
    attachUpgradeDatabase(db, runtime, RUNTIME);
    const result = upgradePluginHomeLibrary(db, { plugin_id: owner.plugin_id, declaration: target, schema: target.schema }, pluginLibraryUpgradeInspector, {
      path: `${previous.store_name}/${basename(library)}`,
      beforeSteps: () => { checkUpgradeInput(() => checkInstalledLibraryUpgrade(home, owner, previous, reserved, db)); },
      beforeCommit: () => {
        advanceInstalledLibraryUpgrade(db, owner, previous, target);
        stageInstallRow(db, request, RUNTIME);
        publish();
      },
    });
    if (result.from === result.to) throw storageRefusal();
  } finally { db.close(); }
}

// Only the Host's private worker command reaches this function. SQL from the package gets no cross-database authority.
export function upgradeInstalledDatabase(request: DatabaseUpgradeCall, publish: () => void): void {
  const { target, change: { previous, current } } = request;
  if (previous.sync?.collections.length || target.sync?.collections.length) throw storageRefusal();
  if (current.publisher_trust !== "pinned" || current.plugin_id !== target.plugin_id || !target.databases) {
    throw pluginErrors.upgrade_validation_failed("插件库升级需要验证过的已安装发布者");
  }
  if (request.op === "upgrade-project-database" && previous.databases?.project && target.databases.project) upgradeProject(request, publish);
  else if (request.op === "upgrade-home-database" && previous.databases?.home && target.databases.home) upgradeHome(request, publish);
  else throw storageRefusal();
}

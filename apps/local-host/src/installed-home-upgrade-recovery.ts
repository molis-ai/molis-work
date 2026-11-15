import { lstatSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { pluginErrors, type PluginDatabaseVersionSwitch, type PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginManifestDigest, SqlitePluginRuntimeRepository, type PluginRuntimeDatabase } from "@molis-ai/molis-work-plugin-runtime";
import { PLUGIN_ID } from "@molis-ai/molis-work-plugin-sdk";
import {
  assertStorageOwner, atomicWriteFileSync, discardUnarmedInstalledUpgradeSnapshot, discardUpgradeSnapshot, homeSqlitePath, readDatabaseSpace, readSnapshotFile,
  readStorageSpace, recoverSqliteRollbackJournals, restoreUpgradeSnapshot, syncPath, upgradeFailedRefusal, verifyUpgradeSnapshot,
  type RollbackLibrary, type SqliteDatabase, type StorageOwner, type UpgradeSnapshotUnit,
} from "@molis-ai/molis-work-storage";
import { agentRuntimeDirectory } from "./agent-runtime-paths.js";
import { HOME_PLUGIN_RUNTIME_HOME_STORE, openReadOnlyHomePluginStore } from "./home-plugin-store.js";
import { homeStores } from "./home-stores.js";
import { homeIdentity, INSTALLED_PLUGIN_UPGRADE_FILE, isInstalledPluginUpgradeRun, supersedeInstalledUpgradeNotice, UPGRADE_DIRECTORY } from "./home-upgrade-ledger.js";
import { INSTALLED_LIBRARIES_HOME_STORE, checkInstalledLibraryEdition, installedHomeLibraryName, installedLibrarySnapshots, matchesScopedLibrary } from "./installed-plugin-libraries.js";
import { SandboxPackageStore, sandboxEditionKey } from "./sandbox-package-store.js";

const VERSION = /* @version format.home.upgrade.installed_plugin */ 1;
const SHA256 = /^[a-f0-9]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const RUN_PREFIX = "installed-plugin-";
const recoveryFailures = new Map<string, Identity>();
const refused = () => upgradeFailedRefusal(`${UPGRADE_DIRECTORY}/${INSTALLED_PLUGIN_UPGRADE_FILE}`, "installed_upgrade_invalid", "无法核对中断的 Home 插件库升级，已保留库和恢复记录");
const journalFile = (home: string) => join(home, UPGRADE_DIRECTORY, INSTALLED_PLUGIN_UPGRADE_FILE);

type Identity = Pick<PluginInstanceRecord, "install_id" | "installation_generation" | "plugin_id" | "publisher_signature">;
type Edition = { readonly package_key: string; readonly manifest_digest: string };
interface PendingUpgrade {
  readonly schema_version: typeof VERSION;
  readonly home_identity: string;
  readonly run_id: string;
  readonly snapshot_sha256: string;
  readonly install: Identity;
  readonly from: Edition;
  readonly to: Edition;
}

function validEdition(value: unknown): value is Edition {
  if (!value || typeof value !== "object") return false;
  const { package_key: key, manifest_digest: digest } = value as Edition;
  return Object.keys(value).length === 2 && typeof key === "string" && /^[a-f0-9]{32}$/u.test(key) && typeof digest === "string" && SHA256.test(digest);
}

function readPending(home: string): PendingUpgrade | undefined {
  const file = journalFile(home);
  if (!lstatSync(file, { throwIfNoEntry: false })) return undefined;
  const pending = JSON.parse(readSnapshotFile(file, 4096).toString("utf8")) as Partial<PendingUpgrade> | null;
  const identity = pending?.install;
  if (!pending || Object.keys(pending).length !== 7 || pending.schema_version !== VERSION || pending.home_identity !== homeIdentity(home)
    || typeof pending.run_id !== "string" || !isInstalledPluginUpgradeRun(pending.run_id)
    || typeof pending.snapshot_sha256 !== "string" || !SHA256.test(pending.snapshot_sha256)
    || !validEdition(pending.from) || !validEdition(pending.to)
    || pending.from.manifest_digest === pending.to.manifest_digest || !identity || Object.keys(identity).length !== 4
    || typeof identity.install_id !== "string" || !/^plugin-install-[a-f0-9]{32}$/u.test(identity.install_id)
    || typeof identity.installation_generation !== "string" || !UUID.test(identity.installation_generation)
    || typeof identity.plugin_id !== "string" || !PLUGIN_ID.test(identity.plugin_id)
    || typeof identity.publisher_signature !== "string" || !/^ed25519:sha256:[0-9a-f]{64}$/u.test(identity.publisher_signature)) throw refused();
  return { schema_version: VERSION, home_identity: pending.home_identity, run_id: pending.run_id, snapshot_sha256: pending.snapshot_sha256,
    install: identity, from: pending.from, to: pending.to };
}

/** The pending name is also the per-Home admission for this shared Runtime and library ledger. */
export function assertNoInstalledHomeUpgrade(home: string): void {
  if (lstatSync(journalFile(home), { throwIfNoEntry: false })) throw pluginErrors.upgrade_validation_failed("Home 里已有等待完成的插件库升级");
}

export function installedUpgradeRunId(id: string): string { return RUN_PREFIX + id; }

export function recoverArmedInstalledHomeUpgrade(unit: UpgradeSnapshotUnit): void {
  const pending = readPending(unit.home);
  if (!pending || pending.run_id !== unit.runId) throw refused();
  try { recoverPending(unit, pending); }
  catch (error) { recoveryFailures.set(unit.home, pending.install); throw error; }
}

export function recordInstalledHomeUpgrade(unit: UpgradeSnapshotUnit, digest: string, { current, next }: PluginDatabaseVersionSwitch): void {
  assertStorageOwner(unit.lockDirectory, unit.owner);
  assertNoInstalledHomeUpgrade(unit.home);
  const { install_id, installation_generation, plugin_id, publisher_signature } = current;
  const edition = ({ version, manifest_digest }: PluginInstanceRecord): Edition => ({
    package_key: sandboxEditionKey(plugin_id, publisher_signature, version), manifest_digest,
  });
  const pending: PendingUpgrade = { schema_version: VERSION, home_identity: homeIdentity(unit.home), run_id: unit.runId, snapshot_sha256: digest,
    install: { install_id, installation_generation, plugin_id, publisher_signature }, from: edition(current), to: edition(next) };
  atomicWriteFileSync(journalFile(unit.home), JSON.stringify(pending) + "\n", { mode: 0o600, durable: true });
  supersedeInstalledUpgradeNotice(unit.home);
}

export function finishInstalledHomeUpgrade(unit: UpgradeSnapshotUnit): void {
  assertStorageOwner(unit.lockDirectory, unit.owner);
  const file = journalFile(unit.home);
  rmSync(file);
  syncPath(dirname(file));
  discardUpgradeSnapshot(unit);
}

function recoveredEdition(db: PluginRuntimeDatabase, pending: PendingUpgrade): "from" | "to" {
  const id = pending.install, row = new SqlitePluginRuntimeRepository(db).get(id.install_id);
  if (row?.install_id !== id.install_id || row.installation_generation !== id.installation_generation || row.plugin_id !== id.plugin_id
    || row.publisher_signature !== id.publisher_signature || row.publisher_trust !== "pinned" || row.execution !== "sandbox"
    || row.state === "uninstalled") throw refused();
  for (const edition of ["from", "to"] as const) {
    if (row.manifest_digest === pending[edition].manifest_digest && sandboxEditionKey(id.plugin_id, id.publisher_signature, row.version) === pending[edition].package_key) return edition;
  }
  throw refused();
}

function recoverPending(lock: Pick<UpgradeSnapshotUnit, "home" | "lockDirectory" | "owner">, pending: PendingUpgrade): void {
  const { home } = lock;
  const packages = new SandboxPackageStore(home), reserved = homeStores();
  const declaration = (edition: Edition) => {
    const manifest = packages.snapshotEdition(pending.install.plugin_id, pending.install.publisher_signature, edition.package_key);
    return manifest && pluginManifestDigest(manifest) === edition.manifest_digest ? manifest.databases?.home : undefined;
  };
  const previous = declaration(pending.from), target = declaration(pending.to);
  if (!previous || !target || previous.store_name !== target.store_name || previous.version >= target.version
    || !installedHomeLibraryName(previous.store_name, reserved) || previous.partition || target.partition) throw refused();
  const file = homeSqlitePath(home, previous.store_name), unit = { ...lock, runId: pending.run_id, relativePath: relative(home, file) };
  const space = readStorageSpace(home);
  if (!space) throw refused();
  const inspectSpace = (db: SqliteDatabase) => {
    if (JSON.stringify(readDatabaseSpace(db)) !== JSON.stringify(space)) throw refused();
  };
  const ledgers = [INSTALLED_LIBRARIES_HOME_STORE, HOME_PLUGIN_RUNTIME_HOME_STORE].map(store =>
    ({ path: homeSqlitePath(home, store.path), baseline: store.library!.baseline }));
  const libraries: RollbackLibrary[] = [
    { path: file, kind: "home", version: target.version, baseline: target, before: previous, inspect(db) {
      libraryVersion = Number(db.pragma("user_version", { simple: true }));
      const declaration = libraryVersion === previous.version ? previous : target;
      if (!matchesScopedLibrary(db, declaration, home)) throw refused();
    } },
    ...ledgers.map(({ path, baseline }, index): RollbackLibrary => ({ path, kind: "home", baseline, version: baseline.version, inspect(db) {
      inspectSpace(db);
      if (index === 0) {
        ledgerEdition = libraryVersion === previous.version ? "from" : "to";
        checkInstalledLibraryEdition(db, pending.install, ledgerEdition === "from" ? previous : target);
      } else installEdition = recoveredEdition(db, pending);
    } })),
  ];
  let libraryVersion: number, ledgerEdition: "from" | "to", installEdition: "from" | "to" | undefined;
  if (realpathSync(dirname(file)) !== dirname(file)) throw refused();
  const sidecars = libraries.map(library => library.path + "-journal").filter(path => lstatSync(path, { throwIfNoEntry: false }));
  for (const name of readdirSync(dirname(file))) if (name.startsWith(basename(file) + "-mj")) sidecars.push(join(dirname(file), name));
  recoverSqliteRollbackJournals(lock, libraries, sidecars, { inspectGroup() {
    if (installEdition === undefined || ledgerEdition !== installEdition) throw refused();
    if (installEdition === "from") {
      const snapshot = verifyUpgradeSnapshot(unit);
      if (snapshot.sha256 !== pending.snapshot_sha256 || snapshot.sqlite?.user_version !== previous.version) throw refused();
    }
  } });
  if (installEdition === "from") restoreUpgradeSnapshot(unit);
  finishInstalledHomeUpgrade(unit);
}

/** Reconcile one confirmed change before stores open. Package bytes and ledger ownership select the database. */
export function recoverInstalledHomeUpgrade(home: string, owner: StorageOwner): { run_id: string; unavailable: number } | undefined {
  const lock = { home, lockDirectory: agentRuntimeDirectory(home), owner };
  assertStorageOwner(lock.lockDirectory, owner);
  const pending = readPending(home), directory = join(home, UPGRADE_DIRECTORY);
  recoveryFailures.delete(home);
  if (lstatSync(directory, { throwIfNoEntry: false })) {
    for (const name of readdirSync(directory)) if (name !== pending?.run_id && isInstalledPluginUpgradeRun(name)) {
      discardUnarmedInstalledUpgradeSnapshot(lock, name);
    }
  }
  if (!pending) return;
  try { recoverPending(lock, pending); }
  catch (error) {
    // When the common stores still open read-only and identify this exact install, only its owner need wait.
    const runtime = openReadOnlyHomePluginStore(home);
    if (!runtime) throw error;
    try { recoveredEdition(runtime, pending); }
    finally { runtime.close(); }
    installedLibrarySnapshots(home, homeStores());
    assertStorageOwner(lock.lockDirectory, owner);
    recoveryFailures.set(home, pending.install);
  }
  return { run_id: pending.run_id, unavailable: recoveryFailures.has(home) ? 1 : 0 };
}

export function installedHomeUpgradeBlocked(home: string, record: PluginInstanceRecord): boolean {
  const blocked = recoveryFailures.get(realpathSync(home));
  return !!blocked && blocked.install_id === record.install_id && blocked.installation_generation === record.installation_generation;
}

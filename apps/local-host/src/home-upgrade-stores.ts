import { createHash } from "node:crypto";
import type { SqliteBaseline, SqliteVersionAccess, UpgradeSqliteConnection, VersionedFile } from "@molis-ai/molis-work-storage";
import { compareCodeUnits } from "@molis-ai/molis-work-plugin-sdk";

/**
 * What the upgrade process looks after. It is declared by the owner and handed over as data, so the process names no store, plugin or driver
 * of its own (upgrade-chain-design §2.3). Only `pattern` and the version go into the fingerprint, so comparing it opens nothing.
 */
interface HomeUpgradeUnitDeclaration {
  /** Who answers for this store: its package directory, or a plugin's id. */
  readonly owner: string;
  /** Where it is, relative to the Home; a pattern when `paths` lists several files. */
  readonly pattern: string;
  /** The files behind `pattern`, read only. Without it `pattern` is the one file. */
  readonly paths?: (home: string) => readonly string[];
  /**
   * The stores, by `pattern`, this one needs upgraded first (§6). If one of them fails, this one is not tried. No descriptor sets it today: the
   * plugin tables' order is their own rule (a unit at `<file>#<store>` waits for its file, `home-upgrade.ts`). It is here for the day a step
   * reads another store, as §8.1 describes.
   */
  readonly after?: readonly string[];
  /**
   * Those that upgrade or go back together (§8.2): a secrets file and the stores it seals. If one fails, all of them are put back. No
   * descriptor sets it today; the first encrypted-file step with a store will be its first user, and until then only the tests exercise it.
   */
  readonly group?: string;
}

/** A JSON file with a version (§2.6). */
export interface HomeUpgradeFileDescriptor extends HomeUpgradeUnitDeclaration {
  readonly file: VersionedFile;
}

export interface HomeUpgradeStoreDescriptor extends HomeUpgradeUnitDeclaration {
  readonly baseline: SqliteBaseline;
  /** The baseline the upgraded store must match when it depends on the store itself (the catalog's triggers follow its space); `baseline` otherwise. */
  readonly baselineFor?: (db: UpgradeSqliteConnection) => SqliteBaseline;
  /** A writable connection on the store's own driver, which must not write on its own: never `openHomeSqliteDatabase`, which binds the space first (§2.1). */
  readonly open: (file: string) => UpgradeSqliteConnection;
  /** Where this store keeps its version, when that is not `PRAGMA user_version`. */
  readonly version?: SqliteVersionAccess;
  /**
   * The owner's own run in place of storage's `runSqliteUpgrade`: a plugin's library, whose steps go through the plugin's checks (§2.4). It
   * opens the file itself, every other connection on it already closed, and closes it before it returns or throws.
   */
  readonly upgrade?: (file: string) => void;
}

/**
 * A plugin's tables inside a library of the platform's (§2.4): one unit per plugin and file, at `<file>#<store>`, after that file's own
 * unit. Their version is the plugin's, kept inside the file. No snapshot of their own: the file's is the platform's, and a plugin's steps
 * run in a transaction of their own, so a failure rolls back only that plugin's tables and stops only that plugin.
 */
export interface HomeUpgradeTablesDescriptor extends HomeUpgradeUnitDeclaration {
  readonly tables: {
    readonly version: number;
    /** Their version, by reading only; undefined when the file has none of them, or is too new for this build to read. */
    readonly read: (file: string) => number | undefined;
    /** What stops them before anything opens the file to write: a version with no step from it. A step no plugin may write is refused when it runs. */
    readonly problem: (found: number) => string | undefined;
    /** Opens the file, runs the steps in one transaction of their own, closes it. */
    readonly upgrade: (file: string) => void;
  };
}

export type HomeUpgradeDescriptor = HomeUpgradeStoreDescriptor | HomeUpgradeFileDescriptor | HomeUpgradeTablesDescriptor;

/** What this build expects the unit to read. */
export const upgradeTarget = (descriptor: HomeUpgradeDescriptor) =>
  ("file" in descriptor ? descriptor.file.version : "tables" in descriptor ? descriptor.tables.version : descriptor.baseline.version);

/** The SQLite file a plugin's tables are in: the path up to `#`. Every other unit is its own file. */
export const upgradeUnitFile = (descriptor: HomeUpgradeDescriptor, relativePath: string) =>
  ("tables" in descriptor ? relativePath.slice(0, relativePath.lastIndexOf("#")) : relativePath);

export type HomeUpgradeDescriptorSource = () => readonly HomeUpgradeDescriptor[];

const sources = new Set<HomeUpgradeDescriptorSource>();

/** Adds stores to the upgrade process; the returned function takes them away. A Home whose stores are all unregistered is never touched: no scan, no `upgrade/`. */
export function registerHomeUpgradeDescriptors(source: HomeUpgradeDescriptorSource): () => void {
  sources.add(source);
  return () => { sources.delete(source); };
}

/** In registration order, which is the order they upgrade in. */
export const homeUpgradeDescriptors = (): readonly HomeUpgradeDescriptor[] => [...sources].flatMap(source => source());

/** What the code expects of a Home (§3.3): every store's path pattern and version, sorted, so the order of registration does not matter. */
export function upgradeFingerprint(descriptors: readonly HomeUpgradeDescriptor[]): string {
  const expected = descriptors.map(descriptor => [descriptor.pattern, upgradeTarget(descriptor)] as const).sort(([left], [right]) => compareCodeUnits(left, right));
  return createHash("sha256").update(JSON.stringify(expected)).digest("hex");
}

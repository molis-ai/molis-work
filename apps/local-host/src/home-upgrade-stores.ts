import { createHash } from "node:crypto";
import type { SqliteBaseline, UpgradeSqliteConnection } from "@molis-ai/molis-work-storage";

/**
 * A store the upgrade process looks after. It is declared by the store's owner and handed over as data, so the process names no store,
 * plugin or driver of its own (upgrade-chain-design §2.3). Only `pattern` and the baseline's version go into the fingerprint, so comparing
 * it opens nothing.
 */
export interface HomeUpgradeDescriptor {
  /** Who answers for this store: its package directory, or a plugin's id. */
  readonly owner: string;
  /** Where it is, relative to the Home; a pattern when `paths` lists several files. */
  readonly pattern: string;
  readonly baseline: SqliteBaseline;
  /** A writable connection on the store's own driver, which must not write on its own: never `openHomeSqliteDatabase`, which binds the space first (§2.1). */
  readonly open: (file: string) => UpgradeSqliteConnection;
  /** The files behind `pattern`, read only. Without it `pattern` is the one file. */
  readonly paths?: (home: string) => readonly string[];
  /** The stores, by `pattern`, this one needs upgraded first (§6). If one of them fails, this one is not tried. */
  readonly after?: readonly string[];
}

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
  const expected = descriptors.map(({ pattern, baseline }) => [pattern, baseline.version] as const).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return createHash("sha256").update(JSON.stringify(expected)).digest("hex");
}

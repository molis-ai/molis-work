import { randomUUID } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { acquireStorageOwner, assertNoPendingHomeRestore } from "@molis-ai/molis-work-storage";
import { agentRuntimeDirectory } from "../agent-runtime-paths.js";
import { homeIdentity, readUpgradeStamp } from "../home-upgrade-ledger.js";
import { putBackUpgradeRound, upgradeRoundRestorable } from "../home-upgrade.js";
import { isCurrentInstallManifest, type InstallManifest, type TextMutation } from "./home-contract.js";
import { replaceOwnedJson, rollbackTextMutations, writeAtomic, writeOwnedText } from "./home-files.js";
import { launcherSource } from "./home-launcher.js";

/**
 * Going back a version (upgrade-continuity U3 §5): the installer keeps the program it replaced, with the installation record that ran it and
 * the stamp the Home was at, in `releases/previous/`; `home rollback` puts the stores the newer program upgraded back from their snapshots and
 * swaps the program back; a hold keeps the desktop from installing the same newer runtime again on the next start.
 */

export const rollbackErrors = defineErrorCodes("installer.rollback", {
  /** There is nothing to go back to, or not in a way that keeps the data whole: the reason says which. */
  unavailable: "conflict",
});

const PREVIOUS = path.join("releases", "previous");
const RECORD = "rollback.json", INSTALLATION = "installation.json";
const HOLD = path.join("config", "rollback-hold.json");
const RECORD_SCHEMA_VERSION = /* @version format.home.release.rollback */ 1;
const HOLD_SCHEMA_VERSION = /* @version format.home.release.rollback_hold */ 1;
const MAXIMUM_BYTES = 64 * 1024;

interface RollbackRecord {
  readonly schema_version: number;
  readonly version: string;
  readonly content_digest: string;
  /** Where the kept program is, relative to the Home: `releases/previous/release` when the new one took its directory's name, else its own. */
  readonly release_path: string;
  /** The upgrade stamp when the program was replaced: the store versions the kept program ran on. */
  readonly home_fingerprint: string | null;
  readonly kept_at: string;
}

export type RollbackPoint =
  | { readonly available: true; readonly version: string; readonly data: "unchanged" | "restore"; readonly written_since: string | null }
  | { readonly available: false; readonly reason: "no_previous" | "snapshot_missing" | "snapshot_invalid" | "upgrade_unfinished" };

export interface RollbackResult {
  readonly version: string;
  readonly data: "unchanged" | "restore";
  /** The stores put back, relative to the Home. */
  readonly restored: readonly string[];
  readonly saved_to: string | null;
}

const plainDirectory = (target: string) => {
  const found = lstatSync(target, { throwIfNoEntry: false });
  return Boolean(found?.isDirectory() && !found.isSymbolicLink());
};

function readSmallJson(file: string): unknown {
  const found = lstatSync(file, { throwIfNoEntry: false });
  if (!found?.isFile() || found.size > MAXIMUM_BYTES) return undefined;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return undefined; }
}

const insideHome = (relative: string) => relative !== "" && !path.isAbsolute(relative) && path.normalize(relative) === relative && !relative.split(path.sep).includes("..");

function readRecord(root: string): { record: RollbackRecord; installation: InstallManifest } | undefined {
  if (!plainDirectory(path.join(root, "releases")) || !plainDirectory(path.join(root, PREVIOUS))) return undefined;
  const value = readSmallJson(path.join(root, PREVIOUS, RECORD)) as Partial<RollbackRecord> | undefined;
  const installation = readSmallJson(path.join(root, PREVIOUS, INSTALLATION));
  if (!value || value.schema_version !== RECORD_SCHEMA_VERSION || typeof value.version !== "string" || typeof value.content_digest !== "string"
    || typeof value.release_path !== "string" || !insideHome(value.release_path) || typeof value.kept_at !== "string"
    || !(value.home_fingerprint === null || typeof value.home_fingerprint === "string") || !isCurrentInstallManifest(installation)
    || installation.content_digest !== value.content_digest) return undefined;
  if (!plainDirectory(path.join(root, value.release_path))) return undefined;
  return { record: value as RollbackRecord, installation };
}

function currentStamp(root: string): string | null {
  try { return readUpgradeStamp(root, homeIdentity(root)) ?? null; } catch { return null; }
}

/**
 * §5.4: what going back would do, read only (no store opened). Unchanged: no round has run since the program was replaced. Restore: the one
 * round since started from the stamp the kept program left, and every store it moved on can be put back. Two rounds since, or a snapshot
 * gone, is `snapshot_missing`: going back would leave stores the kept program cannot read.
 */
export function readRollbackPoint(home: string): RollbackPoint {
  const root = realpathSync(home), kept = readRecord(root);
  if (!kept) return { available: false, reason: "no_previous" };
  const round = upgradeRoundRestorable(root), { record } = kept;
  if (round.kind === "unfinished") return { available: false, reason: "upgrade_unfinished" };
  if (round.kind === "none" || Date.parse(round.started_at) < Date.parse(record.kept_at)) return { available: true, version: record.version, data: "unchanged", written_since: null };
  if (round.from !== record.home_fingerprint || !round.restorable) return { available: false, reason: "snapshot_missing" };
  return { available: true, version: record.version, data: "restore", written_since: round.started_at };
}

/**
 * Keeps the program the installer is replacing as the one to go back to (§5.1). One is kept: a later install puts its own in place of it.
 * `moved` is the replaced program's directory when the new one took its name, and moves into `previous/`; otherwise it stays where it is.
 * Called after the new installation record is written; a failure here leaves no point to go back to, never a half one.
 */
export async function keepPreviousRelease(home: string, previous: InstallManifest, moved: string | null): Promise<void> {
  const root = realpathSync(home), releases = path.join(root, "releases"), stage = path.join(releases, `.previous-${randomUUID()}`);
  const releasePath = moved ? path.join(PREVIOUS, "release") : previous.release_path;
  if (!moved && !plainDirectory(path.join(root, previous.release_path))) return;
  await fs.mkdir(stage, { mode: 0o700 });
  try {
    if (moved) await fs.rename(moved, path.join(stage, "release"));
    await writeAtomic(path.join(stage, INSTALLATION), `${JSON.stringify(previous, null, 2)}\n`);
    const record: RollbackRecord = { schema_version: RECORD_SCHEMA_VERSION, version: previous.version, content_digest: previous.content_digest,
      release_path: releasePath, home_fingerprint: currentStamp(root), kept_at: new Date().toISOString() };
    await writeAtomic(path.join(stage, RECORD), `${JSON.stringify(record, null, 2)}\n`);
    const target = path.join(root, PREVIOUS), old = plainDirectory(target) ? path.join(releases, `.previous-old-${randomUUID()}`) : null;
    if (old) await fs.rename(target, old);
    await fs.rename(stage, target);
    if (old) await fs.rm(old, { recursive: true, force: true });
  } catch (error) {
    await fs.rm(stage, { recursive: true, force: true });
    throw error;
  }
}

/**
 * §5.3: offline, under the owner lock. `saveCurrent` first takes a whole snapshot of the Home as it is now (the caller's, before the lock);
 * then the stores go back, then the program, then the hold. A refusal changes nothing; a failure part-way leaves whole stores, the program
 * that was there, and the point to go back to, so running it again finishes it.
 */
export async function rollbackHome(home: string, options: { readonly saved_to?: string | null } = {}): Promise<RollbackResult> {
  const root = realpathSync(home), lockDirectory = agentRuntimeDirectory(root), owner = acquireStorageOwner(lockDirectory);
  try {
    assertNoPendingHomeRestore(root);
    const point = readRollbackPoint(root), kept = readRecord(root);
    if (!point.available || !kept) {
      const reason = point.available ? "no_previous" : point.reason;
      throw rollbackErrors.unavailable(UNAVAILABLE[reason], { reason });
    }
    const restored = point.data === "restore" ? putBackUpgradeRound(root, owner) : [];
    const from = await swapProgram(root, kept);
    await writeAtomic(path.join(root, HOLD), `${JSON.stringify({ schema_version: HOLD_SCHEMA_VERSION, held_version: kept.installation.version,
      rolled_back_from: from, at: new Date().toISOString() }, null, 2)}\n`);
    return { version: point.version, data: point.data, restored, saved_to: options.saved_to ?? null };
  } finally { owner.release(); }
}

const UNAVAILABLE: Readonly<Record<Exclude<RollbackPoint, { available: true }>["reason"], string>> = {
  no_previous: "没有可以回去的上一版：这台电脑上还没换过程序，或上一版已经不在了。",
  snapshot_missing: "上一版用的数据已经不在：之后又升级过，或升级前的备份没有了。现在回去会让上一版读不了这些数据，所以没有回。",
  snapshot_invalid: "升级前的备份对不上，没有回。",
  upgrade_unfinished: "还有没做完的升级。先打开一次 Molis Work 让它做完，再回到上一版。",
};

/** §5.3 step 4: the kept program back in its own place, its installation record and its launchers; the newer one stays in `releases/` as it is. */
async function swapProgram(root: string, kept: { record: RollbackRecord; installation: InstallManifest }): Promise<{ version: string; content_digest: string }> {
  const installationFile = path.join(root, "config", INSTALLATION), current = readSmallJson(installationFile);
  if (!isCurrentInstallManifest(current)) throw rollbackErrors.unavailable("这台电脑上现在的安装记录读不了，没有回。", { reason: "no_previous" });
  const target = path.join(root, kept.installation.release_path), mutations: TextMutation[] = [];
  let parked: string | null = null;
  if (kept.record.release_path === path.join(PREVIOUS, "release")) {
    // The newer program took the kept one's directory name: it moves aside, and the kept one goes back to that name.
    if (plainDirectory(target)) { parked = path.join(root, "releases", `.rolled-back-${randomUUID()}`); await fs.rename(target, parked); }
    try { await fs.rename(path.join(root, kept.record.release_path), target); }
    catch (error) { if (parked) await fs.rename(parked, target); throw error; }
  }
  try {
    await replaceOwnedJson(installationFile, { ...kept.installation, updated_at: new Date().toISOString() }, mutations);
    const bundled = (readSmallJson(path.join(target, "release.json")) as { node_runtime?: unknown } | undefined)?.node_runtime === "embedded";
    for (const name of ["cli", "mcp", "web"] as const) {
      await writeOwnedText(path.join(root, "bin", name === "cli" ? "molis-work" : `molis-work-${name}`), launcherSource(name, target, bundled), mutations);
    }
  } catch (error) {
    await rollbackTextMutations(mutations);
    if (kept.record.release_path === path.join(PREVIOUS, "release")) {
      await fs.rename(target, path.join(root, kept.record.release_path));
      if (parked) await fs.rename(parked, target);
    }
    throw error;
  }
  // Done: the point it came from is used up, and what moved aside is the newer program, kept only until now.
  await fs.rm(path.join(root, PREVIOUS), { recursive: true, force: true });
  if (parked) await fs.rm(parked, { recursive: true, force: true });
  return { version: current.version, content_digest: current.content_digest };
}

/**
 * For uninstall: the kept point and the hold are the installer's own, so they go with the program. A `previous/` whose record this build
 * cannot read is someone else's, and stops the uninstall like any other unknown release.
 */
export function rollbackOwnedPaths(home: string): { readonly owned: readonly string[]; readonly unknown: readonly string[] } {
  const root = realpathSync(home), previous = path.join(root, PREVIOUS), hold = path.join(root, HOLD);
  const owned: string[] = [], unknown: string[] = [];
  if (lstatSync(previous, { throwIfNoEntry: false })) (readRecord(root) ? owned : unknown).push(previous);
  if (lstatSync(hold, { throwIfNoEntry: false })) (readRollbackHold(root) ? owned : unknown).push(hold);
  return { owned, unknown };
}

/** Any install that changes the program lifts the hold (§5.3): getting as far as an install means a person or a newer version asked for it. */
export async function liftRollbackHold(home: string): Promise<boolean> {
  const file = path.join(realpathSync(home), HOLD);
  if (!lstatSync(file, { throwIfNoEntry: false })?.isFile()) return false;
  await fs.rm(file, { force: true });
  return true;
}

/** The hold the desktop reads (§5.3 「停在上一版」), for the settings page: which version the Home went back from. */
export function readRollbackHold(home: string): { readonly held_version: string; readonly rolled_back_from: { readonly version: string; readonly content_digest: string } } | undefined {
  const value = readSmallJson(path.join(realpathSync(home), HOLD)) as { schema_version?: unknown; held_version?: unknown; rolled_back_from?: { version?: unknown; content_digest?: unknown } } | undefined;
  if (!value || value.schema_version !== HOLD_SCHEMA_VERSION || typeof value.held_version !== "string"
    || typeof value.rolled_back_from?.version !== "string" || typeof value.rolled_back_from.content_digest !== "string") return undefined;
  return { held_version: value.held_version, rolled_back_from: { version: value.rolled_back_from.version, content_digest: value.rolled_back_from.content_digest } };
}

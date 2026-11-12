import { createHash } from "node:crypto";
import { chmodSync, lstatSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteFileSync, readSnapshotFile, readStorageSpace, upgradeFailedRefusal } from "@molis-ai/molis-work-storage";

/** The upgrade's own directory in a Home: the record, the stamp, and one directory of snapshots per run. */
export const UPGRADE_DIRECTORY = "upgrade";
const LEDGER = "ledger.json";
const STAMP = "state.json";
const LEDGER_SCHEMA_VERSION = /* @version format.home.upgrade.ledger */ 1;
const STAMP_SCHEMA_VERSION = /* @version format.home.upgrade.state */ 1;
const NOTICE = "notice.json";
const NOTICE_SCHEMA_VERSION = /* @version format.home.upgrade.notice */ 1;
const MAXIMUM_BYTES = 16 * 1024 * 1024;
const RUN_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SHA256 = /^[0-9a-f]{64}$/;
/** A Home with no `storage-space.json` yet: a fresh account Home, or one the first open has not reached. */
const UNBOUND_HOME = "unbound";

type UpgradeUnitState = "planned" | "snapshotted" | "committed" | "restoring" | "failed" | "too_new";
const STATES: readonly string[] = ["planned", "snapshotted", "committed", "restoring", "failed", "too_new"] satisfies UpgradeUnitState[];

/** Only the code and the fixed reason: what a step threw can quote the store's content, and stays on the error's `cause`. */
export interface UpgradeUnitError {
  readonly code: string;
  readonly reason: string;
}

export interface UpgradeUnit {
  /** A SQLite file, a JSON file, or a plugin's tables inside a SQLite file of the platform's (§2.4). */
  readonly kind: "sqlite" | "file" | "plugin_tables";
  readonly owner: string;
  /** Only names the unit, to match it with a descriptor. The real path is always worked out from the Home and the descriptor (S-upgrade-ledger-verified). */
  readonly relative_path: string;
  readonly group: string | null;
  readonly from: number;
  readonly to: number;
  readonly state: UpgradeUnitState;
  readonly error: UpgradeUnitError | null;
}

export interface UpgradeLedger {
  readonly schema_version: number;
  readonly home_identity: string;
  readonly run_id: string;
  /** The fingerprint the Home last completed, when it has a stamp. */
  readonly from: string | null;
  readonly to: string;
  readonly started_at: string;
  readonly units: readonly UpgradeUnit[];
}

export const unfinishedUnit = (unit: UpgradeUnit) => unit.state === "planned" || unit.state === "snapshotted" || unit.state === "restoring";

/** The same digest as a `home restore` journal's `space_digest`: it names the Home's ownership, not where its directory happens to be. */
export function homeIdentity(root: string): string {
  const space = readStorageSpace(root);
  return space ? createHash("sha256").update(JSON.stringify(space)).digest("hex") : UNBOUND_HOME;
}

const refused = () => upgradeFailedRefusal(`${UPGRADE_DIRECTORY}/${LEDGER}`, "ledger_invalid",
  "升级记录和这个 Home 对不上，没有照着它做，也没有改动任何库。把这个文件移走后重新打开，会重新检查每个库。");

const plainDirectory = (root: string) => {
  const found = lstatSync(join(root, UPGRADE_DIRECTORY), { throwIfNoEntry: false });
  return found === undefined || found.isDirectory();
};

/** `upgrade/` that is not a plain directory refuses the whole round before anything, recovery included, looks inside it. */
export function assertUpgradeDirectory(root: string): void {
  if (!plainDirectory(root)) throw refused();
}

function object(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw refused();
  const found = Object.keys(value);
  if (found.length !== fields.length || !fields.every(field => found.includes(field))) throw refused();
  return value as Record<string, unknown>;
}

const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const fingerprint = (value: unknown): value is string => typeof value === "string" && SHA256.test(value);

function parseUnit(value: unknown): UpgradeUnit {
  const unit = object(value, ["kind", "owner", "relative_path", "group", "from", "to", "state", "error"]);
  const { kind, owner, relative_path, group, from, to, state } = unit;
  if ((kind !== "sqlite" && kind !== "file" && kind !== "plugin_tables") || typeof owner !== "string" || typeof relative_path !== "string" || (group !== null && typeof group !== "string")
    || !count(from) || !count(to) || typeof state !== "string" || !STATES.includes(state)) throw refused();
  let error: UpgradeUnitError | null = null;
  if (unit.error !== null) {
    const { code, reason } = object(unit.error, ["code", "reason"]);
    if (typeof code !== "string" || typeof reason !== "string") throw refused();
    error = { code, reason };
  }
  return { kind, owner, relative_path, group, from, to, state: state as UpgradeUnitState, error };
}

/** The record, read strictly. Absent is no record. One this Home did not write is refused here, before anything acts on it (S-upgrade-ledger-verified). */
export function readUpgradeLedger(root: string): UpgradeLedger | undefined {
  if (!plainDirectory(root)) throw refused();
  const file = join(root, UPGRADE_DIRECTORY, LEDGER);
  if (!lstatSync(file, { throwIfNoEntry: false })) return undefined;
  let raw: unknown;
  try { raw = JSON.parse(readSnapshotFile(file, MAXIMUM_BYTES).toString("utf8")); }
  catch (cause) { throw Object.assign(refused(), { cause }); }
  const ledger = object(raw, ["schema_version", "home_identity", "run_id", "from", "to", "started_at", "units"]);
  const { schema_version, home_identity, run_id, from, to, started_at, units } = ledger;
  if (schema_version !== LEDGER_SCHEMA_VERSION || typeof home_identity !== "string" || typeof run_id !== "string" || !RUN_ID.test(run_id)
    || (from !== null && !fingerprint(from)) || !fingerprint(to) || typeof started_at !== "string" || !Array.isArray(units)) throw refused();
  const parsed = units.map(parseUnit);
  if (new Set(parsed.map(unit => unit.relative_path)).size !== parsed.length) throw refused();
  // §10: an account Home is upgraded before its identity file exists, so its record says `unbound`, and stays its record once the Home is
  // bound. Only a finished one, though: a round is resumed under the lock before anything can bind the Home, so an unbound record that still
  // has work to do on a bound Home was not left there by this Home, and nothing in it is acted on.
  if (home_identity !== homeIdentity(root) && (home_identity !== UNBOUND_HOME || parsed.some(unfinishedUnit))) throw refused();
  return { schema_version, home_identity, run_id, from: from as string | null, to, started_at, units: parsed };
}

/** 0700 whatever it was, and never through a link: `atomicWriteFileSync` would write wherever one points. */
function assertWritableDirectory(root: string): void {
  if (!plainDirectory(root)) throw refused();
  const directory = join(root, UPGRADE_DIRECTORY), found = lstatSync(directory, { throwIfNoEntry: false });
  if (found && (found.mode & 0o777) !== 0o700) chmodSync(directory, 0o700);
}

export function writeUpgradeLedger(root: string, ledger: UpgradeLedger): void {
  assertWritableDirectory(root);
  atomicWriteFileSync(join(root, UPGRADE_DIRECTORY, LEDGER), `${JSON.stringify(ledger)}\n`, { mode: 0o600, durable: true });
}

export const newUpgradeLedger = (identity: string, runId: string, from: string | null, to: string, units: readonly UpgradeUnit[]): UpgradeLedger =>
  ({ schema_version: LEDGER_SCHEMA_VERSION, home_identity: identity, run_id: runId, from, to, started_at: new Date().toISOString(), units });

/** The fingerprint of the stamp, if the stamp can be believed. It is only a cache, so any doubt is the same as no stamp: the versions get scanned. */
export function readUpgradeStamp(root: string, identity: string): string | undefined {
  if (!plainDirectory(root)) return undefined;
  const file = join(root, UPGRADE_DIRECTORY, STAMP);
  try {
    if (!lstatSync(file, { throwIfNoEntry: false })) return undefined;
    const stamp = object(JSON.parse(readSnapshotFile(file, MAXIMUM_BYTES).toString("utf8")), ["schema_version", "home_identity", "fingerprint", "completed_at"]);
    return stamp.schema_version === STAMP_SCHEMA_VERSION && stamp.home_identity === identity && fingerprint(stamp.fingerprint) ? stamp.fingerprint : undefined;
  } catch { return undefined; }
}

export function writeUpgradeStamp(root: string, identity: string, expected: string): void {
  assertWritableDirectory(root);
  atomicWriteFileSync(join(root, UPGRADE_DIRECTORY, STAMP),
    `${JSON.stringify({ schema_version: STAMP_SCHEMA_VERSION, home_identity: identity, fingerprint: expected, completed_at: new Date().toISOString() })}\n`, { mode: 0o600, durable: true });
}

export function removeUpgradeStamp(root: string): void {
  if (plainDirectory(root)) rmSync(join(root, UPGRADE_DIRECTORY, STAMP), { force: true });
}

/** An interrupted round that a later start finished (U3 §3): the home page says so once, until the person closes it. */
export interface UpgradeNotice {
  readonly run_id: string;
  /** How many stores of that round stay out of use. */
  readonly unavailable: number;
}

export function writeUpgradeNotice(root: string, notice: UpgradeNotice): void {
  assertWritableDirectory(root);
  atomicWriteFileSync(join(root, UPGRADE_DIRECTORY, NOTICE), `${JSON.stringify({ schema_version: NOTICE_SCHEMA_VERSION, ...notice })}\n`, { mode: 0o600, durable: true });
}

/** The notice, if there is one to show: only for the round the record is at, so a later round leaves an old one unread. Any doubt is no notice. */
export function readUpgradeNotice(root: string): UpgradeNotice | undefined {
  if (!plainDirectory(root)) return undefined;
  const file = join(root, UPGRADE_DIRECTORY, NOTICE);
  try {
    if (!lstatSync(file, { throwIfNoEntry: false })) return undefined;
    const notice = object(JSON.parse(readSnapshotFile(file, MAXIMUM_BYTES).toString("utf8")), ["schema_version", "run_id", "unavailable"]);
    const { schema_version, run_id, unavailable } = notice;
    if (schema_version !== NOTICE_SCHEMA_VERSION || typeof run_id !== "string" || !RUN_ID.test(run_id) || !Number.isSafeInteger(unavailable) || (unavailable as number) < 0) return undefined;
    return readUpgradeLedger(root)?.run_id === run_id ? { run_id, unavailable: unavailable as number } : undefined;
  } catch { return undefined; }
}

/** Closing it is for that round: another round's notice stays. */
export function removeUpgradeNotice(root: string, runId: string): boolean {
  if (readUpgradeNotice(root)?.run_id !== runId) return false;
  rmSync(join(root, UPGRADE_DIRECTORY, NOTICE), { force: true });
  return true;
}

/** What a kill left of an atomic write. Snapshot runs are not touched here; they stay until the next successful upgrade. */
export function removeUpgradeTemporaries(root: string): void {
  if (!plainDirectory(root) || !lstatSync(join(root, UPGRADE_DIRECTORY), { throwIfNoEntry: false })) return;
  for (const name of readdirSync(join(root, UPGRADE_DIRECTORY))) if (name.startsWith(".") && name.endsWith(".tmp")) rmSync(join(root, UPGRADE_DIRECTORY, name), { force: true });
}

/** For the offline maintenance operations: a round not done yet, or a record that cannot be read and so cannot say it is done (§6). */
export function homeUpgradeUnfinished(home: string): boolean {
  try { return readUpgradeLedger(realpathSync(home))?.units.some(unfinishedUnit) ?? false; }
  catch { return true; }
}

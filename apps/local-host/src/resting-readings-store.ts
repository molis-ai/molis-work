import { createHash } from "node:crypto";
import { chmodSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, readlinkSync, readSync, realpathSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { ProjectPluginMembership } from "@molis-ai/molis-work-contracts/modules/projects";
import type { ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { readPluginConsents, readPluginRuntimeRecords, SqlitePluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";
import { atomicWriteFileSync, homeSqlitePath, openReadOnlyHomeSqlite } from "@molis-ai/molis-work-storage";
import { ASSISTANT_HOME_STORE } from "./assistant/assistant-store.js";
import type { HomeAggregateIssue } from "./home-aggregate.js";
import { withReadOnlyHomePluginStore } from "./home-plugin-store.js";
import { repeatingFailure } from "./host-log.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { PRODUCT_VERSION } from "./product-version.js";
import type { MolisWorkLocalHostOptions } from "./project-host.js";

/**
 * Rebuildable, non-authoritative resting summary cache for closed projects, stored under the Home's registered `cache/` store
 * (`cache/resting-readings/<sha256>.json`, 0600, omitted from offline snapshots, reset on restore, removed on purge).
 *
 * Every entry is bound to a live fingerprint covering the Home path, project identity/incarnation, project SQLite file + header
 * change counter + WAL edges, project catalog plugin membership, Home plugin runtime grants/consents/publishers, product build
 * identity, and configured fixtures. Any mismatch, symlink, corruption, or size bound violation fails closed to a cache miss.
 * Provider error messages are never written (S-12): only sanitized answers and code-only `actions.plugin_disabled` issues are kept.
 */

const CACHE_DIR = "cache";
const RESTING_DIR = "resting-readings";
const MAX_SNAPSHOT_BYTES = 1_048_576;
const MAX_ENTRIES_PER_PROJECT = 16;
const MAX_KEYS_PER_ENTRY = 64;
const MAX_ANSWERS_PER_ENTRY = 128;
const MAX_ISSUES_PER_ENTRY = 128;
const SQLITE_HEADER_BYTES = 100;
const WAL_EDGE_BYTES = 32;
const HEX_64 = /^[0-9a-f]{64}$/u;
const HEX_JSON = /^[0-9a-f]{64}\.json$/u;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const PERSISTABLE_ISSUE_CODE = "actions.plugin_disabled";

const unwritable = repeatingFailure("home", "resting_readings_unwritable");

export interface PersistedRestingAnswer {
  readonly project_id: string;
  readonly source: Required<ActionReference>;
  readonly plugin_id: string | null;
  readonly subject_kinds: readonly string[];
  readonly output: unknown;
}

export interface RestingReadingSnapshot {
  readonly fingerprint: string;
  readonly host_instance_id?: string;
  readonly keys: Readonly<Record<string, string>>;
  readonly result: {
    readonly answers: readonly PersistedRestingAnswer[];
    readonly issues: readonly HomeAggregateIssue[];
  };
}

interface PersistedRestingProjectFile {
  readonly home_directory: string;
  readonly project_id: string;
  readonly storage_key: string;
  readonly updated_at: string;
  readonly entries: Record<string, RestingReadingSnapshot>;
}

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const snapshotFileName = (storageKey: string): string => `${sha256(storageKey)}.json`;
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Reads exact bytes from an open file descriptor at `offset`, returning null on short read. */
function readExact(descriptor: number, length: number, offset: number): Buffer | null {
  if (length === 0) return Buffer.alloc(0);
  const buffer = Buffer.alloc(length);
  let total = 0;
  while (total < length) {
    const count = readSync(descriptor, buffer, total, length - total, offset + total);
    if (count <= 0) return null;
    total += count;
  }
  return buffer;
}

/**
 * Fingerprints one file without following links and without opening SQLite: stat metadata plus bounded head/tail bytes.
 * Returns `"-"` when the file does not exist, or `null` when it is not a regular file or cannot be read stably.
 */
function readBoundedEdgeStamp(file: string, headBytes: number, tailBytes: number): string | null {
  let info: ReturnType<typeof lstatSync>;
  try {
    info = lstatSync(file, { bigint: true, throwIfNoEntry: false });
  } catch {
    return null;
  }
  if (!info) return "-";
  if (info.isSymbolicLink() || !info.isFile()) return null;
  let descriptor: number;
  try {
    descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch {
    return null;
  }
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    if (
      !opened.isFile()
      || opened.dev !== info.dev
      || opened.ino !== info.ino
      || opened.size !== info.size
      || opened.mtimeNs !== info.mtimeNs
    ) {
      return null;
    }
    const sizeBig = opened.size;
    const headLen = Number(sizeBig < BigInt(headBytes) ? sizeBig : BigInt(headBytes));
    const head = readExact(descriptor, headLen, 0);
    if (!head) return null;
    let tailHex = "";
    if (tailBytes > 0 && sizeBig > BigInt(headBytes)) {
      const remaining = sizeBig - BigInt(headBytes);
      const tailLen = Number(remaining < BigInt(tailBytes) ? remaining : BigInt(tailBytes));
      const offsetBig = sizeBig - BigInt(tailLen);
      if (offsetBig > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      const tail = readExact(descriptor, tailLen, Number(offsetBig));
      if (!tail) return null;
      tailHex = tail.toString("hex");
    }
    return `${opened.dev}:${opened.ino}:${opened.size}:${opened.mtimeNs}:${head.toString("hex")}:${tailHex}`;
  } catch {
    return null;
  } finally {
    closeSync(descriptor);
  }
}

/**
 * Fingerprints a project SQLite database without opening SQLite or creating sidecar files.
 * Reading the first 100 bytes captures SQLite's file change counter (bytes 24..27) and schema cookie (bytes 40..43),
 * catching even same-millisecond, same-size in-place commits on coarse-mtime filesystems; reading WAL header and tail
 * captures uncheckpointed WAL writes and WAL resets.
 */
export function sqliteFileFingerprint(databasePath: string): string | null {
  const main = readBoundedEdgeStamp(databasePath, SQLITE_HEADER_BYTES, 0);
  if (!main || main === "-") return null;
  const wal = readBoundedEdgeStamp(`${databasePath}-wal`, WAL_EDGE_BYTES, WAL_EDGE_BYTES);
  if (!wal) return null;
  let journalInfo: ReturnType<typeof lstatSync>;
  try {
    journalInfo = lstatSync(`${databasePath}-journal`, { bigint: true, throwIfNoEntry: false });
  } catch {
    return null;
  }
  if (journalInfo && (journalInfo.isSymbolicLink() || !journalInfo.isFile())) return null;
  const journal = journalInfo ? `${journalInfo.dev}:${journalInfo.ino}:${journalInfo.size}:${journalInfo.mtimeNs}` : "-";
  return sha256(JSON.stringify([main, wal, journal]));
}

/**
 * Fingerprints an optional Home-level SQLite database without opening SQLite or creating sidecar files.
 * Returns `"-"` when absent, a SHA-256 edge fingerprint when present, or `null` on symlink/unreadable errors.
 */
function optionalSqliteFileFingerprint(databasePath: string): string | null {
  const main = readBoundedEdgeStamp(databasePath, SQLITE_HEADER_BYTES, 0);
  if (!main) return null;
  const wal = readBoundedEdgeStamp(`${databasePath}-wal`, WAL_EDGE_BYTES, WAL_EDGE_BYTES);
  if (!wal) return null;
  let journalInfo: ReturnType<typeof lstatSync>;
  try {
    journalInfo = lstatSync(`${databasePath}-journal`, { bigint: true, throwIfNoEntry: false });
  } catch {
    return null;
  }
  if (journalInfo && (journalInfo.isSymbolicLink() || !journalInfo.isFile())) return null;
  const journal = journalInfo ? `${journalInfo.dev}:${journalInfo.ino}:${journalInfo.size}:${journalInfo.mtimeNs}` : "-";
  if (main === "-" && wal === "-" && journal === "-") return "-";
  return sha256(JSON.stringify([main, wal, journal]));
}

let cachedAggregateHomeStores: readonly string[] | undefined;
function aggregateHomeStoreNames(): readonly string[] {
  if (!cachedAggregateHomeStores) {
    const names = new Set<string>([ASSISTANT_HOME_STORE.path]);
    for (const entry of PLATFORM_PLUGIN_REGISTRATIONS) {
      const homeDb = entry.manifest.databases?.home;
      if (!homeDb || homeDb.partition) continue;
      if ((entry.manifest.actions ?? []).some(action => action.action.home_aggregate === true)) {
        names.add(homeDb.store_name);
      }
    }
    cachedAggregateHomeStores = [...names].sort();
  }
  return cachedAggregateHomeStores;
}

const HOME_AGGREGATE_STORE_DIGEST_CACHE_LIMIT = 64;
const homeAggregateStoreDigestCache = new Map<string, { readonly fileFp: string; readonly logicalDigest: string }>();

/**
 * Computes a logical content digest of a Home-level SQLite database (invariant across clean WAL checkpoints on
 * shutdown, sensitive to any schema or row insert/update/delete). Cached by bounded file-edge fingerprint so steady-state
 * polls open zero SQLite handles.
 */
function logicalHomeSqliteDigest(homeDirectory: string, storeName: string, dbPath: string, fileFp: string): string | null {
  const cached = homeAggregateStoreDigestCache.get(dbPath);
  if (cached && cached.fileFp === fileFp) return cached.logicalDigest;
  let db: ReturnType<typeof openReadOnlyHomeSqlite>;
  try {
    db = openReadOnlyHomeSqlite(homeDirectory, storeName);
  } catch {
    homeAggregateStoreDigestCache.delete(dbPath);
    return null;
  }
  try {
    const hash = createHash("sha256");
    const schemaVersion = Number((db.prepare("PRAGMA schema_version").get() as { schema_version?: number } | undefined)?.schema_version ?? 0);
    hash.update(`schema:${schemaVersion}\n`);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>;
    for (const { name } of tables) {
      hash.update(`table:${name}\n`);
      const escaped = `"${name.replaceAll('"', '""')}"`;
      for (const row of db.prepare(`SELECT * FROM ${escaped}`).iterate()) {
        hash.update(JSON.stringify(row));
        hash.update("\n");
      }
    }
    const logicalDigest = hash.digest("hex");
    homeAggregateStoreDigestCache.set(dbPath, { fileFp, logicalDigest });
    while (homeAggregateStoreDigestCache.size > HOME_AGGREGATE_STORE_DIGEST_CACHE_LIMIT) {
      homeAggregateStoreDigestCache.delete(homeAggregateStoreDigestCache.keys().next().value!);
    }
    return logicalDigest;
  } catch {
    homeAggregateStoreDigestCache.delete(dbPath);
    return null;
  } finally {
    db.close();
  }
}

/**
 * Fingerprints Home-level SQLite stores read by `home_aggregate` providers (such as `assistant/assistant.db` and Home
 * plugins declaring `databases.home` + `home_aggregate`), so mutations while a project rests invalidate its cached summary
 * while clean WAL checkpoints during Host shutdown preserve matching fingerprints across restarts.
 */
export function homeAggregateStoresFingerprint(homeDirectory: string): string | null {
  const stamps: Array<readonly [string, string]> = [];
  for (const storeName of aggregateHomeStoreNames()) {
    const dbPath = homeSqlitePath(homeDirectory, storeName);
    const fileFp = optionalSqliteFileFingerprint(dbPath);
    if (fileFp === null) {
      homeAggregateStoreDigestCache.delete(dbPath);
      return null;
    }
    if (fileFp === "-") {
      homeAggregateStoreDigestCache.delete(dbPath);
      stamps.push([storeName, "-"]);
      continue;
    }
    const logical = logicalHomeSqliteDigest(homeDirectory, storeName, dbPath, fileFp);
    if (logical === null) return null;
    stamps.push([storeName, logical]);
  }
  return sha256(JSON.stringify(stamps));
}

/**
 * Non-fingerprint stat identity for a project DB whose regular-file fingerprint cannot be computed (e.g. symlink or
 * unreadable permissions). Never matches `HEX_64` so it is never persisted to disk, while letting in-memory failed-open
 * caching avoid re-waking the same broken project on every poll until the file's stat or symlink target changes.
 */
export function unreadableFileIdentity(databasePath: string): string {
  const describe = (file: string): string => {
    let info: ReturnType<typeof lstatSync>;
    try {
      info = lstatSync(file, { bigint: true, throwIfNoEntry: false });
    } catch {
      return "stat-error";
    }
    if (!info) return "missing";
    if (info.isSymbolicLink()) {
      let target = "";
      try {
        target = readlinkSync(file);
      } catch {
        target = "readlink-error";
      }
      return `symlink:${info.dev}:${info.ino}:${info.mtimeNs}:${info.ctimeNs}:${target}`;
    }
    const kind = info.isFile() ? "file" : "other";
    return `${kind}:${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}:${info.mode}`;
  };
  return `unreadable:${sha256(JSON.stringify([describe(databasePath), describe(`${databasePath}-wal`), describe(`${databasePath}-journal`)]))}`;
}

/** Stable digest of any configured plugin fixtures so test runs with different fixtures never share cached answers. */
export function pluginFixturesStamp(fixtures: MolisWorkLocalHostOptions["pluginFixtures"]): string {
  if (!fixtures) return "none";
  const describeFixture = (entry: NonNullable<NonNullable<typeof fixtures>["project"]>[number]) => {
    const definition = "manifest" in entry ? entry : entry.definition;
    const manifest = definition.manifest;
    const actions = (manifest.actions ?? [])
      .map(action => `${action.capability_id}@${action.version}:${action.action.output_type ?? ""}:${action.action.home_aggregate === true ? "1" : "0"}`)
      .sort();
    return [manifest.plugin_id, manifest.version, manifest.publisher.publisher_id, manifest.publisher.signature, actions];
  };
  const project = (fixtures.project ?? []).map(describeFixture).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const home = (fixtures.home ?? []).map(describeFixture).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const installed = [...(fixtures.installed ?? [])]
    .map(definition => [definition.manifest.plugin_id, definition.manifest.version, definition.manifest.publisher.signature])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return sha256(JSON.stringify([project, home, installed]));
}

const HOME_PLUGINS_STAMP_CACHE_LIMIT = 64;
const homePluginsStampCache = new Map<string, { readonly stamp: string; readonly digest: string }>();

/**
 * Semantic stamp of Home plugin runtime installations, consents, and pinned publishers.
 * Reuses the held read-only Home SQLite pool (`withReadOnlyHomePluginStore`) and caches the semantic digest by live DB stamp.
 * Normalizes active (`running`) and cleanly stopped (`installed`) states so a clean Host restart without permission or
 * enablement changes preserves the stamp, while any disable, uninstall, crash, quarantine, grant revocation, consent
 * revocation, publisher revocation, or version change immediately invalidates cached resting answers.
 */
export function homePluginsSemanticStamp(homeDirectory: string, fixturesStamp: string): string | null {
  const cacheKey = `${resolve(homeDirectory)}\u0000${fixturesStamp}`;
  try {
    const digest = withReadOnlyHomePluginStore(homeDirectory, (db, stamp) => {
      const cached = homePluginsStampCache.get(cacheKey);
      if (cached && cached.stamp === stamp) return cached.digest;
      const records = readPluginRuntimeRecords(db);
      const ledger = new SqlitePluginConsentLedger(db);
      const normalizedRecords = records.map(record => {
        const effectiveState = record.state === "running" || record.state === "installed" ? "enabled" : record.state;
        return [
          record.install_id,
          record.plugin_id,
          record.installation_generation,
          record.version,
          record.manifest_digest,
          record.publisher_id,
          record.publisher_signature,
          record.publisher_trust,
          effectiveState,
          [...record.grants].sort(),
        ];
      }).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      const consents = readPluginConsents(db).map(row => [
        row.consent_id,
        row.plugin_id,
        row.publisher_signature,
        row.kind,
        row.subject,
        row.manifest_digest,
        row.revoked_at !== null,
        row.approved_capability_ids ? [...row.approved_capability_ids].sort() : null,
      ]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      const publishers = ledger.publishers()
        .map(pin => [pin.key_id, pin.public_key_spki_base64, pin.revoked_at !== null] as const)
        .sort((a, b) => a[0].localeCompare(b[0]));
      const computed = sha256(JSON.stringify([PRODUCT_VERSION, fixturesStamp, normalizedRecords, consents, publishers]));
      homePluginsStampCache.set(cacheKey, { stamp, digest: computed });
      while (homePluginsStampCache.size > HOME_PLUGINS_STAMP_CACHE_LIMIT) {
        homePluginsStampCache.delete(homePluginsStampCache.keys().next().value!);
      }
      return computed;
    });
    if (digest === undefined) {
      homePluginsStampCache.delete(cacheKey);
      return sha256(JSON.stringify([PRODUCT_VERSION, fixturesStamp, "absent"]));
    }
    return digest;
  } catch {
    homePluginsStampCache.delete(cacheKey);
    return null;
  }
}

/** Combined live validity fingerprint for one closed project's resting aggregate readings. */
export function computeProjectRestingFingerprint(input: {
  readonly homeDirectory: string;
  readonly reference: LocalHostProjectReference;
  readonly createdAt: string;
  readonly membership: ProjectPluginMembership;
  readonly homePluginsStamp: string;
  readonly homeAggregateStoresStamp?: string;
}): string | null {
  const dbStamp = sqliteFileFingerprint(input.reference.storage_key);
  if (!dbStamp) return null;
  const homeStoresStamp = input.homeAggregateStoresStamp ?? homeAggregateStoresFingerprint(input.homeDirectory);
  if (!homeStoresStamp) return null;
  return sha256(JSON.stringify([
    resolve(input.homeDirectory),
    input.reference.project_id,
    input.reference.storage_key,
    input.createdAt,
    [...input.membership.plugins].sort(),
    [...input.membership.hidden].sort(),
    input.homePluginsStamp,
    homeStoresStamp,
    dbStamp,
  ]));
}

/** Ensures `home/cache/resting-readings` stays confined inside `home` with mode 0700 and never follows symlinks. */
function resolveRestingDirectory(homeDirectory: string, create: boolean): string | null {
  const canonicalHome = resolve(homeDirectory);
  let homeInfo: ReturnType<typeof lstatSync>;
  try {
    homeInfo = lstatSync(canonicalHome, { throwIfNoEntry: false });
  } catch {
    return null;
  }
  if (!homeInfo || homeInfo.isSymbolicLink() || !homeInfo.isDirectory()) return null;
  let realHome: string;
  try {
    realHome = realpathSync(canonicalHome);
  } catch {
    return null;
  }
  const cacheDir = join(canonicalHome, CACHE_DIR);
  const restingDir = join(cacheDir, RESTING_DIR);
  for (const directory of [cacheDir, restingDir]) {
    let info: ReturnType<typeof lstatSync>;
    try {
      info = lstatSync(directory, { throwIfNoEntry: false });
    } catch {
      return null;
    }
    if (!info) {
      if (!create) return null;
      try {
        mkdirSync(directory, { mode: 0o700 });
      } catch {
        return null;
      }
      info = lstatSync(directory, { throwIfNoEntry: false });
    }
    if (!info || info.isSymbolicLink() || !info.isDirectory()) return null;
    if (create && (info.mode & 0o777) !== 0o700) {
      try {
        chmodSync(directory, 0o700);
      } catch {
        return null;
      }
    }
  }
  try {
    const realResting = realpathSync(restingDir);
    if (!realResting.startsWith(`${realHome}${sep}`)) return null;
  } catch {
    return null;
  }
  return restingDir;
}

function sanitizeActionReference(raw: unknown): Required<ActionReference> | null {
  if (!isPlainObject(raw)) return null;
  const { capability_id: capabilityId, version: actionVersion, provider_id: providerId } = raw;
  if (
    typeof capabilityId !== "string" || capabilityId.length === 0 || capabilityId.length > 200
    || typeof actionVersion !== "number" || !Number.isSafeInteger(actionVersion) || actionVersion <= 0
    || typeof providerId !== "string" || providerId.length === 0 || providerId.length > 200
  ) {
    return null;
  }
  return { capability_id: capabilityId, version: actionVersion, provider_id: providerId };
}

function sanitizeAnswer(raw: unknown, expectedProjectId: string): PersistedRestingAnswer | null {
  if (!isPlainObject(raw)) return null;
  if (raw.project_id !== expectedProjectId) return null;
  const source = sanitizeActionReference(raw.source);
  if (!source) return null;
  const pluginId = raw.plugin_id;
  if (pluginId !== null && (typeof pluginId !== "string" || pluginId.length === 0 || pluginId.length > 200)) return null;
  if (!Array.isArray(raw.subject_kinds) || raw.subject_kinds.length > 64) return null;
  const subjectKinds: string[] = [];
  for (const kind of raw.subject_kinds) {
    if (typeof kind !== "string" || kind.length > 120) return null;
    subjectKinds.push(kind);
  }
  if (!Object.hasOwn(raw, "output") || raw.output === undefined) return null;
  return { project_id: expectedProjectId, source, plugin_id: pluginId, subject_kinds: subjectKinds, output: raw.output };
}

function sanitizeIssue(raw: unknown, expectedProjectId: string): HomeAggregateIssue | null {
  if (!isPlainObject(raw)) return null;
  if (raw.project_id !== expectedProjectId) return null;
  if (raw.code !== PERSISTABLE_ISSUE_CODE) return null;
  const source = raw.source === null ? null : sanitizeActionReference(raw.source);
  if (raw.source !== null && !source) return null;
  return { project_id: expectedProjectId, source, code: raw.code };
}

function sanitizeKeys(raw: unknown): Record<string, string> | null {
  if (!isPlainObject(raw)) return null;
  const pairs = Object.entries(raw);
  if (pairs.length > MAX_KEYS_PER_ENTRY) return null;
  const keys: Record<string, string> = {};
  for (const [sourceKey, value] of pairs) {
    if (FORBIDDEN_KEYS.has(sourceKey) || typeof value !== "string" || value.length > 512) return null;
    let parsedSource: unknown;
    try {
      parsedSource = JSON.parse(sourceKey);
    } catch {
      return null;
    }
    if (!sanitizeActionReference(parsedSource)) return null;
    keys[sourceKey] = value;
  }
  return keys;
}

function sanitizeSnapshotEntry(raw: unknown, expectedProjectId: string): RestingReadingSnapshot | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.fingerprint !== "string" || !HEX_64.test(raw.fingerprint)) return null;
  if (raw.host_instance_id !== undefined && (typeof raw.host_instance_id !== "string" || raw.host_instance_id.length === 0 || raw.host_instance_id.length > 128)) {
    return null;
  }
  const keys = sanitizeKeys(raw.keys);
  if (!keys) return null;
  if (!isPlainObject(raw.result)) return null;
  if (!Array.isArray(raw.result.answers) || raw.result.answers.length > MAX_ANSWERS_PER_ENTRY) return null;
  if (!Array.isArray(raw.result.issues) || raw.result.issues.length > MAX_ISSUES_PER_ENTRY) return null;
  const answers: PersistedRestingAnswer[] = [];
  for (const item of raw.result.answers) {
    const clean = sanitizeAnswer(item, expectedProjectId);
    if (!clean) return null;
    answers.push(clean);
  }
  const issues: HomeAggregateIssue[] = [];
  for (const item of raw.result.issues) {
    const clean = sanitizeIssue(item, expectedProjectId);
    if (!clean) return null;
    issues.push(clean);
  }
  return {
    fingerprint: raw.fingerprint,
    ...(raw.host_instance_id !== undefined ? { host_instance_id: raw.host_instance_id } : {}),
    keys,
    result: { answers, issues },
  };
}

/** Rejects prototype-polluting keys anywhere in parsed cache JSON before anything consumes it. */
function parseBoundedJson(text: string): unknown {
  return JSON.parse(text, (key, value: unknown) => {
    if (FORBIDDEN_KEYS.has(key)) throw new Error("forbidden key");
    return value;
  });
}

/**
 * Loads persisted resting snapshots for one project from `cache/resting-readings/<sha256>.json`.
 * Returns `null` on absence, symlink/confinement violation, size overflow, JSON error, or shape mismatch.
 */
export function readProjectRestingSnapshots(
  homeDirectory: string,
  reference: LocalHostProjectReference,
): Map<string, RestingReadingSnapshot> | null {
  const restingDir = resolveRestingDirectory(homeDirectory, false);
  if (!restingDir) return null;
  const file = join(restingDir, snapshotFileName(reference.storage_key));
  let info: ReturnType<typeof lstatSync>;
  try {
    info = lstatSync(file, { throwIfNoEntry: false });
  } catch {
    return null;
  }
  if (!info || info.isSymbolicLink() || !info.isFile() || info.nlink !== 1 || info.size <= 0 || info.size > MAX_SNAPSHOT_BYTES) {
    return null;
  }
  let descriptor: number;
  try {
    descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch {
    return null;
  }
  let rawBytes: Buffer | null;
  try {
    const opened = fstatSync(descriptor);
    if (
      !opened.isFile()
      || opened.dev !== info.dev
      || opened.ino !== info.ino
      || opened.size !== info.size
      || opened.mtimeMs !== info.mtimeMs
      || opened.size > MAX_SNAPSHOT_BYTES
    ) {
      return null;
    }
    rawBytes = readExact(descriptor, opened.size, 0);
  } catch {
    return null;
  } finally {
    closeSync(descriptor);
  }
  if (!rawBytes) return null;
  let parsed: unknown;
  try {
    parsed = parseBoundedJson(rawBytes.toString("utf8"));
  } catch {
    return null;
  }
  const canonicalHome = resolve(homeDirectory);
  if (!isPlainObject(parsed)) return null;
  if (
    parsed.home_directory !== canonicalHome
    || parsed.project_id !== reference.project_id
    || parsed.storage_key !== reference.storage_key
    || !isPlainObject(parsed.entries)
  ) {
    return null;
  }
  const pairs = Object.entries(parsed.entries);
  if (pairs.length === 0 || pairs.length > MAX_ENTRIES_PER_PROJECT) return null;
  const loaded = new Map<string, RestingReadingSnapshot>();
  for (const [kind, rawEntry] of pairs) {
    if (FORBIDDEN_KEYS.has(kind) || kind.length === 0 || kind.length > 512) return null;
    const clean = sanitizeSnapshotEntry(rawEntry, reference.project_id);
    if (!clean) return null;
    loaded.set(kind, clean);
  }
  return loaded;
}

/**
 * Atomically persists sanitized resting readings for one project under `cache/resting-readings/<sha256>.json` (0600).
 * Removes the file when no persistable entries remain or if the serialized payload exceeds the per-project byte bound.
 */
export function writeProjectRestingSnapshots(
  homeDirectory: string,
  reference: LocalHostProjectReference,
  entries: ReadonlyMap<string, RestingReadingSnapshot>,
): void {
  if (entries.size === 0) {
    deleteProjectRestingSnapshots(homeDirectory, reference.storage_key);
    return;
  }
  const sanitized: Record<string, RestingReadingSnapshot> = {};
  let count = 0;
  for (const [kind, entry] of entries) {
    if (count >= MAX_ENTRIES_PER_PROJECT) break;
    if (FORBIDDEN_KEYS.has(kind) || kind.length === 0 || kind.length > 512) continue;
    const clean = sanitizeSnapshotEntry(entry, reference.project_id);
    if (!clean) continue;
    sanitized[kind] = clean;
    count += 1;
  }
  if (count === 0) {
    deleteProjectRestingSnapshots(homeDirectory, reference.storage_key);
    return;
  }
  const restingDir = resolveRestingDirectory(homeDirectory, true);
  if (!restingDir) return;
  const file = join(restingDir, snapshotFileName(reference.storage_key));
  let existing: ReturnType<typeof lstatSync>;
  try {
    existing = lstatSync(file, { throwIfNoEntry: false });
  } catch {
    return;
  }
  if (existing && (existing.isSymbolicLink() || !existing.isFile())) return;
  const record: PersistedRestingProjectFile = {
    home_directory: resolve(homeDirectory),
    project_id: reference.project_id,
    storage_key: reference.storage_key,
    updated_at: new Date().toISOString(),
    entries: sanitized,
  };
  try {
    const payload = `${JSON.stringify(record)}\n`;
    if (Buffer.byteLength(payload, "utf8") > MAX_SNAPSHOT_BYTES) {
      deleteProjectRestingSnapshots(homeDirectory, reference.storage_key);
      return;
    }
    atomicWriteFileSync(file, payload, { mode: 0o600 });
    unwritable.worked(reference.project_id);
  } catch (error) {
    unwritable.failed(reference.project_id, error, { project_id: reference.project_id });
  }
}

/** Deletes one project's persisted resting cache file if present as a regular file inside the confined cache directory. */
export function deleteProjectRestingSnapshots(homeDirectory: string, storageKey: string): void {
  const restingDir = resolveRestingDirectory(homeDirectory, false);
  if (!restingDir) return;
  const file = join(restingDir, snapshotFileName(storageKey));
  try {
    const info = lstatSync(file, { throwIfNoEntry: false });
    if (info && !info.isSymbolicLink() && info.isFile()) {
      rmSync(file, { force: true });
    }
  } catch (error) {
    unwritable.failed(storageKey, error);
  }
}

/** Removes persisted resting cache files that belong to deleted, recycled, or otherwise unknown projects. */
export function prunePersistedRestingSnapshots(homeDirectory: string, knownStorageKeys: ReadonlySet<string>): void {
  const restingDir = resolveRestingDirectory(homeDirectory, false);
  if (!restingDir) return;
  const keptFiles = new Set([...knownStorageKeys].map(snapshotFileName));
  try {
    for (const name of readdirSync(restingDir)) {
      if (!HEX_JSON.test(name) || keptFiles.has(name)) continue;
      const target = join(restingDir, name);
      const info = lstatSync(target, { throwIfNoEntry: false });
      if (info && !info.isSymbolicLink() && info.isFile()) {
        rmSync(target, { force: true });
      }
    }
  } catch (error) {
    unwritable.failed("prune", error);
  }
}

// The directory form of a golden Home (specs/upgrade-continuity/golden-replay-design.md §2) and the moves between it and a Home: capture,
// restore, compare. Capture goes through the offline snapshot, so the stores, their owners and what is left out come from the same registry as
// a real backup (`homeStores()`), and a Home with an unregistered entry fails here as it does there. The snapshot's binary copies are read,
// never kept. Nothing in this file prints or returns the contents of a library or a file.
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { goldenFailure } from "./failure.mjs";
import { expandedReleasePayload, isReleasePayload, MODULE_SOURCES_DIRECTORY, RELEASE_MANIFESTS_DIRECTORY, releasePayloadReader, withoutReleasePayloads, withReleasePayloads, writeReleasePayloads } from "./release-payloads.mjs";

export const GOLDEN_MANIFEST_VERSION = 1;
/** Used only by golden Homes; recorded in each manifest and marked as a test key there. */
export const GOLDEN_TEST_KEY = "molis-work-golden-home-test-key-not-a-secret";
const VERSION_NAME = /^\d+\.\d+\.\d+(?:-dev\.\d+)?$/u;
const SQLITE_HEADER = "SQLite format 3\0";
/** The account bridge's credential. The web surface creates one when it starts, so the generating Home has it, and it stays out of the golden (UPG2-06). */
const NATIVE_SESSION_TOKEN = "config/native-session-token";

/**
 * The one row whose bytes the fixed clock cannot reach: the third-party sample runs in its sandbox, on the real clock, and names its record by the time
 * and chance. The sample is signed and a golden has no way into that process, so its fields are fixed here, in this row only and nowhere else.
 */
const SANDBOX_ENTRIES_ROW = /^INSERT INTO "plugin_private_values"\("install_id","item_key","item_value"\) VALUES\('[^']+','sandbox:entries',/u;
const SANDBOX_ENTRY_FIELDS = [[/\bi\d{17}-[a-z0-9]+\b/gu, "i20260115090000000-golden"], [/"created_at":"[^"]+"/gu, '"created_at":"2026-01-15T09:00:00.000Z"']];
export const withFixedSandboxEntries = sql => sql.split("\n").map(line => SANDBOX_ENTRIES_ROW.test(line) ? SANDBOX_ENTRY_FIELDS.reduce((row, [field, fixed]) => row.replace(field, fixed), line) : line).join("\n");

export function assertGoldenVersionName(version) {
  if (typeof version !== "string" || !VERSION_NAME.test(version)) throw goldenFailure("golden.version_name_invalid", "arguments");
}

/** UPG2-01: only a directory under the system's temporary directory, and never the real Home whatever it is called. */
export function assertTemporaryHome(home) {
  const real = realpathSync(home), temporary = realpathSync(tmpdir());
  const realHome = lstatSync(path.join(homedir(), ".molis-work"), { throwIfNoEntry: false }) ? realpathSync(path.join(homedir(), ".molis-work")) : path.join(homedir(), ".molis-work");
  if (real === realHome || real.startsWith(`${realHome}${path.sep}`) || !real.startsWith(`${temporary}${path.sep}`)) throw goldenFailure("golden.real_home_refused", "home");
  return real;
}

export function createTemporaryHome(prefix) {
  const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), prefix))), home = path.join(scratch, "home");
  mkdirSync(home, { mode: 0o700 });
  return { scratch, home: assertTemporaryHome(home), remove: () => rmSync(scratch, { recursive: true, force: true }) };
}

/** What every process touching a golden Home runs under: this Home, the test key, a file secret store rather than the machine's keychain. */
export function goldenEnvironment(home) {
  return { MOLIS_WORK_HOME: home, MOLIS_WORK_SECRET_BACKEND: "env", MOLIS_WORK_ENCRYPTION_KEY: GOLDEN_TEST_KEY };
}

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const byPath = (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

function isSqliteFile(file) {
  const handle = readFileSync(file);
  return handle.length >= SQLITE_HEADER.length && handle.subarray(0, SQLITE_HEADER.length).toString("latin1") === SQLITE_HEADER;
}

function dumpInto(storage, source, relative, out, owner, mode, tree) {
  const db = new DatabaseSync(source, { readOnly: true });
  let dump;
  try { dump = storage.dumpSqliteText(db, relative); } finally { db.close(); }
  const full = withFixedSandboxEntries(dump.sql), sql = withoutReleasePayloads(full, tree.payloads), payload = `stores/${relative}.sql`, file = path.join(out, payload);
  if (withReleasePayloads(sql, (directory, digest) => (directory === MODULE_SOURCES_DIRECTORY ? tree.payloads.sources : tree.payloads.manifests).get(digest)) !== full) throw goldenFailure("golden.release_payload_not_reversible", relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, sql);
  return { path: relative, owner, mode, payload, schema_version: dump.version, tables: dump.tables, sha256: sha256(sql), ...(sql === full ? {} : { expanded_sha256: sha256(full) }) };
}

function copyInto(source, relative, out, owner, mode) {
  const payload = `files/${relative}`, file = path.join(out, payload);
  mkdirSync(path.dirname(file), { recursive: true });
  copyFileSync(source, file);
  const bytes = readFileSync(file);
  return { path: relative, owner, mode, payload, size: bytes.length, sha256: sha256(bytes) };
}

/** A tree the offline snapshot leaves out on purpose: walked here, and its libraries dumped like any other. */
function collectOmitted(storage, home, prefix, relative, owner, out, tree) {
  const source = path.join(home, relative), info = lstatSync(source, { throwIfNoEntry: false });
  if (!info) return;
  const inTree = prefix ? `${prefix}/${relative}` : relative, mode = info.mode & 0o777;
  if (info.isSymbolicLink()) throw goldenFailure("golden.link_refused", inTree);
  if (info.isDirectory()) {
    tree.directories.push({ path: inTree, mode });
    for (const name of readdirSync(source).sort()) collectOmitted(storage, home, prefix, `${relative}/${name}`, owner, out, tree);
    return;
  }
  if (/-(?:journal|wal|shm)$/u.test(relative)) { tree.excluded.push({ path: inTree, reason: "SQLite sidecar; the dump holds committed rows" }); return; }
  if (isSqliteFile(source)) tree.stores.push(dumpInto(storage, source, inTree, out, owner, mode, tree));
  else tree.files.push(copyInto(source, inTree, out, owner, mode));
}

/**
 * One Home into the tree. `prefix` is where it sits inside the root Home (`spaces/<spaceId>` for the account Home), so a path in the manifest is
 * always relative to the root. Snapshot rules decide which stores exist; the snapshot is thrown away afterwards.
 */
export async function captureHome(host, storage, home, prefix, out, tree) {
  const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), "golden-capture-")));
  try {
    const result = await host.createHomeSnapshot({ homeDirectory: home, destination: path.join(scratch, "snapshot") });
    const snapshot = result.snapshot_directory, manifest = JSON.parse(readFileSync(path.join(snapshot, "manifest.json"), "utf8"));
    const inTree = relative => prefix ? `${prefix}/${relative}` : relative;
    tree.product_version = manifest.product_version;
    tree.directories.push(...manifest.container_directories.map(item => ({ path: inTree(item.path), mode: item.mode })));
    if (prefix) tree.directories.push({ path: prefix, mode: manifest.home_mode });
    for (const store of manifest.stores) {
      tree.excluded.push(...store.exclusions.map(item => ({ path: inTree(item.path), reason: item.reason })));
      for (const entry of store.entries) {
        if (entry.kind === "directory") tree.directories.push({ path: inTree(entry.path), mode: entry.mode });
        else if (entry.sqlite) tree.stores.push(dumpInto(storage, path.join(snapshot, entry.payload_path), inTree(entry.path), out, store.owner, entry.mode, tree));
        else tree.files.push(copyInto(path.join(home, entry.path), inTree(entry.path), out, store.owner, entry.mode));
      }
      for (const dependency of store.dependencies) if (dependency.kind === "file-key") {
        const relative = dependency.location.replace(/^home:/u, "");
        tree.files.push({ ...copyInto(path.join(home, relative), inTree(relative), out, store.owner, statSync(path.join(home, relative)).mode & 0o777), test_key: true });
      }
    }
    tree.excluded.push(...manifest.exclusions.map(item => ({ path: inTree(item.path), reason: item.reason })).filter(item => lstatSync(path.join(home, item.path.slice(prefix ? prefix.length + 1 : 0)), { throwIfNoEntry: false })));
    // The snapshot's omissions that are user data (§2 items 6-8): `spaces` is handled by the caller, one Home at a time.
    for (const relative of ["storage-space.json", "plugin-packages"]) collectOmitted(storage, home, prefix, relative, "apps/local-host", out, tree);
    collectOmitted(storage, home, prefix, "sync", "modules/sync-replication", out, tree);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

/** A path of the generating Home inside a golden makes the golden unusable at any other path; only the file is named, never the match. */
export function assertNoHomePath(out, tree, home) {
  for (const entry of [...tree.stores, ...tree.files]) {
    if (entry.path.endsWith(NATIVE_SESSION_TOKEN)) throw goldenFailure("golden.account_credential_present", entry.path);
    if (readFileSync(path.join(out, entry.payload)).includes(home)) throw goldenFailure("golden.home_path_recorded", entry.path);
  }
  for (const texts of [tree.payloads.sources, tree.payloads.manifests]) for (const [digest, text] of texts) if (text.includes(home)) throw goldenFailure("golden.home_path_recorded", digest);
}

export function writeManifest(out, { payloads, ...manifest }) {
  const sorted = { ...manifest, module_sources: writeReleasePayloads(out, MODULE_SOURCES_DIRECTORY, payloads.sources), release_manifests: writeReleasePayloads(out, RELEASE_MANIFESTS_DIRECTORY, payloads.manifests) };
  for (const key of ["directories", "stores", "files", "excluded"]) {
    const seen = new Set();
    sorted[key] = manifest[key].filter(item => !seen.has(item.path) && seen.add(item.path)).sort(byPath);
  }
  writeFileSync(path.join(out, "manifest.json"), `${JSON.stringify(sorted, null, 2)}\n`);
  return sorted;
}

export function readManifest(directory) {
  const manifest = JSON.parse(readFileSync(path.join(directory, "manifest.json"), "utf8"));
  if (manifest.schema_version !== GOLDEN_MANIFEST_VERSION) throw goldenFailure("golden.manifest_version_mismatch", "manifest.json");
  return manifest;
}

/** Restore every library and file into an empty Home, at its own path, with its own mode. The checksum comes first: a damaged golden is not a finding about the code. */
export function restoreGolden(directory, manifest, home) {
  const readPayload = releasePayloadReader(directory);
  for (const item of [...manifest.directories].sort(byPath)) mkdirSync(path.join(home, item.path), { recursive: true, mode: 0o700 });
  for (const entry of manifest.stores) {
    const stored = readFileSync(path.join(directory, entry.payload));
    if (sha256(stored) !== entry.sha256) throw goldenFailure("golden.payload_digest_mismatch", entry.path);
    const text = entry.expanded_sha256 ? withReleasePayloads(stored.toString("utf8"), readPayload) : stored.toString("utf8");
    if (entry.expanded_sha256 && sha256(text) !== entry.expanded_sha256) throw goldenFailure("golden.payload_digest_mismatch", entry.path);
    const file = path.join(home, entry.path);
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    // A virtual table's shadow tables are rows of the dump too; defensive mode, the driver's default, refuses to write them.
    const db = new DatabaseSync(file, { defensive: false });
    try { db.exec(text); } finally { db.close(); }
    chmodSync(file, entry.mode);
  }
  for (const entry of manifest.files) {
    const source = path.join(directory, entry.payload);
    if (sha256(readFileSync(source)) !== entry.sha256) throw goldenFailure("golden.payload_digest_mismatch", entry.path);
    const file = path.join(home, entry.path);
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    copyFileSync(source, file);
    chmodSync(file, entry.mode);
  }
  for (const item of [...manifest.directories].sort(byPath).reverse()) chmodSync(path.join(home, item.path), item.mode);
}

function listFiles(root, relative = "") {
  return readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1).flatMap(entry => {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    return entry.isDirectory() ? listFiles(root, child) : [child];
  });
}

/** For a dump, the table of the first row that differs: the place to look, without the values. */
function firstDifference(left, right) {
  const a = left.toString("utf8").split("\n"), b = right.toString("utf8").split("\n");
  for (let line = 0; line < Math.max(a.length, b.length); line++) if (a[line] !== b[line]) {
    const table = /^INSERT INTO "([^"]+)"/u.exec(a[line] ?? b[line] ?? "")?.[1];
    return { line: line + 1, ...(table ? { table } : {}) };
  }
  return {};
}

/**
 * The content a file is compared by. The commit says where a golden came from and is not part of it: a golden goes in with the commit after the one
 * it records, and a squash merge leaves that commit off main. A compressed copy is compared as what it holds: the compressor belongs to the Node that ran it.
 */
function comparable(file, bytes) {
  if (file === "manifest.json") return Buffer.from(JSON.stringify({ ...JSON.parse(bytes), commit: null }, null, 2));
  return isReleasePayload(file) ? expandedReleasePayload(bytes) : bytes;
}

/** UPG2-02: every difference between two golden directories, by path, line and table, and never by content. */
export function compareGoldens(left, right) {
  const leftFiles = new Set(listFiles(left)), rightFiles = new Set(listFiles(right)), differences = [];
  for (const file of [...new Set([...leftFiles, ...rightFiles])].sort()) {
    if (!rightFiles.has(file)) { differences.push({ path: file, reason: "missing_on_right" }); continue; }
    if (!leftFiles.has(file)) { differences.push({ path: file, reason: "missing_on_left" }); continue; }
    const a = comparable(file, readFileSync(path.join(left, file))), b = comparable(file, readFileSync(path.join(right, file)));
    if (!a.equals(b)) differences.push({ path: file, reason: "differs", ...(file.endsWith(".sql") || file === "manifest.json" ? firstDifference(a, b) : {}) });
  }
  return differences;
}

/** The total size on disk, for checking the estimate in §6 against what a generation actually produces. */
export function directoryBytes(root) {
  return listFiles(root).reduce((total, file) => total + statSync(path.join(root, file)).size, 0);
}

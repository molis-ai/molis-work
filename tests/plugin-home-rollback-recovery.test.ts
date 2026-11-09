import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { closeSync, existsSync, fstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, readSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { acquireStorageOwner, ensureStorageSpace, openSqliteConnection, type StorageOwner } from "@molis-ai/molis-work-storage";
import { recoverSqliteRollbackJournals, type RollbackLibrary } from "../packages/storage/dist/rollback-journal.js";

const childEntry = fileURLToPath(new URL("./fixtures/plugin-home-rollback-child.mjs", import.meta.url));

function fixture(t: TestContext, version = 2, initialOwner = "trusted", long = false) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "molis-recovery-中文-"));
  let held: StorageOwner | undefined;
  t.after(() => { held?.release(); rmSync(root, { recursive: true, force: true }); });
  const home = long ? join(root, "a".repeat(220), "b".repeat(451 - Buffer.byteLength(root) - 222)) : root;
  const file = join(home, "projects", "n12", "molis-work.db"), libraryFile = join(home, "documents", "documents.db");
  for (const [path, schemaVersion, ownerName] of [[file, version, initialOwner], [libraryFile, 1, "trusted"]] as const) {
    mkdirSync(dirname(path), { recursive: true });
    const db = openSqliteConnection(path);
    try {
      db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA; PRAGMA user_version=${schemaVersion};
        CREATE TABLE facts (id INTEGER PRIMARY KEY, owner TEXT NOT NULL, value TEXT NOT NULL);
        CREATE TABLE padding (id INTEGER PRIMARY KEY, payload BLOB NOT NULL);`);
      db.prepare("INSERT INTO facts VALUES (1, ?, 'original')").run(ownerName);
      db.prepare("INSERT INTO padding VALUES (1, zeroblob(?))").run(8 * 1024 * 1024);
    } finally { db.close(); }
  }
  const lockDirectory = join(home, "agent-runtime"), owner = acquireStorageOwner(lockDirectory);
  held = owner;
  const inspect: RollbackLibrary["inspect"] = db => assert.equal(db.prepare<[], { owner: string }>("SELECT owner FROM facts WHERE id=1").get()?.owner, "trusted");
  const libraries: RollbackLibrary[] = [{ path: file, kind: "project", version: 2, inspect }, { path: libraryFile, kind: "home", version: 1, inspect }];
  const lock = { home, lockDirectory, owner };
  return { home, file, libraryFile, journal: file + "-journal", marker: file + "-mj000000900", libraries, lock,
    releaseOwner() { held?.release(); held = undefined; },
    takeOwner() { held = acquireStorageOwner(lockDirectory); lock.owner = held; },
  };
}

async function stopDuringWrite(t: TestContext, file: string, version: number, owner: string, first = false): Promise<void> {
  const child = spawn(process.execPath, [childEntry, file, String(version), owner, ...(first ? ["first"] : [])], { stdio: ["ignore", "pipe", "pipe"] });
  const ended = once(child, "exit");
  try {
    const staged = once(child.stdout, "data", { signal: t.signal }).then(args => String(args[0]));
    const notice = await Promise.race([staged, ended.then(() => "exited before cache spill")]);
    assert.match(notice, /^staged/u);
    assert.ok(child.kill("SIGKILL"));
    const [, signal] = await ended;
    assert.equal(signal, "SIGKILL");
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await ended;
  }
}

function dirtyFacts(file: string) {
  const uri = pathToFileURL(file);
  uri.searchParams.set("immutable", "1");
  const db = new DatabaseSync(uri, { readOnly: true });
  try { return { ...db.prepare("PRAGMA user_version").get(), ...db.prepare("SELECT owner, value FROM facts WHERE id=1").get() }; }
  finally { db.close(); }
}

function tailHas(path: string, marker: string): boolean {
  try {
    const fd = openSync(path, "r");
    try {
      const tail = Buffer.alloc(4096), size = fstatSync(fd).size;
      const count = readSync(fd, tail, 0, tail.length, Math.max(0, size - tail.length));
      return tail.subarray(0, count).includes(marker);
    } finally { closeSync(fd); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function runPair(t: TestContext, f: ReturnType<typeof fixture>, interrupt: boolean): Promise<string | undefined> {
  const child = spawn(process.execPath, [childEntry, f.file, "2", "trusted", "pair", f.libraryFile], { stdio: ["ignore", "pipe", "inherit"] });
  const ended = once(child, "exit");
  const markerIn = () => readdirSync(dirname(f.file)).find(name => name.startsWith("molis-work.db-mj"));
  let selected: string | undefined;
  const observer = interrupt ? setInterval(() => {
    const marker = markerIn();
    if (selected || !marker) return;
    const path = join(dirname(f.file), marker);
    if (tailHas(f.journal, path) && tailHas(f.libraryFile + "-journal", path) && child.kill("SIGKILL")) selected = path;
  }, 1) : undefined;
  try {
    const result = await Promise.race([ended, once(t.signal, "abort").then(() => [])]);
    if (interrupt) {
      assert.equal(result[1], "SIGKILL");
      assert.ok(selected && existsSync(selected), "both rollback journals named the live super-journal at SIGKILL");
    } else assert.deepEqual(result, [0, null]);
    return selected;
  } finally {
    clearInterval(observer);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await ended;
  }
}

test("BSH-03 · an actual SQLite spill before COMMIT rolls back before the Home opens", { timeout: 10_000 }, async t => {
  const f = fixture(t);
  const original = readFileSync(f.file);
  await stopDuringWrite(t, f.file, 2, "trusted");
  assert.equal(readFileSync(f.journal)[0], 0xd9, "SQLite made a hot journal");
  assert.equal(readFileSync(f.file).equals(original), false, "SQLite spilled uncommitted pages to the original file");
  recoverSqliteRollbackJournals(f.lock, f.libraries, [f.journal]);
  assert.equal(existsSync(f.journal), false);
  assert.deepEqual(dirtyFacts(f.file), { user_version: 2, owner: "trusted", value: "original" });
  recoverSqliteRollbackJournals(f.lock, f.libraries, []);
});

test("BSH-03 · both the dirty header and replayed owner must pass before touching either original", { timeout: 10_000 }, async t => {
  for (const scenario of [{ original: 99, originalOwner: "foreign", dirty: 2 }, { original: 2, originalOwner: "trusted", dirty: 99 }]) {
    const f = fixture(t, scenario.original, scenario.originalOwner);
    await stopDuringWrite(t, f.file, scenario.dirty, "trusted");
    assert.equal(readFileSync(f.journal)[0], 0xd9);
    // A page the kernel spills last is timing-dependent. Inject the conflicting raw header and owner into the dirty image,
    // while keeping the actual SQLite journal from the interrupted write as the only source of its preimage.
    const dirty = readFileSync(f.file);
    dirty.writeUInt32BE(scenario.dirty, 60);
    const foreign = dirty.indexOf("foreign");
    if (foreign !== -1) dirty.write("trusted", foreign);
    writeFileSync(f.file, dirty);
    assert.equal(dirtyFacts(f.file).user_version, scenario.dirty);
    assert.equal(dirtyFacts(f.file).owner, "trusted");
    const paths = [f.file, f.journal, f.libraryFile], before = paths.map(path => readFileSync(path));
    assert.throws(() => recoverSqliteRollbackJournals(f.lock, f.libraries, [f.journal]), { code: "actions.conflict" });
    for (const [index, path] of paths.entries()) assert.deepEqual(readFileSync(path), before[index]);
  }
});

test("BSH-03 · an unknown footer and a linked marker leave the source and external files untouched", t => {
  const f = fixture(t), outside = mkdtempSync(join(realpathSync(tmpdir()), "molis-external-sentinel-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const sentinel = join(outside, "outside-mj000000900");
  writeFileSync(sentinel, "keep this file");
  const reference = Buffer.from(sentinel), footer = Buffer.alloc(16);
  footer.writeUInt32BE(reference.length, 0);
  footer.writeUInt32BE(reference.reduce((sum, byte) => sum + byte, 0), 4);
  Buffer.from("d9d505f920a163d7", "hex").copy(footer, 8);
  const unknown = Buffer.concat([Buffer.alloc(64), reference, footer]);
  writeFileSync(f.journal, unknown);
  assert.throws(() => recoverSqliteRollbackJournals(f.lock, f.libraries, [f.journal]), { code: "actions.conflict" });
  assert.deepEqual(readFileSync(f.journal), unknown);
  rmSync(f.journal);
  symlinkSync(sentinel, f.marker);
  assert.throws(() => recoverSqliteRollbackJournals(f.lock, f.libraries, [f.marker]), { code: "actions.input_invalid" });
  assert.equal(readFileSync(sentinel, "utf8"), "keep this file");
  assert.deepEqual(dirtyFacts(f.file), { user_version: 2, owner: "trusted", value: "original" });
});

test("BSH-03 · an unreferenced marker can be removed after its recognized owner's preflight", t => {
  const f = fixture(t);
  writeFileSync(f.marker, f.journal + "\0");
  recoverSqliteRollbackJournals(f.lock, f.libraries, [f.marker]);
  assert.equal(existsSync(f.marker), false);
  assert.deepEqual(dirtyFacts(f.file), { user_version: 2, owner: "trusted", value: "original" });
});

test("BSH-03 · an older preimage needs its continuous upgrade chain and compact recovery fits a long Home path", { timeout: 10_000 }, async t => {
  const f = fixture(t, 1, "trusted", true);
  await stopDuringWrite(t, f.file, 2, "trusted");
  assert.equal(readFileSync(f.journal)[0], 0xd9);
  const before = readFileSync(f.file);
  assert.throws(() => recoverSqliteRollbackJournals(f.lock, f.libraries, [f.journal]), { code: "actions.conflict" });
  assert.deepEqual(readFileSync(f.file), before);
  const project = { ...f.libraries[0]!, baseline: { version: 2, schema: "", upgrades: [{ from: 1, sql: "ALTER TABLE facts ADD COLUMN note TEXT;" }] } };
  recoverSqliteRollbackJournals(f.lock, [project, f.libraries[1]!], [f.journal]);
  assert.equal(existsSync(f.journal), false);
  assert.deepEqual(dirtyFacts(f.file), { user_version: 1, owner: "trusted", value: "original" });
});

test("BSH-03 · a first Home library's zero-header write replays to the owner initializer's empty state", { timeout: 10_000 }, async t => {
  const f = fixture(t), initialSpace = ensureStorageSpace(f.home), child = f.libraryFile + "-journal";
  rmSync(f.libraryFile);
  await stopDuringWrite(t, f.libraryFile, 0, "trusted", true);
  const raw = readFileSync(f.libraryFile);
  assert.ok(raw.length > 0);
  assert.ok(raw.subarray(0, 64).every(byte => byte === 0));
  assert.equal(readFileSync(child)[0], 0xd9);
  const library: RollbackLibrary = { ...f.libraries[1]!, initialSpace, baseline: { version: 1, schema: "CREATE TABLE ready (id TEXT PRIMARY KEY);" } };
  recoverSqliteRollbackJournals(f.lock, [library], [child]);
  const db = openSqliteConnection(f.libraryFile, { fileMustExist: true, readonly: true });
  try { assert.deepEqual(db.prepare("SELECT name FROM sqlite_schema").all(), []); }
  finally { db.close(); }
  assert.equal(existsSync(child), false);
});

test("BSH-03 · two live journals survive another process death during recovery and cleared-marker residue preserves committed data", { timeout: 20_000 }, async t => {
  const f = fixture(t), peerJournal = f.libraryFile + "-journal";
  const marker = (await runPair(t, f, true))!;
  const remnants = [readFileSync(f.journal), readFileSync(peerJournal)];
  f.releaseOwner();
  const restarted = spawn(process.execPath, [childEntry, f.file, "2", "trusted", "replay", f.libraryFile, f.home], { stdio: ["ignore", "ignore", "inherit"] });
  const [, signal] = await once(restarted, "exit");
  assert.equal(signal, "SIGKILL");
  f.takeOwner();
  assert.equal(existsSync(f.journal), false, "the first database's native rollback had completed");
  assert.equal(existsSync(marker), true, "the second journal still refers to the marker");
  recoverSqliteRollbackJournals(f.lock, f.libraries, [peerJournal, marker]);
  assert.deepEqual([dirtyFacts(f.file).value, dirtyFacts(f.libraryFile).value], ["original", "original"]);
  assert.equal(existsSync(marker), false);
  assert.equal(existsSync(peerJournal), false);

  await runPair(t, f, false);
  // Simulate an interruption during the final journal unlink, using the real child bytes from the same two files.
  writeFileSync(f.journal, remnants[0]!);
  writeFileSync(peerJournal, remnants[1]!);
  recoverSqliteRollbackJournals(f.lock, f.libraries, [f.journal, peerJournal]);
  assert.deepEqual([dirtyFacts(f.file).value, dirtyFacts(f.libraryFile).value], ["staged", "staged"]);
  assert.equal(existsSync(f.journal), false);
  assert.equal(existsSync(peerJournal), false);
  assert.equal(existsSync(marker), false);
});

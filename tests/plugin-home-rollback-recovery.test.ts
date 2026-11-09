import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { acquireStorageOwner, openSqliteConnection } from "@molis-ai/molis-work-storage";
import { recoverSqliteRollbackJournals, type RollbackLibrary } from "../packages/storage/dist/rollback-journal.js";

const childEntry = fileURLToPath(new URL("./fixtures/plugin-home-rollback-child.mjs", import.meta.url));

function fixture(t: TestContext, version = 2, initialOwner = "trusted") {
  const home = mkdtempSync(join(realpathSync(tmpdir()), "molis-recovery-中文-"));
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
  t.after(() => { owner.release(); rmSync(home, { recursive: true, force: true }); });
  const inspect: RollbackLibrary["inspect"] = db => assert.equal(db.prepare<[], { owner: string }>("SELECT owner FROM facts WHERE id=1").get()?.owner, "trusted");
  const libraries: RollbackLibrary[] = [{ path: file, kind: "project", version: 2, inspect }, { path: libraryFile, kind: "home", version: 1, inspect }];
  return { home, file, libraryFile, journal: file + "-journal", marker: file + "-mj000000900", libraries, lock: { home, lockDirectory, owner } };
}

async function stopDuringWrite(t: TestContext, file: string, version: number, owner: string): Promise<void> {
  const child = spawn(process.execPath, [childEntry, file, String(version), owner], { stdio: ["ignore", "pipe", "pipe"] });
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

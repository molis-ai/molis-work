import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { link, mkdir, readdir, symlink } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join, relative } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createHomeSnapshot, homeStores, CATALOG_OWNER, CATALOG_SCHEMA_VERSION } from "@molis-ai/molis-work-app-local-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { backupSnapshotSqlite, copySnapshotFile, readSnapshotFile, snapshotFileDigest } from "@molis-ai/molis-work-storage";
import { changeSnapshotSource, type InjectedSnapshotChange } from "./fixtures/home-snapshot-error-change.js";
import { smallSnapshotHome, snapshotBusinessFingerprint } from "./fixtures/home-snapshot-small.js";

const staticCases = ["file-link", "sqlite-schema", "sqlite-integrity", "sqlite-integrity-function", "sqlite-foreign-key", "sqlite-foreign-schema", "sqlite-corrupt-page", "metadata-owner", "metadata-version", "metadata-missing-table", "metadata-missing-column"] as const;
const changedCases = ["file-append", "file-truncate", "file-replace", "sqlite-version", "sqlite-owner", "sqlite-schema", "sqlite-replace"] as const;
const walChanges = new Set(["sqlite-version", "sqlite-owner", "sqlite-schema"]);

async function fixture(t: TestContext, kind: string, changing = false) {
  const f = await smallSnapshotHome(t);
  if (kind.startsWith("file-")) {
    const source = await f.file("images/assets/kept.bin", Buffer.alloc(2 * 1024 * 1024, 0x41));
    if (kind === "file-link") await symlink(source, join(dirname(source), "linked.bin"));
    return { ...f, source };
  }
  const memory = kind === "sqlite-version" || kind === "sqlite-schema" && !changing;
  const store = homeStores().get(memory ? "memory" : "projects")!;
  const source = join(f.home, store.path, memory ? store.library!.file ?? "memory.db" : "catalog.db");
  await mkdir(dirname(source), { recursive: true });
  const db = new DatabaseSync(source);
  try {
    if (memory) {
      db.exec(kind === "sqlite-schema" ? "CREATE TABLE wrong_shape (id TEXT)" : store.library!.baseline.schema);
      db.exec("PRAGMA user_version=" + store.library!.baseline.version);
    } else {
      db.exec('CREATE TABLE catalog_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE snapshot_probe (id TEXT PRIMARY KEY,title TEXT CHECK(length(title)>0));');
      db.prepare("INSERT INTO catalog_meta VALUES (?,?)").run("owner", kind === "metadata-owner" ? "wrong-owner" : CATALOG_OWNER);
      db.prepare("INSERT INTO catalog_meta VALUES (?,?)").run("schema_version", kind === "metadata-version" ? String(CATALOG_SCHEMA_VERSION + 1) : String(CATALOG_SCHEMA_VERSION));
      db.prepare("INSERT INTO snapshot_probe VALUES (?,?)").run("retained", "Business content must not enter error output");
      if (kind === "sqlite-integrity") db.exec("PRAGMA ignore_check_constraints=ON; INSERT INTO snapshot_probe VALUES ('broken','')");
      if (kind === "sqlite-foreign-key") db.exec("PRAGMA foreign_keys=OFF; CREATE TABLE child (id TEXT REFERENCES snapshot_probe(id)); INSERT INTO child VALUES ('missing')");
      if (kind === "sqlite-foreign-schema") db.exec("CREATE TABLE parent (id TEXT); CREATE TABLE child (id TEXT REFERENCES parent(id))");
      if (kind === "sqlite-integrity-function") {
        db.function("fixture_check", () => 1);
        db.exec("CREATE TABLE checked (value TEXT CHECK(fixture_check())); INSERT INTO checked VALUES ('retained')");
      }
      if (kind === "metadata-missing-table") db.exec("DROP TABLE catalog_meta");
      if (kind === "metadata-missing-column") db.exec("ALTER TABLE catalog_meta RENAME COLUMN value TO wrong_column");
    }
  } finally { db.close(); }
  if (kind === "sqlite-corrupt-page") {
    const fd = fs.openSync(source, "r+");
    try { fs.writeSync(fd, Buffer.alloc(8), 0, 8, 100); } finally { fs.closeSync(fd); }
  }
  if (changing && kind !== "sqlite-replace") {
    // Keep a second real connection open so external commits stay in WAL: source-file stat checks alone cannot catch them.
    const wal = new DatabaseSync(source);
    wal.exec("PRAGMA journal_mode=WAL");
    wal.exec("BEGIN");
    wal.prepare("SELECT name FROM sqlite_master LIMIT 1").get();
    t.after(() => wal.close());
  }
  return { ...f, source };
}

async function assertNoOutput(f: Awaited<ReturnType<typeof fixture>>) {
  assert.deepEqual((await readdir(f.area)).filter(name => name === "snapshot" || name.startsWith(".molis-home-snapshot-")), []);
}

test("RAC-109-S-06: public storage file ports classify static invalid input without copying it", async t => {
  const f = await smallSnapshotHome(t);
  const source = await f.file("images/kept", "retained bytes"), alias = join(dirname(source), "hardlink");
  await link(source, alias);
  const invalid = { code: "actions.input_invalid", kind: "invalid" };
  assert.throws(() => readSnapshotFile(source, 100), invalid);
  assert.throws(() => snapshotFileDigest(source), invalid);
  await assert.rejects(copySnapshotFile(source, f.snapshot), invalid);
  const metadata = await f.file("config/onboarding.json", "large metadata");
  assert.throws(() => readSnapshotFile(metadata, 1), invalid);
  assert.equal((await readdir(f.area)).includes("snapshot"), false);
});

test("RAC-109-S-06: public snapshot rejects static file, SQL and metadata faults as invalid with zero source writes", async t => {
  for (const kind of staticCases) await t.test(kind, async t => {
    const f = await fixture(t, kind), before = await snapshotBusinessFingerprint(f.home);
    await assert.rejects(createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot }), { code: "host.home_snapshot.invalid", kind: "invalid" });
    assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
    await assertNoOutput(f);
  });
});

test("RAC-109-S-06: real changes at copy/backup boundaries are conflicts and leave only the injected source change", async t => {
  for (const kind of changedCases) await t.test(kind, async t => {
    const f = await fixture(t, kind, true), expected = await snapshotBusinessFingerprint(f.home);
    let changed = false;
    const restore = changeSnapshotSource(kind, f.source, state => {
      changed = true;
      if (walChanges.has(kind)) assert.deepEqual(state, expected[relative(f.home, f.source)], "WAL changes leave the source-file fingerprint unchanged");
      expected[relative(f.home, f.source)] = state;
    });
    try {
      await assert.rejects(createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot }), { code: "host.home_snapshot.changed", kind: "conflict" });
    } finally { restore(); }
    assert.equal(changed, true, "the production copy/backup boundary was reached");
    assert.deepEqual(await snapshotBusinessFingerprint(f.home), expected);
    await assertNoOutput(f);
  });
});

test("RAC-109-S-06: original cancellation, I/O and source schema-version refusals retain their identity", async t => {
  for (const kind of ["cancel", "cancel-during-copy", "io", "version"] as const) await t.test(kind, async t => {
    const f = await fixture(t, kind === "version" ? "sqlite-version" : "file-append");
    const abort = new AbortController();
    const reason = kind === "cancel-during-copy" ? new ActionError("actions.input_invalid", "fixture caller cancellation", { kind: "invalid" })
      : Object.assign(new Error("fixture source operation refused"), { code: "ENOSPC" });
    if (kind === "version") {
      const writer = new DatabaseSync(f.source);
      try { writer.exec("PRAGMA user_version=999"); } finally { writer.close(); }
    }
    const before = await snapshotBusinessFingerprint(f.home), write = fs.writeSync;
    if (kind === "cancel") abort.abort(reason);
    if (kind === "io") {
      t.mock.method(fs, "writeSync", () => { throw reason; });
      syncBuiltinESMExports();
    }
    if (kind === "cancel-during-copy") {
      t.mock.method(fs, "writeSync", (...args: unknown[]): number => {
        const result = Reflect.apply(write, fs, args);
        abort.abort(reason);
        return result;
      });
      syncBuiltinESMExports();
    }
    try {
      await assert.rejects(createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot, signal: abort.signal }), error => {
        if (kind === "version") assert.ok(error instanceof Error && "code" in error && error.code === "storage.schema_version_mismatch");
        else assert.equal(error, reason);
        return true;
      });
    } finally {
      fs.writeSync = write;
      syncBuiltinESMExports();
    }
    assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
    await assertNoOutput(f);
  });
});

test("RAC-109-S-06: actual SQLite destination I/O and source busy errors retain their engine code", async t => {
  const f = await fixture(t, "sqlite-owner"), before = await snapshotBusinessFingerprint(f.home);
  await assert.rejects(backupSnapshotSqlite(f.source, f.area), { code: "SQLITE_CANTOPEN" });
  const locker = new Database(f.source);
  locker.exec("BEGIN EXCLUSIVE");
  try {
    await assert.rejects(createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot }), error => {
      assert.ok(error instanceof Database.SqliteError);
      assert.equal(error.code, "SQLITE_BUSY");
      assert.equal(error instanceof ActionError, false);
      return true;
    });
  } finally { locker.exec("ROLLBACK"); locker.close(); }
  assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
  await assertNoOutput(f);
});

async function cli(t: TestContext, f: Awaited<ReturnType<typeof fixture>>, kind?: string) {
  const script = kind ? "./fixtures/home-snapshot-error-change.ts" : "../apps/desktop/launchers/cli/main.ts";
  const args = kind ? [kind, f.source, f.home, f.snapshot] : ["home", "snapshot", "--home", f.home, "--to", f.snapshot, "--json"];
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "--import", "tsx", fileURLToPath(new URL(script, import.meta.url)), ...args], {
    env: process.env, stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let stdout = "", stderr = "";
  let injected: InjectedSnapshotChange | undefined;
  child.stdout!.setEncoding("utf8").on("data", (value: string) => { stdout += value; });
  child.stderr!.setEncoding("utf8").on("data", (value: string) => { stderr += value; });
  child.on("message", value => {
    const message = value as { phase: string; state: InjectedSnapshotChange };
    assert.equal(message.phase, "source-changed");
    injected = message.state;
  });
  const closed = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await closed;
  });
  return { code: await closed, stdout, stderr, injected };
}

test("RAC-109-S-07: actual CLI JSON distinguishes invalid files/SQL/metadata from changed captures", { timeout: 120_000 }, async t => {
  for (const changing of [false, true]) for (const kind of changing ? changedCases : staticCases) await t.test(`${changing ? "changed" : "invalid"} ${kind}`, async t => {
    const f = await fixture(t, kind, changing), expected = await snapshotBusinessFingerprint(f.home);
    const result = await cli(t, f, changing ? kind : undefined);
    assert.equal(result.code, 1, result.stderr);
    assert.equal(result.stdout, "");
    const output = JSON.parse(result.stderr) as { error: { code: string; kind: string; message: string } };
    assert.equal(output.error.code, changing ? "host.home_snapshot.changed" : "host.home_snapshot.invalid");
    assert.equal(output.error.kind, changing ? "conflict" : "invalid");
    assert.equal(result.stderr.includes("Business content must not enter error output"), false);
    if (changing) {
      assert.ok(result.injected, "the real CLI reached the mutation boundary");
      if (walChanges.has(kind)) assert.deepEqual(result.injected, expected[relative(f.home, f.source)], "the CLI conflict is detected beyond source-file stat");
      expected[relative(f.home, f.source)] = result.injected;
    }
    assert.deepEqual(await snapshotBusinessFingerprint(f.home), expected);
    await assertNoOutput(f);
  });
});

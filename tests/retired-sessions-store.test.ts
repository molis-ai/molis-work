import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { report, remove } from "../scripts/retired-sessions-store.mjs";

// Sessions cleanup SC-5 (D6): the maintenance for the retired `<home>/sessions/`. It is rehearsed here in a disposable Home;
// running it on a real Home is the person's own decision.
const SECRET = "BODY-OF-A-MESSAGE-NEVER-PRINTED";
const SCRIPT = new URL("../scripts/retired-sessions-store.mjs", import.meta.url).pathname;

/** A Home the way SC-4 leaves it: a WAL library with the five Session tables, content blocks and a key, next to a store that must stay. */
function home(t: TestContext): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "retired-sessions-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sessions = join(root, "sessions");
  mkdirSync(join(sessions, "content", "blobs", "aa"), { recursive: true });
  mkdirSync(join(root, "projects"), { recursive: true });
  writeFileSync(join(root, "projects", "catalog.db"), "kept");
  const db = new DatabaseSync(join(sessions, "sessions.db"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`CREATE TABLE session_meta (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE sessions (session_id TEXT PRIMARY KEY, title TEXT);
    CREATE TABLE session_messages (request_id TEXT PRIMARY KEY, body TEXT); CREATE TABLE session_events (event_id TEXT PRIMARY KEY, body TEXT);
    CREATE TABLE session_handoffs (package_id TEXT PRIMARY KEY, body TEXT); PRAGMA user_version = 7`);
  db.prepare("INSERT INTO session_meta VALUES ('schema_version', '7')").run();
  for (const id of ["s1", "s2"]) db.prepare("INSERT INTO sessions VALUES (?, ?)").run(id, SECRET);
  db.prepare("INSERT INTO session_messages VALUES ('m1', ?)").run(SECRET);
  db.close();
  writeFileSync(join(sessions, "content", "blobs", "aa", "block-1"), "x".repeat(100));
  writeFileSync(join(sessions, "content", "blobs", "aa", "block-2"), "y".repeat(50));
  writeFileSync(join(sessions, "content", "content.key"), "key-bytes");
  return root;
}

/** Make everything in the directory look untouched for a long time, as a Home that is not running. */
function quiet(directory: string, when = new Date("2026-01-01T00:00:00Z")): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) quiet(path, when);
    utimesSync(path, when, when);
  }
}

/** Every path under a directory with its size and time: what "the Home is not written to" compares. */
function snapshot(directory: string): string[] {
  return readdirSync(directory, { recursive: true }).map(String).sort().map(path => {
    const stat = statSync(join(directory, path));
    return `${path} ${stat.isDirectory() ? "dir" : stat.size} ${stat.mtimeMs}`;
  });
}

test("RAC-256 SC-5: the report lists the retired store's files, tables and counts, writes nothing to the Home and prints no content", t => {
  const root = home(t);
  quiet(join(root, "sessions"));
  const before = snapshot(root);
  const result = report(root);
  assert.deepEqual(snapshot(root), before, "no file, size or time changed, and nothing was added (no WAL or shm copy)");
  assert.equal(result.present, true);
  assert.equal(result.library.user_version, 7);
  assert.deepEqual(result.library.tables, { session_events: 0, session_handoffs: 0, session_messages: 1, session_meta: 1, sessions: 2 });
  assert.deepEqual(result.content_blocks, { files: 2, bytes: 150 });
  assert.equal(result.content_key, true);
  assert.equal(JSON.stringify(result).includes(SECRET), false, "counts only: a message body is never printed");
  assert.equal(JSON.stringify(result).includes("key-bytes"), false, "the key is only said to exist");
  assert.equal(report(join(root, "nowhere")).present, false);
});

test("RAC-257 SC-5: removal is a dry run until --apply, needs the exact directory as confirmation, and refuses a Home that is still changing, or links", t => {
  const root = home(t), directory = join(root, "sessions");
  quiet(directory);
  quiet(directory);
  assert.equal(remove(root).removed, false);
  assert.match(String(remove(root).reason), /dry run/);
  assert.equal(remove(root, { apply: true }).removed, false, "no confirmation");
  assert.match(String(remove(root, { apply: true, confirm: root }).reason), /must be exactly/);
  assert.equal(existsSync(directory), true, "every refusal leaves the directory");
  const fresh = join(directory, "content", "blobs", "aa", "block-3");
  writeFileSync(fresh, "new");
  assert.match(String(remove(root, { apply: true, confirm: directory }).reason), /stop Molis Work first/);
  rmSync(fresh);
  quiet(directory);
  symlinkSync(join(root, "projects"), join(directory, "content", "link"));
  assert.match(String(remove(root, { apply: true, confirm: directory }).reason), /links inside/);
  assert.equal(readFileSync(join(root, "projects", "catalog.db"), "utf8"), "kept");
  rmSync(join(directory, "content", "link"));
  quiet(directory);
  const done = remove(root, { apply: true, confirm: directory });
  assert.equal(done.removed, true);
  assert.equal(existsSync(directory), false);
  assert.equal(readFileSync(join(root, "projects", "catalog.db"), "utf8"), "kept", "only the sessions directory goes");
  assert.equal(remove(root, { apply: true, confirm: directory }).present, false, "running it again finds nothing");
});

test("RAC-257 SC-5: the command line needs --home, never guesses a Home, and a refused --apply exits 1", t => {
  const root = home(t);
  const run = (...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  assert.equal(run("report").status, 2);
  assert.equal(run("remove", "--apply").status, 2);
  assert.equal(run("report", "--home", root).status, 0);
  assert.equal(run("remove", "--home", root).status, 0, "a dry run is not a failure");
  assert.equal(run("remove", "--home", root, "--apply", "--confirm", "wrong").status, 1);
  assert.equal(existsSync(join(root, "sessions")), true);
});

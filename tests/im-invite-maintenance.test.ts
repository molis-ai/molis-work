import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { backup, DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
import { openServerDatabase as openServer } from "@molis-ai/molis-work-server";
import { inviteFixture } from "./fixtures/im-invites.js";

const tool = fileURLToPath(new URL("./fixtures/im-invite-maintenance.mjs", import.meta.url));
const beforeSql = readFileSync(new URL("./fixtures/server-database-schema-v1.sql", import.meta.url), "utf8");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const files = (directory: string) => Object.fromEntries(readdirSync(directory).sort().map(name => [name, readFileSync(join(directory, name))]));

function source(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "molis-invite-v1-")), home = join(root, "home"), directory = join(home, "server"), file = join(directory, "server.sqlite");
  mkdirSync(directory, { recursive: true }); t.after(() => rmSync(root, { recursive: true, force: true }));
  const active = randomBytes(24).toString("base64url"), prior = randomBytes(24).toString("base64url"), deleted = randomBytes(24).toString("base64url");
  const db = new DatabaseSync(file); db.exec(beforeSql);
  db.exec(`INSERT INTO mw_server_identity VALUES (1,'maintenance');
    INSERT INTO mw_members VALUES ('alice','Original owner'),('observer','Existing member');
    INSERT INTO mw_sessions VALUES ('session','alice','session-hash','Original device',4102444800000,0);
    INSERT INTO mw_projects VALUES ('project','Project','alice','{"scope":"kept"}');
    INSERT INTO mw_access VALUES ('project','alice','owner');
    INSERT INTO mw_codes VALUES ('code-hash','pair','alice',NULL,NULL,'session',4102444800000,0);
    INSERT INTO mw_commands VALUES ('project','alice','command','{"input":"kept"}','{"output":"kept"}','succeeded',NULL);`);
  const room = db.prepare("INSERT INTO im_rooms VALUES (?,?,?,?,?,?,?)");
  room.run("room", "Original room", "alice", active, "before", "before", null);
  room.run("project-room", "Project", "alice", "unshareable-project-nonce", "before", "before", "project");
  db.exec(`INSERT INTO im_members VALUES ('room','alice','before'),('room','observer','before');
    INSERT INTO im_messages(id,room_id,thread_id,author_id,body,shared_message_id,created_at,quote_id) VALUES ('m1','room',NULL,'alice','Keep group history',NULL,'before',NULL);
    INSERT INTO im_threads VALUES ('thread','room','Keep Thread','m1','alice','before','before');
    INSERT INTO im_messages(id,room_id,thread_id,author_id,body,shared_message_id,created_at,quote_id) VALUES ('m2','room','thread','observer','Keep reply',NULL,'before','m1');
    INSERT INTO im_messages(id,room_id,thread_id,author_id,body,shared_message_id,created_at,quote_id) VALUES ('m3','room',NULL,'alice','Keep backlink','m2','before',NULL);
    INSERT INTO im_thread_context VALUES ('thread','m1',0);
    INSERT INTO im_read_positions VALUES ('alice','room','',1);
    INSERT INTO mw_events VALUES (1,'room','room','message','m1',NULL);`);
  const receipt = db.prepare("INSERT INTO im_receipts VALUES ('session',?,?,?)");
  receipt.run("old-invite", "invite-fingerprint", JSON.stringify({ room_id: "room", token: prior, path: "/im?invite=" + prior, url: "https://example.test/im?invite=" + prior }));
  receipt.run("old-message", "message-fingerprint", JSON.stringify({ message: { id: "m3", body: "Kept receipt" } }));
  receipt.run("deleted-invite", "deleted-fingerprint", JSON.stringify({ room_id: "room", token: deleted, path: "/im?invite=" + deleted, url: "https://example.test/im?invite=" + deleted }));
  db.exec("PRAGMA secure_delete=OFF; DELETE FROM im_receipts WHERE client_id='deleted-invite';"); db.close();
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", `import { DatabaseSync } from 'node:sqlite'; const db=new DatabaseSync(${JSON.stringify(file)});
    db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; INSERT INTO im_messages(id,room_id,thread_id,author_id,body,created_at) VALUES ('wal-message','room',NULL,'alice','Committed before crash','after');"); process.kill(process.pid,'SIGKILL');`], { encoding: "utf8" });
  assert.equal(run.signal, "SIGKILL"); assert.ok(existsSync(file + "-wal"));
  return { root, home, directory, file, active, prior, deleted };
}

function run(mode: string, home: string, backupDirectory?: string) {
  return spawnSync(process.execPath, [tool, mode, "--home", home, "--json", ...(backupDirectory ? ["--backup", backupDirectory] : [])], { encoding: "utf8" });
}

function logical(directory: string) {
  const work = mkdtempSync(join(tmpdir(), "molis-invite-read-"));
  try {
    for (const name of readdirSync(directory).filter(name => name === "server.sqlite" || name === "server.sqlite-wal")) copyFileSync(join(directory, name), join(work, name));
    const db = new DatabaseSync(join(work, "server.sqlite"));
    try {
      return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row => [String(row.name), db.prepare('SELECT * FROM "' + String(row.name) + '" ORDER BY rowid').all()]));
    } finally { db.close(); }
  } finally { rmSync(work, { recursive: true, force: true }); }
}

test("RAC-103: offline list is read-only; v1 maintenance preserves all facts and issued links, including committed WAL", async t => {
  const f = source(t), original = files(f.directory), expected = logical(f.directory), backupDirectory = join(f.root, "originals");
  const listed = run("list", f.home); assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout), { version: 1, rooms: 2, invitation_receipts: 1, changed: false, needs_apply: true });
  assert.deepEqual(files(f.directory), original);
  for (const value of [f.active, f.prior, f.deleted]) assert.equal(listed.stdout.includes(value) || listed.stderr.includes(value), false);
  assert.throws(() => openServer(f.directory), SqliteSchemaVersionError);
  // The refused opener may checkpoint WAL, so the maintenance backs up the actual files at its own start.
  const filesAtApply = files(f.directory);
  const applied = run("apply", f.home, backupDirectory); assert.equal(applied.status, 0, applied.stderr);
  assert.deepEqual(files(backupDirectory), filesAtApply);
  const after = logical(f.directory);
  const rooms = expected.im_rooms!;
  for (const room of rooms) { const token = String(room.invite_token); delete room.invite_token; room.invite_token_hash = room.project_id === null ? hash(token) : null; }
  for (const receipt of expected.im_receipts!) if (receipt.client_id === "old-invite") receipt.result_json = JSON.stringify({ room_id: "room", token_hash: hash(f.prior) });
  assert.deepEqual(after, expected);
  const bytes = readFileSync(f.file); for (const value of [f.active, f.prior, f.deleted, "unshareable-project-nonce"]) assert.equal(bytes.includes(Buffer.from(value)), false);
  const db = new DatabaseSync(f.file, { readOnly: true }), copy = join(f.root, "snapshot.sqlite");
  try { await backup(db, copy); } finally { db.close(); }
  for (const value of [f.active, f.prior, f.deleted]) assert.equal(readFileSync(copy).includes(Buffer.from(value)), false);
  const stable = files(f.directory), again = run("apply", f.home, backupDirectory);
  assert.equal(again.status, 0, again.stderr); assert.equal(JSON.parse(again.stdout).changed, false); assert.deepEqual(files(f.directory), stable);
  await t.test("the maintained library serves the original external link through the public HTTP transport", async child => {
    const live = await inviteFixture(child, { home: f.home }), newcomer = await live.person("New member");
    assert.equal((await live.post(newcomer.cookie, "/join", { token: f.active })).status, 200, "the original, externally shared link still works");
    assert.equal((await live.post(newcomer.cookie, "/join", { token: f.prior })).status, 404, "an old rotated token stays invalid");
  });
});

test("RAC-103: wrong versions, malformed receipts and an unsafe backup leave the original files unchanged", t => {
  for (const fault of ["version", "json", "backup"]) {
    const f = source(t);
    if (fault !== "backup") {
      const db = new DatabaseSync(f.file);
      try { db.exec(fault === "version" ? "PRAGMA user_version=3" : "UPDATE im_receipts SET result_json='not-json' WHERE client_id='old-invite'"); } finally { db.close(); }
    }
    const original = files(f.directory), outcome = run("apply", f.home, fault === "backup" ? join(f.home, "backup") : join(f.root, "originals"));
    assert.equal(outcome.status, 1); assert.deepEqual(files(f.directory), original);
    assert.match(outcome.stderr, fault === "version" ? /exactly server database version/ : fault === "json" ? /receipt is not valid JSON/ : /outside the Home/);
    assert.equal(existsSync(join(f.home, "backup")), false);
  }
});

test("RAC-103: a real publication I/O failure rolls back original bytes; an interrupted publication blocks runtime startup", t => {
  for (const crash of [false, true]) {
    const f = source(t), original = files(f.directory), backupDirectory = join(f.root, "originals");
    const script = `import fs from 'node:fs'; const {maintainInvitations}=await import(${JSON.stringify(pathToFileURL(tool).href)}); const rename=fs.renameSync;
      fs.renameSync=(from,to)=>{if(to===${JSON.stringify(realpathSync(f.file))}){${crash ? "process.kill(process.pid,'SIGKILL');" : "throw new Error('publication write denied');"}}return rename(from,to);};
      maintainInvitations('apply',{home:${JSON.stringify(f.home)},backupDirectory:${JSON.stringify(backupDirectory)}});`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
    assert.ok(result.status !== 0);
    assert.deepEqual(files(backupDirectory), original);
    const marker = join(f.directory, ".invite-maintenance.json");
    if (!crash) { assert.match(result.stderr, /publication write denied/); assert.deepEqual(files(f.directory), original); continue; }
    assert.equal(result.signal, "SIGKILL"); assert.ok(existsSync(marker));
    assert.throws(() => openServer(f.directory), { code: "im.invite_maintenance.pending" });
    assert.match(run("apply", f.home, backupDirectory).stderr, /prior maintenance is incomplete/);
    const record = JSON.parse(readFileSync(marker, "utf8")) as { backup: string; work: string };
    assert.equal(record.backup, realpathSync(backupDirectory));
    // Manual recovery from the marker, in the stopped-Host window; originals are never guessed or overwritten in place.
    for (const name of readdirSync(backupDirectory)) copyFileSync(join(backupDirectory, name), join(f.directory, name));
    rmSync(record.work, { recursive: true, force: true }); unlinkSync(marker);
    assert.deepEqual(files(f.directory), original);
    assert.equal(run("apply", f.home, join(f.root, "recovered-originals")).status, 0);
    const opened = openServer(f.directory); opened.close();
  }
});

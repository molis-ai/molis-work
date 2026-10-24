#!/usr/bin/env node
// W5-16 B1 / RAC-103. One-time offline maintenance, never called by a runtime reader.
// list --home <offline copy> [--json]
// apply --home <offline copy> --backup <new directory outside Home> [--json]
// Actual Home use additionally requires --maintenance-window and the person's approved, stopped-Host window.
// Originals are retained in the explicit private backup; after maintenance, delete this tool and its rehearsal together.
import fs from "node:fs";
import path from "node:path";
import { homedir, tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import { SERVER_DATABASE_BASELINE } from "@molis-ai/molis-work-server";
import { describeSqliteSchema, listSqliteObjects } from "@molis-ai/molis-work-storage";

const digest = token => createHash("sha256").update(token).digest("hex");
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const within = (root, entry) => { const relative = path.relative(root, entry); return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative)); };
const present = file => { try { return fs.lstatSync(file); } catch (error) { if (error.code === "ENOENT") return null; throw error; } };

function checkedHome(given, mode, maintenanceWindow) {
  const home = fs.realpathSync(path.resolve(given));
  if (!fs.lstatSync(path.resolve(given)).isDirectory() || !fs.lstatSync(path.join(home, "server")).isDirectory()) throw new Error("Home and server must be real directories");
  const actual = [path.join(homedir(), ".molis-work"), process.env.MOLIS_WORK_HOME].filter(Boolean)
    .map(each => present(each) ? fs.realpathSync(each) : path.resolve(each));
  if (actual.includes(home) && (mode === "list" || !maintenanceWindow)) throw new Error("Use an offline copy; the actual Home requires its separately approved maintenance window");
  return home;
}

function sourceFiles(home) {
  const files = new Map();
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const name = "server.sqlite" + suffix, file = path.join(home, "server", name), stat = present(file);
    if (!stat) { if (!suffix) throw new Error("The server database does not exist"); continue; }
    if (!stat.isFile() || stat.nlink !== 1) throw new Error("Database files must be regular files with one link");
    files.set(name, { bytes: fs.readFileSync(file), mode: stat.mode & 0o777 });
  }
  return files;
}

function assertUnchanged(home, before) {
  const now = sourceFiles(home);
  if (now.size !== before.size || [...before].some(([name, value]) => !now.get(name)?.bytes.equals(value.bytes))) {
    throw new Error("The source changed; stop all Home writers and take a fresh offline copy");
  }
}

function expectedSchema(sql) {
  const db = new DatabaseSync(":memory:");
  try { db.exec(sql); return { shape: describeSqliteSchema(db), objects: listSqliteObjects(db) }; }
  finally { db.close(); }
}

function assertSchema(db, version) {
  const sql = version === 1 ? fs.readFileSync(new URL("./server-database-schema-v1.sql", import.meta.url), "utf8") : SERVER_DATABASE_BASELINE.schema;
  const expected = expectedSchema(sql);
  if (!isDeepStrictEqual(describeSqliteSchema(db), expected.shape) || !isDeepStrictEqual(listSqliteObjects(db), expected.objects)) throw new Error("The database structure is not the complete expected baseline");
  if (db.prepare("PRAGMA integrity_check").all().some(row => row.integrity_check !== "ok") || db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("The database integrity check failed");
}

function receipt(value, secrets, current) {
  let result;
  try { result = JSON.parse(value); } catch { throw new Error("A receipt is not valid JSON; no source data was changed"); }
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("A receipt is not an object");
  if (!("room_id" in result) || !["token", "path", "url"].some(key => key in result)) return { value, changed: false };
  if (current) throw new Error("A current-version receipt still contains an original invitation");
  if (Object.keys(result).sort().join(",") !== "path,room_id,token,url" || ["room_id", "token", "path", "url"].some(key => typeof result[key] !== "string" || !result[key])) throw new Error("An invitation receipt has an unexpected shape");
  let url;
  try { url = new URL(result.url); } catch { throw new Error("An invitation receipt has an invalid URL"); }
  if (result.path !== "/im?invite=" + encodeURIComponent(result.token) || url.pathname + url.search !== result.path) throw new Error("An invitation receipt does not match its original token");
  secrets.add(result.token);
  return { value: JSON.stringify({ room_id: result.room_id, token_hash: digest(result.token) }), changed: true };
}

function inspect(db) {
  const version = Number(db.prepare("PRAGMA user_version").get().user_version);
  if (version !== 1 && version !== 2) throw new Error("Expected exactly server database version 1 or 2");
  assertSchema(db, version);
  const secrets = new Set(), replacements = new Map();
  let invitations = 0;
  if (version === 1) for (const row of db.prepare("SELECT invite_token FROM im_rooms").all()) secrets.add(row.invite_token);
  for (const row of db.prepare("SELECT session_id,client_id,result_json FROM im_receipts").all()) {
    const next = receipt(row.result_json, secrets, version === 2);
    if (next.changed) { invitations++; replacements.set(JSON.stringify([row.session_id, row.client_id]), next.value); }
  }
  return { version, secrets, replacements, report: { version, rooms: Number(db.prepare("SELECT COUNT(*) AS n FROM im_rooms").get().n), invitation_receipts: invitations } };
}

function buildCurrent(source, file, info) {
  const target = new DatabaseSync(file);
  fs.chmodSync(file, 0o600);
  try {
    target.exec(SERVER_DATABASE_BASELINE.schema + "\nBEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;");
    for (const table of source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
      const columns = source.prepare("PRAGMA table_info(" + quote(table.name) + ")").all().map(column => column.name);
      const names = columns.map(name => name === "invite_token" && table.name === "im_rooms" ? "invite_token_hash" : name);
      const insert = target.prepare("INSERT INTO " + quote(table.name) + " (" + names.map(quote).join(",") + ") VALUES (" + names.map(() => "?").join(",") + ")");
      const query = source.prepare("SELECT * FROM " + quote(table.name)); query.setReadBigInts(true);
      for (const row of query.iterate()) {
        const values = columns.map(name => {
          if (table.name === "im_rooms" && name === "invite_token") return row.project_id === null ? digest(row[name]) : null;
          if (table.name === "im_receipts" && name === "result_json") return info.replacements.get(JSON.stringify([row.session_id, row.client_id])) ?? row[name];
          return row[name];
        });
        insert.run(...values);
      }
    }
    target.exec("DELETE FROM sqlite_sequence");
    for (const row of source.prepare("SELECT name,seq FROM sqlite_sequence").all()) target.prepare("INSERT INTO sqlite_sequence VALUES (?,?)").run(row.name, row.seq);
    target.exec("PRAGMA user_version = 2; COMMIT;");
    assertSchema(target, 2);
  } finally { target.close(); }
  const bytes = fs.readFileSync(file);
  if ([...info.secrets].some(secret => bytes.includes(Buffer.from(secret)))) throw new Error("An original invitation remains in other content; source unchanged, a separate maintenance decision is required");
}

function publish(home, file, original, backupDirectory) {
  if (!backupDirectory) throw new Error("apply requires --backup outside the Home");
  const given = path.resolve(backupDirectory), backup = path.join(fs.realpathSync(path.dirname(given)), path.basename(given));
  if (within(home, backup) || within(backup, home)) throw new Error("The backup must be a new real directory outside the Home");
  assertUnchanged(home, original);
  fs.mkdirSync(backup, { mode: 0o700 });
  const marker = path.join(home, "server", ".invite-maintenance.json");
  // A crash after the first sidecar change must not make startup create an empty business library.
  for (const [name, value] of original) { fs.writeFileSync(path.join(backup, name), value.bytes, { mode: value.mode, flag: "wx" }); sync(path.join(backup, name)); }
  sync(backup);
  fs.writeFileSync(marker, JSON.stringify({ version: 1, backup, work: path.dirname(file) }) + "\n", { mode: 0o600, flag: "wx" });
  sync(marker); sync(path.join(home, "server"));
  try {
    for (const name of original.keys()) if (name !== "server.sqlite") fs.unlinkSync(path.join(home, "server", name));
    fs.renameSync(file, path.join(home, "server", "server.sqlite"));
    sync(path.join(home, "server"));
    fs.unlinkSync(marker); sync(path.join(home, "server"));
    return backup;
  } catch (error) {
    const failures = [error];
    for (const [name, value] of original) try { fs.writeFileSync(path.join(home, "server", name), value.bytes, { mode: value.mode }); fs.chmodSync(path.join(home, "server", name), value.mode); sync(path.join(home, "server", name)); } catch (failure) { failures.push(failure); }
    if (failures.length === 1) { fs.unlinkSync(marker); sync(path.join(home, "server")); }
    if (failures.length > 1) throw new AggregateError(failures, "Publication rollback is incomplete; stop the Host and recover the originals from " + backup);
    throw error;
  }
}

function sync(file) {
  const descriptor = fs.openSync(file, "r");
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

export function maintainInvitations(mode, options) {
  if (!["list", "apply"].includes(mode) || typeof options.home !== "string") throw new Error("Expected list|apply and an explicit Home");
  const home = checkedHome(options.home, mode, options.maintenanceWindow);
  if (present(path.join(home, "server", ".invite-maintenance.json"))) throw new Error("A prior maintenance is incomplete; keep the Host stopped and recover all originals from its recorded backup before retrying");
  const original = sourceFiles(home);
  const work = fs.mkdtempSync(mode === "list" ? path.join(tmpdir(), "molis-invite-maintenance-") : path.join(home, "server", ".invite-maintenance-work-"));
  fs.chmodSync(work, 0o700);
  try {
    for (const [name, value] of original) if (name !== "server.sqlite-shm") fs.writeFileSync(path.join(work, name), value.bytes, { mode: 0o600, flag: "wx" });
    const source = new DatabaseSync(path.join(work, "server.sqlite"));
    let info;
    try {
      info = inspect(source);
      if (mode === "list" || info.version === 2) return { ...info.report, changed: false, needs_apply: info.version === 1 };
      buildCurrent(source, path.join(work, "current.sqlite"), info);
    } finally { source.close(); }
    const backup = publish(home, path.join(work, "current.sqlite"), original, options.backupDirectory);
    return { ...info.report, version: 2, changed: true, needs_apply: false, backup };
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}

function main(args) {
  const [mode, ...rest] = args, value = flag => { const index = rest.indexOf(flag); return index < 0 ? undefined : rest[index + 1]; };
  try {
    const report = maintainInvitations(mode, { home: value("--home"), backupDirectory: value("--backup"), maintenanceWindow: rest.includes("--maintenance-window") });
    process.stdout.write(JSON.stringify(report, null, rest.includes("--json") ? 2 : 0) + "\n");
  } catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2));

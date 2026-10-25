import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { projectDeletedHooksFor, purgeAssistantProject, AssistantStore, ASSISTANT_STORE_BASELINE, ASSISTANT_STORE_NAME } from "@molis-ai/molis-work-app-local-host";
import { clearInExistingHomeSqlite, createFileSecretStore, homeSqlitePath, homeSqlitePartitionDirectory, openBaselineHomeSqlite, openExistingBaselineSqlite,
  peekSealedEntry, runWithMolisWorkHome, type SqliteBaseline } from "@molis-ai/molis-work-storage";
import { openPagesStore, PAGES_DATABASE } from "@molis-ai/molis-work-plugin-pages";
import { IMAGES_DATABASE } from "@molis-ai/molis-work-plugin-images";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";

const denied = new Error("test authority revoked");
function homeFor(t: TestContext) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "molis-file-owner-control-")));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}
const current = { assertCurrent() {} };
const baseline: SqliteBaseline = { version: 1, schema: "CREATE TABLE rows (id TEXT PRIMARY KEY, project TEXT NOT NULL)" };
function seedRows(home: string) {
  const db = openBaselineHomeSqlite(home, "probe", baseline);
  db.prepare("INSERT INTO rows VALUES (?, ?)").run("gone", "gone");
  db.prepare("INSERT INTO rows VALUES (?, ?)").run("kept", "kept");
  db.close();
}
function heldRows(home: string) {
  const db = openExistingBaselineSqlite(homeSqlitePath(home, "probe"), baseline);
  try { return db.prepare("SELECT id FROM rows ORDER BY id").all().map(row => row.id); } finally { db.close(); }
}

test("existing-only maintenance refuses absent, empty and unknown schema without initialization or file changes", t => {
  const home = homeFor(t), absent = join(home, "missing", "missing.db");
  assert.throws(() => openExistingBaselineSqlite(absent, baseline));
  assert.equal(existsSync(join(home, "missing")), false);
  for (const kind of ["empty", "future", "table", "trigger", "view"]) {
    const filename = join(home, `${kind}.db`), db = new DatabaseSync(filename);
    if (kind !== "empty") { db.exec(baseline.schema); db.exec(`PRAGMA user_version=${kind === "future" ? 2 : 1}`); }
    if (kind === "table") db.exec("CREATE TABLE unknown (id TEXT)");
    if (kind === "trigger") db.exec("CREATE TRIGGER unknown AFTER DELETE ON rows BEGIN SELECT 1; END");
    if (kind === "view") db.exec("CREATE VIEW unknown AS SELECT * FROM rows");
    db.close();
    const bytes = readFileSync(filename), files = readdirSync(home).sort();
    assert.throws(() => openExistingBaselineSqlite(filename, baseline), kind);
    assert.deepEqual(readFileSync(filename), bytes, kind);
    assert.deepEqual(readdirSync(home).sort(), files, kind);
  }
  const normal = openBaselineHomeSqlite(home, "ordinary", baseline);
  assert.equal(normal.prepare("PRAGMA user_version").get()?.user_version, 1); normal.close();
});

test("maintenance checks before open and BEGIN, and rolls back when authority is lost before COMMIT", t => {
  const home = homeFor(t); seedRows(home);
  const filename = homeSqlitePath(home, "probe"), before = readFileSync(filename);
  assert.throws(() => clearInExistingHomeSqlite(home, "probe", baseline, () => assert.fail("callback must not run"), { assertCurrent() { throw denied; } }), error => error === denied);
  assert.deepEqual(readFileSync(filename), before);
  let afterOpen = false, began = false;
  const exec = DatabaseSync.prototype.exec;
  const interception = t.mock.method(DatabaseSync.prototype, "exec", function(this: DatabaseSync, sql: string) {
    if (sql.includes("busy_timeout")) afterOpen = true;
    if (sql === "BEGIN IMMEDIATE") began = true;
    return exec.call(this, sql);
  });
  assert.throws(() => clearInExistingHomeSqlite(home, "probe", baseline, () => assert.fail("callback must not run"), { assertCurrent() { if (afterOpen) throw denied; } }), error => error === denied);
  assert.equal(began, false); interception.mock.restore();
  let revoked = false;
  assert.throws(() => clearInExistingHomeSqlite(home, "probe", baseline, db => {
    db.prepare("DELETE FROM rows WHERE project = ?").run("gone"); revoked = true;
  }, { assertCurrent() { if (revoked) throw denied; } }), error => error === denied);
  assert.deepEqual(heldRows(home), ["gone", "kept"]);
  clearInExistingHomeSqlite(home, "probe", baseline, db => db.prepare("DELETE FROM rows WHERE project = ?").run("gone"), current);
  assert.deepEqual(heldRows(home), ["kept"]);
});

test("declared SQL owner checks between real deletes and rolls back the first delete", async t => {
  const home = homeFor(t), pages = openPagesStore(home);
  pages.create({ project_id: "gone", title: "gone", folder_id: pages.createFolder({ project_id: "gone", title: "folder" }).id }); pages.close();
  let revoked = false, deletes = 0;
  const prepare = DatabaseSync.prototype.prepare;
  const interception = t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
    const statement = prepare.call(this, sql);
    if (sql.startsWith("DELETE FROM")) {
      const run = statement.run.bind(statement);
      t.mock.method(statement, "run", (...args: Parameters<typeof statement.run>) => { const result = run(...args); deletes++; revoked = true; return result; });
    }
    return statement;
  });
  await assert.rejects(projectDeletedHooksFor(home).clear("pages", "gone", undefined, { assertCurrent() { if (revoked) throw denied; } }), error => error === denied);
  interception.mock.restore(); assert.equal(deletes, 1);
  const db = openExistingBaselineSqlite(homeSqlitePath(home, "pages"), PAGES_DATABASE);
  assert.equal(db.prepare("SELECT count(*) n FROM pages WHERE project_id='gone'").get()?.n, 1);
  assert.equal(db.prepare("SELECT count(*) n FROM folders WHERE project_id='gone'").get()?.n, 1); db.close();
  await projectDeletedHooksFor(home).clear("pages", "gone", undefined, current);
  const after = openExistingBaselineSqlite(homeSqlitePath(home, "pages"), PAGES_DATABASE);
  assert.equal(after.prepare("SELECT count(*) n FROM pages").get()?.n, 0); after.close();
});

test("file owners do not create missing libraries, and cold declarations reject zero-version files", async t => {
  const home = homeFor(t), hooks = projectDeletedHooksFor(home);
  const owners = ["pages", "form", "dataset", "ppt", "workflows", "todo", "functions", "lingguang", "images", "characters", "assistant", "knowledge", "plugin-originals"];
  for (const owner of owners) await hooks.clear(owner, "gone", undefined, current);
  assert.deepEqual(readdirSync(home), []);
  for (const owner of owners) {
    const directory = join(home, owner);
    mkdirSync(directory, { recursive: true });
    const filename = join(directory, owner === "characters" ? "characters.sqlite" : `${owner}.db`);
    new DatabaseSync(filename).close(); const before = readFileSync(filename);
    await assert.rejects(hooks.clear(owner, "gone", undefined, current), { code: "storage.schema_version_mismatch" }, owner);
    assert.deepEqual(readFileSync(filename), before, owner);
  }
});

test("Assistant rechecks after live stop and preserves works and relations on refusal", async t => {
  const home = homeFor(t), db = openBaselineHomeSqlite(home, ASSISTANT_STORE_NAME, ASSISTANT_STORE_BASELINE), store = new AssistantStore(db);
  const work = store.create({ actor_id: "person", title: "work", scope: { kind: "project", project_id: "gone" }, origin: null,
    project_ref: { project_id: "gone", storage_key: "/test/gone/db" } });
  store.relations.link({ work_id: work.work_id, project_id: "gone" }, "origin", { kind: "pages.doc", id: "doc", revision: "1" }, "from page");
  let revoked = false, stops = 0, drops = 0;
  await assert.rejects(purgeAssistantProject(home, "gone", { async stop() { stops++; await Promise.resolve(); revoked = true; }, async dropFollowUp() { drops++; } },
    { assertCurrent() { if (revoked) throw denied; } }), error => error === denied);
  assert.equal(stops, 1); assert.equal(drops, 0);
  assert.equal(db.prepare("SELECT count(*) n FROM assistant_works").get()?.n, 1);
  assert.equal(store.relations.forWork({ work_id: work.work_id, project_id: "gone" }).length, 1);
  assert.equal(await purgeAssistantProject(home, "gone", undefined, current), 1);
  assert.equal(db.prepare("SELECT count(*) n FROM assistant_works").get()?.n, 0); db.close();
});

test("partition owner rechecks after awaiting declared purge before removing its directory", async t => {
  const home = homeFor(t), catalog = BUILTIN_PLUGIN_CATALOG as PluginRegistration[], template = catalog.find(entry => entry.project_plugin_id === "pages")!;
  const directory = homeSqlitePartitionDirectory(home, "control-probe", "gone"); mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, "kept"), "kept");
  let revoked = false, received: unknown;
  const control = { assertCurrent() { if (revoked) throw denied; } };
  catalog.push({ ...template, project_plugin_id: "control-probe", runtime: { scope: "home" },
    manifest: { ...template.manifest, databases: { home: { store_name: "control-probe", partition: "project" } } },
    project_data: { label: "probe", async purge(_home, _project, authority) { received = authority; await Promise.resolve(); revoked = true; } } } as PluginRegistration);
  try {
    await assert.rejects(projectDeletedHooksFor(home).clear("control-probe", "gone", undefined, control), error => error === denied);
    assert.equal(received, control); assert.equal(existsSync(join(directory, "kept")), true);
  } finally { catalog.pop(); }
});

test("Plugin Builder stops after directory removal before touching its sealed secrets", async t => {
  const home = homeFor(t), directory = join(home, "plugin-builder", "gone"), secret = "plugin-builder-secret:gone:plugin:key";
  mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, "build"), "build");
  runWithMolisWorkHome(home, () => createFileSecretStore().put(secret, "fixture-secret"));
  await assert.rejects(projectDeletedHooksFor(home).clear("plugin-builder", "gone", undefined, { assertCurrent() { if (!existsSync(directory)) throw denied; } }), error => error === denied);
  assert.equal(existsSync(directory), false);
  runWithMolisWorkHome(home, () => assert.notEqual(peekSealedEntry(secret), null));
});

for (const failure of ["revoked", "io"] as const) test(`Images retains the original file list after ${failure} and retries only the selected project`, async t => {
  const home = homeFor(t), directory = join(home, "images", "assets"); mkdirSync(directory, { recursive: true });
  const first = join(directory, "aaaa-0001.png"), second = join(directory, "aaaa-0002.png"), kept = join(directory, "bbbb-0001.png"), unselected = join(directory, "cccc-0001.png");
  for (const filename of [first, second, kept, unselected]) writeFileSync(filename, filename);
  const files = [{ filename: "aaaa-0001.png" }, { filename: "aaaa-0002.png" }];
  const db = openBaselineHomeSqlite(home, "images", IMAGES_DATABASE);
  const insert = db.prepare(`INSERT INTO jobs (id,project_id,request_id,input_hash,connection_id,connection_name,api_format,model,prompt,size,aspect_ratio,status,images_json,error,created_at,finished_at,runner_id)
    VALUES (?,?,'request','hash','c','c','openai-images','m','prompt','','','succeeded',?,'','now','now',NULL)`);
  insert.run("gone-job", "gone", JSON.stringify(files)); insert.run("kept-job", "kept", JSON.stringify([{ filename: "bbbb-0001.png" }])); db.close();
  const ioError = Object.assign(new Error("injected removal failure"), { code: "EIO" }), originalRm = fs.rmSync;
  const interception = failure === "io" ? t.mock.method(fs, "rmSync", (...args: Parameters<typeof fs.rmSync>) => {
    if (args[0] === second) throw ioError;
    return originalRm(...args);
  }) : undefined;
  syncBuiltinESMExports();
  try {
    await assert.rejects(projectDeletedHooksFor(home).clear("images", "gone", undefined, failure === "revoked" ? { assertCurrent() {
      if (!existsSync(first)) throw denied;
    } } : undefined), error => error === (failure === "revoked" ? denied : ioError));
  } finally { interception?.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(existsSync(first), false); assert.equal(existsSync(second), true);
  const retained = openExistingBaselineSqlite(homeSqlitePath(home, "images"), IMAGES_DATABASE);
  assert.equal(retained.prepare("SELECT count(*) n FROM jobs WHERE project_id='gone'").get()?.n, 1);
  assert.deepEqual(JSON.parse(String(retained.prepare("SELECT images_json FROM jobs WHERE project_id='gone'").get()?.images_json)), files);
  retained.close();
  await projectDeletedHooksFor(home).clear("images", "gone", undefined, current);
  assert.equal(existsSync(first), false); assert.equal(existsSync(second), false);
  assert.equal(readFileSync(kept, "utf8"), kept); assert.equal(readFileSync(unselected, "utf8"), unselected);
  const after = openExistingBaselineSqlite(homeSqlitePath(home, "images"), IMAGES_DATABASE);
  assert.equal(after.prepare("SELECT count(*) n FROM jobs WHERE project_id='gone'").get()?.n, 0);
  assert.equal(after.prepare("SELECT count(*) n FROM jobs WHERE project_id='kept'").get()?.n, 1); after.close();
});

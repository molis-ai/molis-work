import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./fixtures/home-window-readonly.py", import.meta.url));
const run = (...args: string[]) => {
  const result = spawnSync("python3", [script, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout);
};
function fixture(t: test.TestContext) {
  const root = mkdtempSync(join(tmpdir(), "home-readonly-")), home = join(root, "source"), copy = join(root, "copy");
  mkdirSync(join(home, "projects", "p"), { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true })); return { root, home, copy };
}
test("RAC-2327 immutable VACUUM copies leave source bytes alone; catalog absolute paths never route inspection outside the copy", t => {
  const f = fixture(t), original = join(f.home, "projects", "catalog.db"), project = join(f.home, "projects", "p", "molis-work.db");
  const outside = join(f.root, "outside.db"), trap = new DatabaseSync(outside); trap.exec("PRAGMA user_version=99"); trap.close();
  const catalog = new DatabaseSync(original);
  catalog.exec("CREATE TABLE catalog_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO catalog_meta VALUES ('schema_version','22'); CREATE TABLE projects(project_id TEXT PRIMARY KEY,database_path TEXT NOT NULL); CREATE TABLE workspaces(workspace_id TEXT PRIMARY KEY); CREATE TABLE workspace_project_memberships(workspace_id TEXT,project_id TEXT); INSERT INTO workspaces VALUES('empty'),('kept'); INSERT INTO workspace_project_memberships VALUES('kept','p')");
  catalog.prepare("INSERT INTO projects VALUES ('p',?)").run(outside); catalog.close();
  const db = new DatabaseSync(project); db.exec("PRAGMA user_version=7; CREATE TABLE kept(n INTEGER); INSERT INTO kept VALUES(42)"); db.close();
  const bytes = readFileSync(original), other = readFileSync(outside), copied = run("copy", "--home", f.home, "--destination", f.copy);
  assert.equal(copied.copied.length, 2); assert.deepEqual(readFileSync(original), bytes); assert.deepEqual(readFileSync(outside), other);
  assert.equal(statSync(f.copy).mode & 0o777, 0o700);
  const listed = run("list", "--home", f.copy);
  assert.equal(listed.stores.length, 40);
  assert.deepEqual(listed.stores.find((row: { position: string }) => row.position === "projects/catalog.db").actual, [22]);
  assert.deepEqual(listed.stores.find((row: { position: string }) => row.position === "projects/<project_id>/molis-work.db").actual, [7]);
  assert.equal(listed.metadata["projects/catalog.db"].empty_workspaces, 1, "T-182 adds count-only workspace residue inspection, never startup cleanup");
});
test("RAC-2327 a nonempty live WAL is NOT READ; immutable primary-file data is never reported as the latest source state", t => {
  const f = fixture(t), file = join(f.home, "wal.db"), db = new DatabaseSync(file);
  try {
    db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE kept(value TEXT); INSERT INTO kept VALUES('uncheckpointed')");
    assert.ok(statSync(file + "-wal").size > 0);
    const report = run("copy", "--home", f.home, "--destination", f.copy);
    assert.deepEqual(report.not_read.find((row: { file: string }) => row.file === "wal.db"), { file: "wal.db", reason: "NONEMPTY_WAL" });
    assert.deepEqual(db.prepare("SELECT value FROM kept").all().map(row => row.value), ["uncheckpointed"]);
  } finally { db.close(); }
});

test("RAC-2327 a WAL created between preflight and VACUUM prevents publishing a stale immutable copy", t => {
  const f = fixture(t), file = join(f.home, "race.db"), db = new DatabaseSync(file);
  db.exec("CREATE TABLE kept(value TEXT); INSERT INTO kept VALUES('before')"); db.close();
  const program = `import importlib.util,sqlite3,json,sys
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('preflight',${JSON.stringify(script)})
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
original=module.readonly;writers=[]
def racing(file):
    reader=original(file)
    writer=sqlite3.connect(file);writer.execute('PRAGMA journal_mode=WAL');writer.execute('PRAGMA wal_autocheckpoint=0')
    writer.execute("INSERT INTO kept VALUES('during-copy')");writer.commit();writers.append(writer)
    return reader
module.readonly=racing
print(json.dumps(module.copy_home(${JSON.stringify(f.home)},${JSON.stringify(f.copy)})))`;
  const result = spawnSync("python3", ["-c", program], { encoding: "utf8" }); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).not_read.find((row: { file: string }) => row.file === "race.db"), { file: "race.db", reason: "CHANGED_DURING_COPY" });
});
test("RAC-2328 preflight reports ui.commands, disabled and orphan counts and lone-surrogate titles without returning bodies or keys", t => {
  const f = fixture(t); mkdirSync(join(f.home, "onboarding")); mkdirSync(join(f.home, "agent-runtime", "records", "private"), { recursive: true });
  writeFileSync(join(f.home, "agent-runtime", "records", "private", "record.json"), "encrypted-body-must-not-be-read");
  writeFileSync(join(f.home, "source.key"), "key-must-not-be-read");
  const db = new DatabaseSync(join(f.home, "onboarding", "onboarding.db"));
  db.exec("CREATE TABLE journeys(id TEXT PRIMARY KEY,body TEXT); CREATE TABLE plugin_runtime_installs(install_id TEXT PRIMARY KEY,record_json TEXT); CREATE TABLE plugin_runtime_release_artifacts(artifact_json TEXT,plugin_id TEXT); CREATE TABLE plugin_private_values(install_id TEXT,item_value TEXT)");
  db.prepare("INSERT INTO journeys VALUES('journey',?)").run(JSON.stringify({ adoption: { title: "half\ud83d", body: "private-body-must-not-be-read" }, summary: { title: "valid🙂" } }));
  db.prepare("INSERT INTO plugin_runtime_installs VALUES('old',?)").run(JSON.stringify({ plugin_id: "io.molis.work.characters", state: "disabled" }));
  db.exec("INSERT INTO plugin_private_values VALUES('old','private-value-must-not-be-read'),('other','private-value-kept')");
  db.prepare("INSERT INTO plugin_runtime_release_artifacts VALUES(?,'io.example')").run(JSON.stringify({ manifest: { ui: { commands: [] } } })); db.close();
  mkdirSync(join(f.home, "pages")); const pages = new DatabaseSync(join(f.home, "pages", "pages.db"));
  pages.exec("CREATE TABLE pages(id TEXT,project_id TEXT,title TEXT,body_json TEXT); CREATE TABLE page_imports(project_id TEXT,request_id TEXT,document_ids_json TEXT); CREATE TABLE todo_batches(origin TEXT,body_json TEXT)");
  pages.prepare("INSERT INTO pages VALUES('broken','p',?,'private-page-body-must-not-be-read')").run("half\ud83d");
  pages.prepare("INSERT INTO pages VALUES('unrelated','p',?,'private-other-body')").run("other\ufffd");
  pages.exec("INSERT INTO page_imports VALUES('p','journey:sources:S1','[\"broken\"]')");
  pages.prepare("INSERT INTO todo_batches VALUES('onboarding',?)").run(JSON.stringify({ materials: [{ title: "half\ud83d", text: "private-material-body" }] })); pages.close();
  const copied = run("copy", "--home", f.home, "--destination", f.copy); assert.equal(copied.encrypted_records_not_read, 1);
  const report = run("list", "--home", f.copy), own = report.metadata["onboarding/onboarding.db"];
  assert.equal(own.broken_onboarding_titles, 1); assert.equal(own.disabled_unclassified, 1); assert.equal(own.characters_installs, 1); assert.equal(own.ui_commands_in_archives, 1);
  assert.deepEqual(own.characters_install_scoped_rows, { plugin_private_values: 1 });
  const pageMetadata = report.metadata["pages/pages.db"];
  assert.equal(pageMetadata.onboarding_page_titles_checked, 1);
  assert.equal(pageMetadata.onboarding_page_titles_replacement_candidates, 1, "real SQLite TEXT encoding leaves a candidate replacement character, not a preserved half surrogate");
  assert.equal(pageMetadata.onboarding_page_titles_broken, 0); assert.equal(pageMetadata.onboarding_todo_titles_broken, 1);
  assert.doesNotMatch(JSON.stringify(report), /half|valid🙂|private-body|key-must|encrypted-body/u);
});

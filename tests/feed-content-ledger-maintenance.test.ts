import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { FEED_HOME_DATABASE } from "@molis-ai/molis-work-plugin-feed";

// FI-4: the maintenance that fills the Home's Feed content ledger from what every project already holds
// (tests/fixtures/feed-content-ledger-maintenance.mjs). RAC-495.
const SCRIPT = new URL("./fixtures/feed-content-ledger-maintenance.mjs", import.meta.url).pathname;
const body = (letter: string) => `molis-work-feed/sha256/${letter.repeat(64)}`;

function homes(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "feed-content-ledger-maintenance-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const ledgerFile = join(directory, "feed-content.sqlite");
  const ledger = new DatabaseSync(ledgerFile);
  ledger.exec(FEED_HOME_DATABASE.schema);
  ledger.close();
  /** Only the columns the maintenance reads: a project's items (which source), its materials (which body) and its pull receipts. */
  const project = (name: string, projectId: string, holdings: { materials?: [string, string][]; receipts?: [string, unknown][] }) => {
    const file = join(directory, `${name}.sqlite`);
    const db = new DatabaseSync(file);
    db.exec(`CREATE TABLE project_root (project_id TEXT PRIMARY KEY);
      CREATE TABLE feed_items (project_id TEXT NOT NULL, item_id TEXT NOT NULL, source_id TEXT);
      CREATE TABLE feed_materials (project_id TEXT NOT NULL, material_id TEXT NOT NULL, item_id TEXT NOT NULL, content_ref TEXT);
      CREATE TABLE feed_source_runs (project_id TEXT NOT NULL, run_id TEXT NOT NULL, source_id TEXT NOT NULL, receipt_json TEXT);`);
    db.prepare("INSERT INTO project_root VALUES (?)").run(projectId);
    (holdings.materials ?? []).forEach(([sourceId, ref], at) => {
      db.prepare("INSERT INTO feed_items VALUES (?, ?, ?)").run(projectId, `item-${at}`, sourceId);
      db.prepare("INSERT INTO feed_materials VALUES (?, ?, ?, ?)").run(projectId, `material-${at}`, `item-${at}`, ref);
    });
    (holdings.receipts ?? []).forEach(([sourceId, receipt], at) => db.prepare("INSERT INTO feed_source_runs VALUES (?, ?, ?, ?)").run(projectId, `run-${at}`, sourceId, JSON.stringify(receipt)));
    db.close();
    return file;
  };
  const held = () => {
    const db = new DatabaseSync(ledgerFile, { readOnly: true });
    try {
      return { holds: db.prepare("SELECT content_ref, project_id, source_id FROM feed_content_holds ORDER BY 1, 2, 3").all().map(row => ({ ...row })),
        marked: db.prepare("SELECT 1 AS marked FROM feed_content_meta WHERE key = 'backfilled_at'").get() !== undefined };
    } finally { db.close(); }
  };
  const run = (mode: string, projects: string[], ...extra: string[]) =>
    spawnSync(process.execPath, [SCRIPT, mode, "--ledger", ledgerFile, ...projects.flatMap(file => ["--project", file]), ...extra, "--json"], { encoding: "utf8" });
  return { project, held, run, ledgerFile, directory };
}

test("RAC-495: list reads and writes nothing; backfill holds what each source's materials and pull receipts name, and marks the ledger complete only when told it has every project", t => {
  const home = homes(t);
  const one = home.project("one", "project-one", { materials: [["source-a", body("a")], ["source-a", body("b")]], receipts: [["source-a", { content_refs: [body("c")] }], ["source-b", { content_refs: [body("a")] }]] });
  const two = home.project("two", "project-two", { materials: [["source-a", body("a")]] });
  const before = home.held();

  const listed = home.run("list", [one, two]);
  assert.equal(listed.status, 0);
  assert.deepEqual(JSON.parse(listed.stdout), { backfilled_at: null, projects: [{ project_id: "project-one", holds: 4, missing: 4 }, { project_id: "project-two", holds: 1, missing: 1 }] });
  assert.deepEqual(home.held(), before, "list is read only");

  const partial = home.run("backfill", [one]);
  assert.deepEqual([partial.status, JSON.parse(partial.stdout)], [0, { projects: 1, holds_added: 4, marked: false }]);
  assert.equal(home.held().marked, false, "a ledger read from only some of the projects is not complete: Feed still releases nothing");

  const all = home.run("backfill", [one, two], "--all-projects");
  assert.deepEqual([all.status, JSON.parse(all.stdout)], [0, { projects: 2, holds_added: 1, marked: true }]);
  assert.deepEqual(home.held(), { marked: true, holds: [
    { content_ref: body("a"), project_id: "project-one", source_id: "source-a" }, { content_ref: body("a"), project_id: "project-one", source_id: "source-b" },
    { content_ref: body("a"), project_id: "project-two", source_id: "source-a" },
    { content_ref: body("b"), project_id: "project-one", source_id: "source-a" }, { content_ref: body("c"), project_id: "project-one", source_id: "source-a" },
  ] });

  const again = home.run("backfill", [one, two], "--all-projects");
  assert.deepEqual([again.status, JSON.parse(again.stdout).holds_added], [0, 0], "running it again changes nothing");
  assert.deepEqual(JSON.parse(home.run("list", [one, two]).stdout).projects.map((item: { missing: number }) => item.missing), [0, 0]);
});

test("RAC-495: a reference that is not one of the Home's evidence bodies is not counted, and the projects are opened read only", t => {
  const home = homes(t);
  const project = home.project("one", "project-one", { materials: [["source-a", "research/note-1"], ["source-a", body("a")]], receipts: [["source-a", { content_refs: ["https://example.com/x", body("b")] }], ["source-a", { other: true }]] });
  assert.equal(home.run("backfill", [project], "--all-projects").status, 0);
  assert.deepEqual(home.held().holds.map(row => row.content_ref), [body("a"), body("b")]);
  const db = new DatabaseSync(project);
  assert.equal(db.prepare("SELECT count(*) AS n FROM feed_materials").get()?.n, 2, "the project's rows are as they were");
  db.close();
});

test("RAC-495: the maintenance stops and writes nothing when the ledger is not there yet, a project is not one, or a receipt is not JSON", t => {
  const home = homes(t);
  const good = home.project("good", "project-good", { materials: [["source-a", body("a")]] });
  const before = home.held();
  const missing = spawnSync(process.execPath, [SCRIPT, "backfill", "--ledger", join(home.directory, "nope.sqlite"), "--project", good], { encoding: "utf8" });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /nothing written/u);

  const empty = join(home.directory, "empty.sqlite");
  const db = new DatabaseSync(empty); db.exec("CREATE TABLE project_root (project_id TEXT PRIMARY KEY);"); db.close();
  const noProject = home.run("backfill", [good, empty], "--all-projects");
  assert.equal(noProject.status, 1);
  assert.match(noProject.stderr, /nothing written/u);

  const broken = home.project("broken", "project-broken", { materials: [["source-a", body("b")]] });
  const brokenDb = new DatabaseSync(broken); brokenDb.prepare("INSERT INTO feed_source_runs VALUES ('project-broken', 'run-x', 'source-a', '{not json')").run(); brokenDb.close();
  const notJson = home.run("backfill", [good, broken], "--all-projects");
  assert.equal(notJson.status, 1);
  assert.match(notJson.stderr, /nothing written/u);
  assert.deepEqual(home.held(), before, "one bad project leaves the ledger as it was, the good project's holds included");
});

test("RAC-495: a bad command is refused", () => {
  assert.equal(spawnSync(process.execPath, [SCRIPT, "backfill"], { encoding: "utf8" }).status, 2);
  assert.equal(spawnSync(process.execPath, [SCRIPT, "wipe", "--ledger", "a", "--project", "b"], { encoding: "utf8" }).status, 2);
});

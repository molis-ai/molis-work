import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { CATALOG_SCHEMA_VERSION, DEMO_PROJECT_ID, MolisWorkProjectCatalogError, catalogSchemaCompatibilityError } from "@molis-ai/molis-work-app-local-host";
import { describeSqliteSchema } from "@molis-ai/molis-work-storage";

/**
 * Real-Home maintenance four (specs/repository-anti-corruption/spec.md §4.1): this build's catalog is version 22, which
 * adds the deletion receipt's owner steps (`project_deletion_steps`); the real Home's catalog is still version 21, and
 * a build refuses any catalog that is not at its own version. The statements the maintenance runs are
 * `tests/fixtures/catalog-maintenance-v22.sql`; these cases are its rehearsal. They stand in the repository until the
 * maintenance has been applied to the real Home: the case that compares with a new catalog fails on the next catalog
 * change, and that is the time to delete this file and the fixture.
 */
const MAINTENANCE = readFileSync(new URL("./fixtures/catalog-maintenance-v22.sql", import.meta.url), "utf8");
const input = { actor_id: "test-user", user_confirmed: true };
const deletion = (id: string) => ({ project_id: id, actor_id: "test-user", delete_confirmed: true, idempotency_key: `delete-${id}` });
const catalogPath = (home: string) => join(home, "projects", "catalog.db");

async function scratch(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "molis-catalog-maintenance-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function withDatabase<T>(home: string, run: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(catalogPath(home));
  try { return run(db); } finally { db.close(); }
}
const versionOf = (home: string) => withDatabase(home, db => (db.prepare("SELECT value FROM catalog_meta WHERE key = 'schema_version'").get() as { value: string }).value);
const hasStepsTable = (home: string) => withDatabase(home, db => db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'project_deletion_steps'").get() !== undefined);

/**
 * The real Home's catalog as the build before this one wrote it: a Home with a project that stays, a project that was
 * deleted and the demo, which was made and removed (both deletions left a receipt), with the one table version 22 adds
 * dropped and the version put back to 21. That build and this one differ in nothing else about the catalog.
 */
async function realHomeBeforeMaintenance(directory: string): Promise<string> {
  const home = join(directory, "real-home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    await catalog.createProject({ display_name: "留下的项目", actor_id: "test-user" });
    const gone = await catalog.createProject({ display_name: "删掉的项目", actor_id: "test-user" });
    assert.equal((await catalog.deleteProject(deletion(gone.project_id))).deletion.cleanup_state, "complete");
    await catalog.ensureDemoProject(input);
    await catalog.removeDemoProject({ ...deletion(DEMO_PROJECT_ID), idempotency_key: "remove-the-demo" });
    assert.equal(catalog.listProjectDeletions().length, 2);
  } finally { catalog.close(); }
  withDatabase(home, db => {
    db.exec("DROP TABLE project_deletion_steps; UPDATE catalog_meta SET value = '21' WHERE key = 'schema_version'");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  });
  return home;
}

test("this build knows catalog version 22, and a version 21 catalog is refused without being touched", async t => {
  assert.equal(CATALOG_SCHEMA_VERSION, 22, "the catalog moved on: maintenance four has to be rewritten for the version the real Home needs");
  const home = await realHomeBeforeMaintenance(await scratch(t));

  await assert.rejects(
    () => openMolisWorkProjectCatalog({ homeDirectory: home }),
    (error: unknown) => error instanceof MolisWorkProjectCatalogError && error.code === "catalog.unsupported_schema" && /版本是 21，这个版本只认 22，不就地升级/.test(error.message),
  );
  assert.equal(versionOf(home), "21", "a refused catalog keeps its version");
  assert.equal(hasStepsTable(home), false, "and its tables: opening never upgrades in place");
});

test("the maintenance makes the real Home's catalog the catalog a new Home gets, and keeps what is in it", async t => {
  const directory = await scratch(t);
  const home = await realHomeBeforeMaintenance(directory);
  const fresh = join(directory, "new-home");
  (await openMolisWorkProjectCatalog({ homeDirectory: fresh })).close();
  const rows = (home: string) => withDatabase(home, db => ({
    projects: db.prepare("SELECT project_id, display_name FROM projects ORDER BY project_id").all(),
    receipts: db.prepare("SELECT deletion_id, project_id, cleanup_state FROM project_deletions ORDER BY deletion_id").all(),
  }));
  const before = rows(home);
  assert.equal(before.projects.length, 1);
  assert.equal(before.receipts.length, 2);

  withDatabase(home, db => { db.exec(MAINTENANCE); });

  assert.equal(versionOf(home), "22");
  const same = (a: string, b: string) => assert.deepEqual(withDatabase(a, db => ({ shape: describeSqliteSchema(db), meta: db.prepare("SELECT key, value FROM catalog_meta ORDER BY key").all() })),
    withDatabase(b, db => ({ shape: describeSqliteSchema(db), meta: db.prepare("SELECT key, value FROM catalog_meta ORDER BY key").all() })));
  same(home, fresh);
  assert.deepEqual(rows(home), before, "no project and no receipt changed");
  withDatabase(home, db => {
    assert.deepEqual(db.prepare("PRAGMA integrity_check").all().map(row => row.integrity_check), ["ok"]);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM project_deletion_steps").get() as { n: number }).n, 0, "the new table starts empty: no step is invented for an earlier deletion");
  });
});

test("after the maintenance the catalog opens; a receipt from before owner steps shows none and runs none; the demo can be made over it; new deletions record steps", async t => {
  const home = await realHomeBeforeMaintenance(await scratch(t));
  // One of the two earlier deletions never finished its clean-up, as one the real Home may hold.
  withDatabase(home, db => {
    db.prepare("UPDATE project_deletions SET cleanup_state = 'pending', cleanup_error = '未完成', cleaned_at = NULL WHERE project_id <> ?").run(DEMO_PROJECT_ID);
    db.exec(MAINTENANCE);
  });

  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    assert.deepEqual(catalog.listProjects().map(project => project.display_name), ["留下的项目"]);
    const states = () => catalog.listProjectDeletions().map(receipt => `${receipt.project_id === DEMO_PROJECT_ID ? "demo" : "project"}:${receipt.cleanup_state}:${receipt.owner_steps.length}`).sort();
    assert.deepEqual(states(), ["demo:complete:0", "project:pending:0"], "an earlier deletion keeps its state and has no owner steps: it ran before they existed");

    // A Host finishes what is pending as it starts: there is no owner step to run for it, only the staged directory to clear.
    assert.equal(await catalog.projectDeletion.finishAll(), 0);
    assert.deepEqual(states(), ["demo:complete:0", "project:complete:0"]);

    // The demo has one fixed id: with only receipts from before owner steps for it, every owner clears again first.
    assert.equal((await catalog.ensureDemoProject(input)).status, "created");

    const later = await catalog.createProject({ display_name: "维护后删掉的项目", actor_id: "test-user" });
    const receipt = (await catalog.deleteProject(deletion(later.project_id))).deletion;
    assert.equal(receipt.cleanup_state, "complete");
    assert.ok(receipt.owner_steps.length > 0 && receipt.owner_steps.every(step => step.state === "complete"), "a deletion after the maintenance records a step for every owner");
    assert.deepEqual(states(), ["demo:complete:0", "project:complete:0", `project:complete:${receipt.owner_steps.length}`], "and the earlier receipts stay as they were");
  } finally { catalog.close(); }
});

test("the maintenance stops and changes nothing unless the catalog is the project catalog at version 21", async t => {
  const directory = await scratch(t);
  const run = (home: string) => withDatabase(home, db => { db.exec(MAINTENANCE); });

  const done = await realHomeBeforeMaintenance(directory);
  run(done);
  assert.throws(() => run(done), /schema_version is 21/, "run twice, the second run is refused");
  assert.equal(versionOf(done), "22");

  const older = await realHomeBeforeMaintenance(await mkdtemp(join(directory, "older-")));
  withDatabase(older, db => { db.exec("UPDATE catalog_meta SET value = '20' WHERE key = 'schema_version'"); });
  assert.throws(() => run(older), /schema_version is 21/);
  assert.equal(versionOf(older), "20", "an older catalog keeps its version");
  assert.equal(hasStepsTable(older), false, "and gets no table: the whole script is undone, not only the check");

  const stranger = await realHomeBeforeMaintenance(await mkdtemp(join(directory, "stranger-")));
  withDatabase(stranger, db => { db.exec("UPDATE catalog_meta SET value = 'someone-elses-database' WHERE key = 'owner'"); });
  assert.throws(() => run(stranger), /owner is molis-work-project-catalog-v1/);
  assert.equal(versionOf(stranger), "21");
  assert.equal(hasStepsTable(stranger), false);

  // A table of that name that is not this build's is no reason to create it again over it or to call the catalog 22.
  const occupied = await realHomeBeforeMaintenance(await mkdtemp(join(directory, "occupied-")));
  withDatabase(occupied, db => { db.exec("CREATE TABLE project_deletion_steps (something_else INTEGER)"); });
  assert.throws(() => run(occupied), /project_deletion_steps already exists/);
  assert.equal(versionOf(occupied), "21");
  assert.deepEqual(withDatabase(occupied, db => db.prepare("PRAGMA table_info(project_deletion_steps)").all().map(column => column.name)), ["something_else"]);
});

test("once the real Home is at 22, a build that only knows 21 (the installed Home build) refuses it as too old and says what to do", () => {
  const error = catalogSchemaCompatibilityError(22, 21);
  assert.ok(error instanceof MolisWorkProjectCatalogError);
  assert.equal(error.code, "catalog.reader_too_old");
  assert.deepEqual(error.details, { actual_schema_version: 22, supported_schema_min: 1, supported_schema_max: 21, recovery: "new_or_fork_session_then_context_resolve" });
  assert.match(error.message, /不要回滚 catalog\.db/);
});

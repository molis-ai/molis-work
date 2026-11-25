import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PERSONAL_SPACE_PROJECT_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { inspectMolisWorkProjectCatalogSnapshot, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createHomeSnapshot, restoreHomeSnapshot, type HomeSnapshotManifest } from "@molis-ai/molis-work-app-local-host";
import { restoreFixture } from "./fixtures/home-restore.js";
import { homeBusinessTree } from "./fixtures/home-storage-files.js";
import { createProjectsSchema, partitionDatabasePath, partitionRoot, ProjectsModule } from "@molis-ai/molis-work-module-projects";
import { ensureStorageSpace, personalStorageSpace } from "@molis-ai/molis-work-storage";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";

async function withHome<T>(run: (home: string) => Promise<T>): Promise<T> {
  const home = await realpath(await mkdtemp(join(tmpdir(), "molis-work-personal-partition-")));
  try { return await run(home); } finally { await rm(home, { recursive: true, force: true }); }
}

const refused = { code: "catalog.personal_space" };

test("UPP-01 Home initialization makes the personal partition at personal-space/ once, and only listPartitions() lists it", async () => withHome(async home => {
  const first = await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => {
    const created = catalog.listPartitions().find(row => row.project_id === PERSONAL_SPACE_PROJECT_ID);
    assert.ok(created, "the catalog's first open made the personal space without anyone asking for it");
    assert.equal(created.database_path, partitionDatabasePath(home, PERSONAL_SPACE_PROJECT_ID));
    assert.equal(created.database_path, join(home, "personal-space", "molis-work.db"));
    assert.equal(catalog.listProjects().some(row => row.project_id === PERSONAL_SPACE_PROJECT_ID), false, "the person's project list leaves it out");
    // UPP-31 R21: looked up by id, as the discussion tab's room lookup does, it is a partition like any project.
    assert.equal(catalog.getProject(PERSONAL_SPACE_PROJECT_ID).project_id, PERSONAL_SPACE_PROJECT_ID);
    return created;
  });
  assert.ok(existsSync(first.database_path), "its main database is under the partition root");
  assert.equal(existsSync(join(home, "projects", PERSONAL_SPACE_PROJECT_ID)), false, "nothing is under projects/personal");
  const project = await withMolisWorkProjectCatalog({ homeDirectory: home }, async catalog => {
    assert.deepEqual(catalog.listPartitions().filter(row => row.project_id === PERSONAL_SPACE_PROJECT_ID), [first], "a second open changes nothing");
    return catalog.createProject({ display_name: "项目 A", actor_id: "local-person" });
  });
  await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => {
    assert.deepEqual(catalog.listProjects().map(row => row.project_id), [project.project_id]);
    assert.deepEqual(catalog.listPartitions().map(row => row.project_id), [PERSONAL_SPACE_PROJECT_ID, project.project_id], "the personal space comes first");
  });
  assert.equal(partitionRoot(home, project.project_id), join(home, "projects", project.project_id));
}));

test("UPP-02 S-personal-partition-reserved creating, sync receiving, copy staging, renaming, recycling and deleting the personal space are refused", async () => withHome(async home => {
  // A Home that syncs (its space is the person's), so sync receiving and copy staging get past their own space check to the reserved id.
  ensureStorageSpace(home, personalStorageSpace("test-issuer", "test-app", "test-account"));
  await withMolisWorkProjectCatalog({ homeDirectory: home }, async catalog => {
    const before = JSON.stringify(catalog.listPartitions());
    await assert.rejects(catalog.createProject({ project_id: PERSONAL_SPACE_PROJECT_ID, display_name: "抢占", actor_id: "local-person" }), /无效的恢复项目标识/u,
      "the person's own create takes no chosen id but an onboarding one");
    await assert.rejects(catalog.ensureSyncedProject({ project_id: PERSONAL_SPACE_PROJECT_ID, display_name: "同步来的", actor_id: "local-person" }, () => {}), refused,
      "sync never makes or takes the personal space");
    await assert.rejects(catalog.stageHiddenProject({ project_id: PERSONAL_SPACE_PROJECT_ID, display_name: "复制来的", actor_id: "local-person", plugins: [] }, () => {}), /无效的恢复项目标识/u,
      "a whole-project copy stages only under a fresh copy id; the record it prepares refuses the reserved id too (below)");
    assert.throws(() => catalog.renameProject(PERSONAL_SPACE_PROJECT_ID, "改名", "local-person", "个人空间"), refused);
    assert.throws(() => catalog.recycle.check({ project_id: PERSONAL_SPACE_PROJECT_ID, actor_id: "local-person", operation_id: "recycle-personal",
      expected_state: "0".repeat(64), recycled: true, confirmed: true }), refused);
    assert.throws(() => catalog.recycle.stageHidden(PERSONAL_SPACE_PROJECT_ID), refused);
    await assert.rejects(catalog.deleteProject({ project_id: PERSONAL_SPACE_PROJECT_ID, actor_id: "local-person", delete_confirmed: true,
      idempotency_key: "delete-personal", output_files: "keep" }), refused);
    assert.equal(JSON.stringify(catalog.listPartitions()), before, "no refused entry wrote anything");
  });
}));

test("UPP-02 S-personal-partition-reserved every record the catalog prepares refuses the reserved id; only Home initialization may make it", async () => withHome(async home => {
  const db = openTestSqlite(join(home, "catalog.db"));
  try {
    createProjectsSchema(db);
    const projects = new ProjectsModule({ db, projects_directory: join(home, "projects"), outputs_directory: join(home, "outputs"), plugins: { has: () => false, companions: () => [] } });
    for (const project_id of [PERSONAL_SPACE_PROJECT_ID, ` ${PERSONAL_SPACE_PROJECT_ID} `]) {
      assert.throws(() => projects.lifecycle.prepareRecord({ project_id, display_name: "抢占", data_class: "user" }), refused, JSON.stringify(project_id));
    }
    assert.equal(projects.lifecycle.prepareRecord({ project_id: PERSONAL_SPACE_PROJECT_ID, display_name: "个人空间", data_class: "user", reserved_partition: true }).project_id,
      PERSONAL_SPACE_PROJECT_ID, "Home initialization's own provisioning");
  } finally { db.close(); }
}));

// The personal space's main database is checked like a project's on restore: an archive that puts another partition's root at
// `personal-space/molis-work.db` is refused, and the Home is left as it was (S-personal-partition-reserved).
test("UPP-33 a restore refuses a personal space main database whose root is another partition, touching nothing", async t => {
  const f = await restoreFixture(t);
  await withMolisWorkProjectCatalog({ homeDirectory: f.home }, async () => {});
  await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
  const manifestPath = join(f.snapshot, "manifest.json"), manifest: HomeSnapshotManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const entry = manifest.stores.flatMap(store => store.entries).find(candidate => candidate.path === "personal-space/molis-work.db");
  assert.ok(entry?.kind === "file" && entry.sqlite, "the personal space's main database is in the snapshot");
  const payload = join(f.snapshot, entry.payload_path), db = new DatabaseSync(payload);
  try { db.exec("UPDATE project_root SET project_id = 'intruder'"); } finally { db.close(); }
  const bytes = readFileSync(payload);
  Object.assign(entry, { size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const before = homeBusinessTree(f.home);
  await assert.rejects(restoreHomeSnapshot({ homeDirectory: f.home, source: f.snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot }));
  assert.deepEqual(homeBusinessTree(f.home), before);
});

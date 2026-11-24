import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PERSONAL_SPACE_PROJECT_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { partitionDatabasePath, partitionRoot } from "@molis-ai/molis-work-module-projects";

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
  await withMolisWorkProjectCatalog({ homeDirectory: home }, async catalog => {
    const before = JSON.stringify(catalog.listPartitions());
    await assert.rejects(catalog.createProject({ project_id: PERSONAL_SPACE_PROJECT_ID, display_name: "抢占", actor_id: "local-person" }), /./u,
      "no project may be created under the reserved id");
    await assert.rejects(catalog.ensureSyncedProject({ project_id: PERSONAL_SPACE_PROJECT_ID, display_name: "同步来的", actor_id: "local-person" }, () => {}), /./u,
      "sync never makes or takes the personal space");
    await assert.rejects(catalog.stageHiddenProject({ project_id: PERSONAL_SPACE_PROJECT_ID, display_name: "复制来的", actor_id: "local-person", plugins: [] }, () => {}), /./u,
      "a whole-project copy cannot stage under the reserved id");
    assert.throws(() => catalog.renameProject(PERSONAL_SPACE_PROJECT_ID, "改名", "local-person", "个人空间"), refused);
    assert.throws(() => catalog.recycle.check({ project_id: PERSONAL_SPACE_PROJECT_ID, actor_id: "local-person", operation_id: "recycle-personal",
      expected_state: "0".repeat(64), recycled: true, confirmed: true }), refused);
    assert.throws(() => catalog.recycle.stageHidden(PERSONAL_SPACE_PROJECT_ID), refused);
    await assert.rejects(catalog.deleteProject({ project_id: PERSONAL_SPACE_PROJECT_ID, actor_id: "local-person", delete_confirmed: true,
      idempotency_key: "delete-personal", output_files: "keep" }), refused);
    assert.equal(JSON.stringify(catalog.listPartitions()), before, "no refused entry wrote anything");
  });
}));

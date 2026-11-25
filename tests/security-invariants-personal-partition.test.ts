import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID, PERSONAL_SPACE_PROJECT_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { inspectMolisWorkProjectCatalogSnapshot, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import {
  createHomeSnapshot,
  describePluginTablesRefusal,
  diagnosticId,
  executeLocalProjectsCopy,
  MolisWorkLocalHost,
  MolisWorkUninstallService,
  MolisWorkWebServiceManager,
  previewLocalProjectsCopy,
  ProjectDeletionService,
  restoreHomeSnapshot,
  RuntimeIntegrationService,
  type HomeSnapshotManifest,
} from "@molis-ai/molis-work-app-local-host";
import { restoreFixture } from "./fixtures/home-restore.js";
import { homeBusinessTree } from "./fixtures/home-storage-files.js";
import {
  createProjectsSchema,
  matchesPartitionPattern,
  PARTITION_PATTERN,
  partitionDatabasePath,
  partitionOfRelativePath,
  partitionRoot,
  ProjectsModule,
} from "@molis-ai/molis-work-module-projects";
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
  await assert.rejects(restoreHomeSnapshot({ homeDirectory: f.home, source: f.snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot }),
    { code: "host.home_restore.invalid" }, "refused as an invalid restore (the only change is the personal space's root)");
  assert.deepEqual(homeBusinessTree(f.home), before);
});

// A write to a main database cut off by a crash leaves its rollback journal; the next normal start replays it. The personal space's main
// database lives at personal-space/, so its partition is read from the layout (`partitionOfDatabasePath`), not from the directory name —
// otherwise its root ("personal") never matched "personal-space" and the Home could not start again.
test("UPP-01 a crash in the middle of a personal space write leaves a journal that the next start replays, as for any project", { timeout: 60_000 }, async () => withHome(async home => {
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  for (const which of [PERSONAL_SPACE_PROJECT_ID, "project"] as const) {
    const database = await withMolisWorkProjectCatalog({ homeDirectory: home }, async catalog => which === PERSONAL_SPACE_PROJECT_ID
      ? catalog.getProject(PERSONAL_SPACE_PROJECT_ID).database_path
      : (await catalog.createProject({ display_name: "A", actor_id: "local-person" })).database_path);
    const crash = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import { DatabaseSync } from "node:sqlite";
      const db = new DatabaseSync(process.argv[1]);
      db.exec("PRAGMA journal_mode=DELETE"); db.exec("BEGIN IMMEDIATE"); db.exec("CREATE TABLE IF NOT EXISTS crash_probe (x)");
      for (let i = 0; i < 50; i++) db.prepare("INSERT INTO crash_probe VALUES (randomblob(100000))").run();
      process.kill(process.pid, "SIGKILL");`, database], { encoding: "utf8" });
    assert.equal(crash.signal, "SIGKILL", crash.stderr);
    assert.equal(existsSync(database + "-journal"), true, `${which}: the cut-off write left its journal`);
    await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
    assert.equal(existsSync(database + "-journal"), false, `${which}: the next start replayed it`);
    const db = new DatabaseSync(database, { readOnly: true });
    try {
      assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name = 'crash_probe'").get()!.n, 0, `${which}: the cut-off write is gone`);
    } finally { db.close(); }
    const partitions = await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.listPartitions().map(row => row.project_id));
    assert.equal(partitions[0], PERSONAL_SPACE_PROJECT_ID, `${which}: the catalog opens, the personal space first`);
  }
}));

test("UPP-02 S-personal-partition-reserved service-layer deletion, recycle, sync admission, copy and uninstall never touch or count personal space", async () => withHome(async home => {
  const userProject = await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog =>
    catalog.createProject({ display_name: "普通项目", actor_id: LOCAL_PERSON_ACTOR_ID }));
  const releaseCalls: string[] = [];
  const deletionService = new ProjectDeletionService(withMolisWorkProjectCatalog, {
    isPanelAlive: () => false,
    isProjectBusy: () => false,
    async releaseProject(databasePath) { releaseCalls.push(databasePath); },
  });

  // Both exact and whitespace-padded forms are refused before releasing live runtime or touching catalog state.
  for (const id of [PERSONAL_SPACE_PROJECT_ID, ` ${PERSONAL_SPACE_PROJECT_ID} `]) {
    await assert.rejects(
      deletionService.deleteProject(home, {
        project_id: id,
        actor_id: LOCAL_PERSON_ACTOR_ID,
        delete_confirmed: true,
        idempotency_key: "service-delete-personal",
        output_files: "keep",
      }),
      refused,
      `deleteProject(${JSON.stringify(id)})`,
    );
    assert.deepEqual(releaseCalls, [], "deleteProject must never release personal-space runtime before refusal");
    await assert.rejects(
      deletionService.changeRecycled(home, {
        project_id: id,
        actor_id: LOCAL_PERSON_ACTOR_ID,
        operation_id: "service-recycle-personal",
        expected_state: "0".repeat(64),
        recycled: true,
        confirmed: true,
      }, () => {}),
      refused,
      `changeRecycled(${JSON.stringify(id)})`,
    );
    await assert.rejects(
      deletionService.finalizeExpiredPersonalProject(home, {
        project_id: id,
        actor_id: LOCAL_PERSON_ACTOR_ID,
        idempotency_key: "service-finalize-personal",
        server_purged_at: 1_700_000_000_000,
      }, { authorize() {}, assertChildrenSettled() {} }),
      refused,
      `finalizeExpiredPersonalProject(${JSON.stringify(id)})`,
    );
    await assert.rejects(
      deletionService.admitSync(home, id, true, () => {}, () => {}, () => "never"),
      refused,
      `admitSync(${JSON.stringify(id)})`,
    );
    await withMolisWorkProjectCatalog({ homeDirectory: home }, async catalog => {
      assert.throws(() => catalog.recycle.inspect(id), refused, `recycle.inspect(${JSON.stringify(id)})`);
      assert.throws(() => catalog.renameProject(id, "改名", LOCAL_PERSON_ACTOR_ID, "个人空间"), refused, `renameProject(${JSON.stringify(id)})`);
      await assert.rejects(
        catalog.deleteProject({
          project_id: id,
          actor_id: LOCAL_PERSON_ACTOR_ID,
          delete_confirmed: true,
          idempotency_key: "catalog-delete-personal",
          output_files: "keep",
        }),
        refused,
        `catalog.deleteProject(${JSON.stringify(id)})`,
      );
    });
  }
  assert.deepEqual(releaseCalls, []);

  // Whole-project copy public entry points refuse copying the personal space; synced provisioning refuses padded id too.
  await withHome(async targetHome => {
    const targetSpace = ensureStorageSpace(targetHome, personalStorageSpace("test-issuer", "test-app", "test-account"));
    await withMolisWorkProjectCatalog({ homeDirectory: targetHome }, async catalog => {
      await assert.rejects(
        catalog.ensureSyncedProject({ project_id: ` ${PERSONAL_SPACE_PROJECT_ID} `, display_name: "同步", actor_id: LOCAL_PERSON_ACTOR_ID }, () => {}),
        refused,
      );
    });
    const copyContext = {
      sourceHome: home,
      targetHome,
      targetSpaceId: targetSpace.spaceId,
      actorId: LOCAL_PERSON_ACTOR_ID,
      sourceWithCatalog: withMolisWorkProjectCatalog,
      targetWithCatalog: withMolisWorkProjectCatalog,
      authorize() {},
    };
    await assert.rejects(previewLocalProjectsCopy(copyContext, [PERSONAL_SPACE_PROJECT_ID]), { code: "host.copy_project_invalid" });
    await assert.rejects(
      executeLocalProjectsCopy(copyContext, { projectIds: [PERSONAL_SPACE_PROJECT_ID], fingerprint: "0".repeat(64), operationId: "copy-personal" }),
      { code: "host.copy_project_invalid" },
    );
  });

  // Uninstall plan "N 个项目" count and persisted receipt `preserved_projects` both exclude `personal`.
  const partitions = await withMolisWorkProjectCatalog({ homeDirectory: home }, async catalog => {
    await catalog.ensureDemoProject({ actor_id: LOCAL_PERSON_ACTOR_ID, user_confirmed: true });
    return catalog.listPartitions();
  });
  const uninstall = new MolisWorkUninstallService({
    homeDirectory: home,
    projects: { inspect: async () => ({ projects: partitions, conflict: null }), removeDemos: async () => {} },
    runtimeIntegrationService: new RuntimeIntegrationService({
      homeDirectory: home,
      userHomeDirectory: home,
      runtimeExecutables: { codex: null, "claude-code": null, opencode: null, "pi-agent": null, "grok-build": null },
    }),
    webServiceManager: new MolisWorkWebServiceManager({ homeDirectory: home, userHomeDirectory: home, platform: "linux" }),
  });
  const purgePlan = await uninstall.prepare({ purge_user_data: true });
  const projectsChange = purgePlan.changes.find(change => change.target === join(home, "projects"));
  assert.equal(projectsChange?.description, "永久删除 1 个用户项目及 catalog", "personal space is excluded from user project count");
  const keepPlan = await uninstall.prepare({ purge_user_data: false });
  assert.equal(keepPlan.status, "ready");
  await uninstall.confirm({ plan_id: keepPlan.plan_id, decision: "confirmed" });
  const receipt = JSON.parse(readFileSync(uninstall.receiptPath, "utf8")) as { preserved_projects: Array<{ project_id: string }> };
  assert.deepEqual(receipt.preserved_projects.map(project => project.project_id), [userProject.project_id],
    "uninstall receipt preserved_projects excludes personal space and demo");
}));

test("UPP-01 partition path patterns reject projects/personal/* and Home upgrade diagnostics never match personal-space/", async () => withHome(async home => {
  assert.equal(matchesPartitionPattern(`${PARTITION_PATTERN}/molis-work.db`, "personal-space/molis-work.db"), true);
  assert.equal(matchesPartitionPattern(`${PARTITION_PATTERN}/molis-work.db`, "projects/proj-1/molis-work.db"), true);
  assert.equal(matchesPartitionPattern(`${PARTITION_PATTERN}/molis-work.db`, "projects/personal-note/molis-work.db"), true);
  assert.equal(matchesPartitionPattern(`${PARTITION_PATTERN}/molis-work.db`, "projects/personal/molis-work.db"), false);
  assert.equal(matchesPartitionPattern(`${PARTITION_PATTERN}/molis-work.db`, "projects/.deleting-1/molis-work.db"), false);
  assert.equal(partitionOfRelativePath("personal-space/molis-work.db"), PERSONAL_SPACE_PROJECT_ID);
  assert.equal(partitionOfRelativePath("projects/proj-1/molis-work.db"), "proj-1");
  assert.equal(partitionOfRelativePath("projects/personal/molis-work.db"), null);
  assert.equal(partitionOfRelativePath("projects/.staging-1/molis-work.db"), null);

  // A Home-level plugin table refusal (library === null) must skip `personal-space/` ledger units and match only Home units.
  const upgradeDir = join(home, "upgrade");
  mkdirSync(upgradeDir, { recursive: true, mode: 0o700 });
  writeFileSync(join(upgradeDir, "ledger.json"), `${JSON.stringify({
    schema_version: 1,
    home_identity: "unbound",
    run_id: "run-home-only",
    from: null,
    to: "a".repeat(64),
    started_at: "2026-11-25T00:00:00.000Z",
    units: [
      { kind: "plugin_tables", owner: "com.example.plug", relative_path: "personal-space/molis-work.db#com.example.plug", group: null, from: 1, to: 2, state: "too_new", error: null },
      { kind: "plugin_tables", owner: "com.example.plug", relative_path: "plugin-libraries/com.example.plug.db#com.example.plug", group: null, from: 1, to: 2, state: "failed", error: null },
    ],
  })}\n`, { mode: 0o600 });
  const homeRefusal = describePluginTablesRefusal(home, "com.example.plug", null, { code: "plugin.home_database.version_mismatch" });
  assert.ok(homeRefusal);
  assert.equal(homeRefusal.project_id, null);
  assert.equal(homeRefusal.reason, "upgrade_failed", "must match the Home unit, not the personal-space too_new unit");
  assert.equal(homeRefusal.diagnostic_id, diagnosticId("run-home-only", "plugin-libraries/com.example.plug.db#com.example.plug"));
}));

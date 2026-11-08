import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { lstatSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { MolisWorkLocalHost, createHomeSnapshot, restoreHomeSnapshot, recoverHomeRestore } from "@molis-ai/molis-work-app-local-host";
import { inspectMolisWorkProjectCatalogSnapshot, openMolisWorkProjectCatalog, withMolisWorkProjectCatalog, createDesktopWebCore } from "@molis-ai/molis-work-app-desktop";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { acquireStorageOwner, acquireStorageOwnerForRecovery, assertStorageOwner, borrowStorageOwner, openMemoryLedger, HOME_RESTORE_JOURNAL } from "@molis-ai/molis-work-storage";
import { homeBusinessTree } from "./fixtures/home-storage-files.js";
import { storageOwnerProcesses } from "./fixtures/home-storage-owner.js";
import { smallSnapshotHome } from "./fixtures/home-snapshot-small.js";
import { restoreFixture } from "./fixtures/home-restore.js";

const pending = { code: "storage.owner.recovery_required" };

test("RAC-2918: pending, corrupt and unknown-phase journals block real normal Host, Catalog and SDK entries before business writes", { timeout: 60_000 }, async t => {
  const peers = storageOwnerProcesses(t);
  for (const body of ['{"phase":"prepared"}', "{broken", '{"phase":"not-a-current-phase"}']) {
    const f = await restoreFixture(t), marker = join(f.root, HOME_RESTORE_JOURNAL), key = randomBytes(32);
    writeFileSync(join(f.root, "storage.key"), key, { mode: 0o640 });
    writeFileSync(marker, body, { mode: 0o600 });
    const before = homeBusinessTree(f.home), lock = join(f.root, ".molis-runtime-owner.db"), inode = lstatSync(lock).ino, parent = lstatSync(f.root).ino;
    assert.throws(() => acquireStorageOwner(f.root), pending);
    let unexpectedHost: MolisWorkLocalHost | undefined;
    try { assert.throws(() => { unexpectedHost = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null }); }, pending); }
    finally { await unexpectedHost?.close(); }
    await assert.rejects(openMolisWorkProjectCatalog({ homeDirectory: f.home }), pending);
    let adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined, appReads = 0;
    try {
      await assert.rejects(createPrologueNodeAdapter({ storageRoot: f.root,
        get app() { appReads += 1; return { appId: "restore.guard", appVersion: "1.0.0" }; },
        modelConfiguration: async () => { throw new Error("Guard must precede model access"); },
      }).then(value => { adapter = value; return value; }), pending);
    } finally { await adapter?.close(); }
    assert.equal(appReads, 0);
    await assert.rejects(createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot }), pending);
    const recovery = acquireStorageOwnerForRecovery(f.root);
    try {
      assert.doesNotThrow(() => assertStorageOwner(f.root, recovery));
      assert.throws(() => borrowStorageOwner(f.root, recovery), pending);
      const peer = await peers.start(f.root);
      assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" }, "recovery owns the original SQLite inode");
      await peer.stop();
    } finally { recovery.release(); }
    assert.deepEqual(homeBusinessTree(f.home), before);
    assert.deepEqual(readFileSync(join(f.root, "storage.key")), key);
    assert.equal(lstatSync(lock).ino, inode); assert.equal(lstatSync(f.root).ino, parent);
    await assert.rejects(recoverHomeRestore({ homeDirectory: f.home, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot }), { code: "host.home_restore.invalid" });
    assert.deepEqual(homeBusinessTree(f.home), before, "invalid recovery must not remove the barrier or change business data");
    rmSync(marker);
    const normal = acquireStorageOwner(f.root); normal.release();
    assert.equal(lstatSync(lock).ino, inode);
  }
});

test("RAC-2918: a parent already held before journal publication cannot lend an SDK borrow while the barrier exists", { timeout: 30_000 }, async t => {
  const f = await restoreFixture(t), owner = acquireStorageOwner(f.root), marker = join(f.root, HOME_RESTORE_JOURNAL);
  let adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined;
  try {
    writeFileSync(marker, "{partial", { mode: 0o600 });
    const before = homeBusinessTree(f.home);
    assert.throws(() => borrowStorageOwner(f.root, owner), pending);
    await assert.rejects(createPrologueNodeAdapter({ storageRoot: f.root, storageOwner: owner, app: { appId: "restore.guard", appVersion: "1.0.0" },
      modelConfiguration: async () => { throw new Error("No model during pending recovery"); },
    }).then(value => { adapter = value; return value; }), pending);
    assert.deepEqual(homeBusinessTree(f.home), before);
    assert.doesNotThrow(() => assertStorageOwner(f.root, owner), "the publisher can still finish or roll back under its original proof");
    rmSync(marker);
    const borrowed = borrowStorageOwner(f.root, owner); borrowed.release();
  } finally { await adapter?.close(); owner.release(); }
});

test("RAC-2918: an independent public Catalog holds the Home throughout its connection, and close/failure release its own lease", async t => {
  const f = await restoreFixture(t);
  await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
  const inode = lstatSync(join(f.root, ".molis-runtime-owner.db")).ino;
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: f.home });
  try {
    await assert.rejects(restoreHomeSnapshot({ homeDirectory: f.home, source: f.snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot }), { code: "storage.owner.busy" });
    await assert.rejects(recoverHomeRestore({ homeDirectory: f.home, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot }), { code: "storage.owner.busy" });
    await assert.rejects(openMolisWorkProjectCatalog({ homeDirectory: f.home }), { code: "storage.owner.busy" });
    assert.ok(Array.isArray(catalog.listProjects()));
  } finally { catalog.close(); }
  const owner = acquireStorageOwner(f.root); owner.release();
  writeFileSync(join(f.home, "projects", "catalog.db"), "corrupt existing catalog");
  await assert.rejects(openMolisWorkProjectCatalog({ homeDirectory: f.home }));
  const afterFailure = acquireStorageOwner(f.root); afterFailure.release();
  assert.equal(lstatSync(join(f.root, ".molis-runtime-owner.db")).ino, inode);
});

test("RAC-2918: Catalog retention reuses an authentic parent independently of the single SDK borrow and cannot release the parent", async t => {
  const f = await restoreFixture(t), owner = acquireStorageOwner(f.root);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: f.home, storageOwner: owner });
  try {
    const sdk = borrowStorageOwner(f.root, owner);
    try { assert.throws(() => owner.release(), { code: "storage.owner.borrowed" }); }
    finally { sdk.release(); }
    assert.throws(() => owner.release(), { code: "storage.owner.borrowed" });
  } finally { catalog.close(); }
  assert.doesNotThrow(() => assertStorageOwner(f.root, owner));
  assert.throws(() => acquireStorageOwner(f.root), { code: "storage.owner.busy" }); owner.release();
  const host = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
  try {
    const withCatalog = host.configurePersonalPlanning(f.home, withMolisWorkProjectCatalog);
    await withCatalog({ homeDirectory: f.home }, async catalog => {
      const created = await catalog.createProject({ display_name: "Same genuine Host", actor_id: "test-person" });
      assert.equal(catalog.getProject(created.project_id).display_name, created.display_name);
    });
    assert.throws(() => acquireStorageOwner(f.root), { code: "storage.owner.busy" });
  } finally { await host.close(); }
  const closed = acquireStorageOwner(f.root); closed.release();
});

test("RAC-2918: pending blocks fresh Catalog/Web/Memory before creating any business directory and recovery cannot lend to SDK", async t => {
  const f = await smallSnapshotHome(t), root = join(f.home, "agent-runtime");
  const owner = acquireStorageOwner(root); owner.release();
  const marker = join(root, HOME_RESTORE_JOURNAL); writeFileSync(marker, "{pending", { mode: 0o600 });
  const before = homeBusinessTree(f.home);
  await assert.rejects(openMolisWorkProjectCatalog({ homeDirectory: f.home }), pending);
  assert.throws(() => createDesktopWebCore({ ptyClientFilePath: () => "unused.js" })({ homeDirectory: f.home }), pending);
  assert.throws(() => openMemoryLedger({ homeDirectory: f.home }), pending);
  assert.deepEqual(homeBusinessTree(f.home), before);
  rmSync(marker);
  const recovery = acquireStorageOwnerForRecovery(root);
  try { assert.throws(() => borrowStorageOwner(root, recovery), { code: "storage.owner.invalid" }); }
  finally { recovery.release(); }
});

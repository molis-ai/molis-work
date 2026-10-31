import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, cp, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createHomeSnapshot, homeStores, preflightConnectorPrivateStateRestore, readRuntimeConfigBackup, LocalProjectDatabase, MolisWorkLocalHost, molisWorkHostProjectReference, type HomeSnapshotManifest } from "@molis-ai/molis-work-app-local-host";
import { personalPlanningActions, goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import { createEvidenceContentStore, createLazyFileSecretStore, createSearchOpaqueBlobStore, LocalSqliteStorage, openExistingHomePayload, snapshotFileDigest } from "@molis-ai/molis-work-storage";
import { assertSnapshotFact } from "./fixtures/home-snapshot-facts.js";
import { populatedSnapshotHome, snapshotSdk, snapshotMemoryCaller } from "./fixtures/home-snapshot-fixture.js";
import { snapshotWalWriter } from "./fixtures/home-snapshot-wal.js";
import { managementGoals } from "./goal-management-caller.js";

async function allFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const name of await readdir(directory)) {
    const file = join(directory, name), info = await lstat(file);
    if (info.isDirectory()) files.push(...await allFiles(file)); else files.push(file);
  }
  return files;
}

test("RAC-104-S-01/04 RAC-106-S-03: a populated Home keeps every actual owner, WAL facts, versions, sealed state and original-key readback", { timeout: 90_000 }, async t => {
  const f = await populatedSnapshotHome(t), ownerFile = join(f.sdkRoot, ".molis-runtime-owner.db");
  const identities = { directory: (await lstat(f.sdkRoot)).ino, lock: (await lstat(ownerFile)).ino };
  const writer = await snapshotWalWriter(t, join(f.home, "memory", "memory.db"));
  try {
    const result = await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
    assert.equal(result.status, "created");
    const manifest: HomeSnapshotManifest = JSON.parse(await readFile(join(f.snapshot, "manifest.json"), "utf8"));
    assert.deepEqual(manifest.stores.map(store => ({ path: store.path, owner: store.owner })), homeStores(f.home).stores.map(store => ({ path: store.path, owner: store.owner })));
    for (const fact of f.facts) {
      const entry = manifest.stores.flatMap(store => store.entries).find(item => item.kind === "file" && item.path === fact.file);
      assert.ok(entry && entry.kind === "file" && entry.sqlite, fact.file + " is backed up by SQLite, not copied raw");
      assertSnapshotFact(join(f.snapshot, entry.payload_path), fact);
      assert.equal(entry.sqlite.integrity_check, "ok"); assert.equal(entry.sqlite.foreign_key_check, "ok");
    }
    for (const [position, project] of f.projects.entries()) {
      const prefix = "alchemist/projects/" + encodeURIComponent(project.project_id).replaceAll(".", "%2E");
      const entries = manifest.stores.find(store => store.path === "alchemist")!.entries;
      const studio = entries.find(entry => entry.kind === "file" && entry.path === prefix + "/studio.sqlite");
      const search = entries.find(entry => entry.kind === "file" && entry.path === prefix + "/search.sqlite");
      assert.ok(studio?.kind === "file" && studio.sqlite); assert.ok(search?.kind === "file" && search.sqlite);
      const db = new DatabaseSync(join(f.snapshot, studio.payload_path), { readOnly: true });
      try { assert.equal(db.prepare("SELECT title FROM directions WHERE id=?").get("direction")?.title, "Retained direction " + position); }
      finally { db.close(); }
      const storage = new LocalSqliteStorage(join(f.snapshot, search.payload_path), { readonly: true });
      try { assert.equal((await createSearchOpaqueBlobStore(storage.db).read({ namespace: "snapshot", key: "operation" }))?.opaque, "Kept opaque operation " + position); }
      finally { storage.close(); }
    }
    for (const [path, expected] of f.binary) assert.deepEqual(await readFile(join(f.snapshot, "data", path)), expected, path);
    const memoryStore = manifest.stores.find(store => store.path === "memory")!;
    const memoryFile = memoryStore.entries.find(entry => entry.kind === "file" && entry.sqlite);
    assert.ok(memoryFile?.kind === "file" && memoryFile.sqlite);
    assert.equal(memoryFile.sqlite.user_version, homeStores().get("memory")!.library!.baseline.version);
    const captured = new DatabaseSync(join(f.snapshot, memoryFile.payload_path), { readOnly: true });
    try {
      assert.deepEqual(captured.prepare("SELECT actor_id,body FROM memory_markers WHERE key='snapshot-proof' ORDER BY actor_id").all().map(row => ({ ...row })), [
        { actor_id: "wal-committed", body: JSON.stringify({ text: "LATEST_COMMITTED_FROM_WAL" }) },
      ], "RAC-2379 committed WAL is captured and the uncommitted row is absent");
    } finally { captured.close(); }
    assert.equal(manifest.stores.some(store => store.path === "sessions"), false);
    const projectFile = manifest.stores.find(store => store.path === "projects")!.entries.find(entry => entry.kind === "file" && entry.path === "projects/" + f.projects[0]!.project_id + "/molis-work.db");
    assert.ok(projectFile?.kind === "file" && projectFile.sqlite);
    assert.equal(typeof projectFile.sqlite.owner_versions["plugin:io.molis.work.goals"], "number");
    const privateState = manifest.stores.find(store => store.path === "runtime")!.owner_payload;
    assert.ok(privateState);
    const cliSnapshot = JSON.parse(await readFile(join(f.snapshot, privateState.payload_path), "utf8"));
    await rm(f.privateHome, { recursive: true });
    const plans = preflightConnectorPrivateStateRestore(f.home, cliSnapshot);
    assert.equal(plans.length, 1); assert.equal(plans[0]!.installation_id, f.installationId);
    assert.equal(Buffer.from(plans[0]!.files.find(file => file.relative_path === "identity")!.bytes).toString("utf8"), "managed-account");
    for (const directory of plans[0]!.directories) await mkdir(join(plans[0]!.root_path, directory.relative_path), { recursive: true, mode: directory.mode });
    for (const file of plans[0]!.files) { await writeFile(join(plans[0]!.root_path, file.relative_path), file.bytes); await chmod(join(plans[0]!.root_path, file.relative_path), file.mode); }
    assert.equal(JSON.parse(await readFile(join(f.privateHome, "client-credential.json"), "utf8")).bearer, f.privateText);
    const bookmarks = manifest.stores.find(store => store.path === "directory-access")!.entries.find(entry => entry.kind === "sealed");
    assert.ok(bookmarks?.kind === "sealed" && bookmarks.binding);
    const wrapped = JSON.parse(await readFile(join(f.snapshot, bookmarks.payload_path), "utf8"));
    const opened = JSON.parse(openExistingHomePayload(f.home, bookmarks.binding, wrapped.payload));
    assert.equal(Buffer.from(opened.contents_base64, "base64").toString("utf8"), f.bookmark); assert.equal(opened.mode, 0o640);
    for (const file of await allFiles(f.snapshot)) {
      const bytes = await readFile(file);
      for (const forbidden of f.forbidden) assert.equal(bytes.includes(forbidden), false, "no original key or synthetic credential/capability enters " + file);
      assert.equal(/\.molis-runtime-owner|(?:-wal|-shm|-journal)$/u.test(file), false);
      assert.equal(/(?:^|\/)(?:storage\.key|secrets\.key|content\.key)$/u.test(file), false, "original key files never enter the artifact");
    }
    for (const store of manifest.stores) for (const entry of store.entries) if (entry.kind !== "directory") {
      assert.deepEqual(snapshotFileDigest(join(f.snapshot, entry.payload_path)), { size: entry.size, sha256: entry.sha256 });
    }
    assert.equal((await lstat(f.sdkRoot)).ino, identities.directory); assert.equal((await lstat(ownerFile)).ino, identities.lock);
  } finally { await writer.stop(); }

  // Owner readback is a deliberately manual test replay, not a claim that the restore CLI exists.
  const replay: HomeSnapshotManifest = JSON.parse(await readFile(join(f.snapshot, "manifest.json"), "utf8"));
  for (const root of [join(f.sdkRoot, "records"), join(f.builderRoot, "records")]) await rm(root, { recursive: true, force: true });
  for (const store of replay.stores) for (const entry of store.entries) {
    const target = join(f.home, entry.path);
    if (entry.kind === "directory") { await mkdir(target, { recursive: true }); continue; }
    if (entry.kind !== "file") continue;
    if (entry.sqlite) for (const suffix of ["", "-wal", "-shm", "-journal"]) await rm(target + suffix, { force: true });
    await mkdir(dirname(target), { recursive: true }); await cp(join(f.snapshot, entry.payload_path), target); await chmod(target, entry.mode);
  }
  const goalsHost = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
  try {
    const { methods } = await goalsHost.homeActionClient().invoke({ actor_id: "web-user", actor_kind: "user", project_id: null,
      audience: "user", permissions: ["goals:read"] }, personalPlanningActions.list, {}) as { methods: Array<{ method_id: string }> };
    const expected = f.facts.find(fact => fact.table === "personal_planning_method_packs"); assert.ok(expected);
    assert.deepEqual(methods.find(method => method.method_id === "snapshot-retained"), { ...JSON.parse(String(expected.expected)), overridden_scopes: [] }, "Goals reads its actual retained method after snapshot replay; no other scope overrides its unique id");
    const project = f.projects[0]!;
    const snapshot = await managementGoals(goalsHost.actionClient(molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path })), project.project_id)
      .invoke(goalsActions.snapshot, {});
    assert.ok(snapshot.goals.some(goal => goal.goal_id === "snapshot-goal"));
  } finally { await goalsHost.close(); }
  const read = snapshotSdk(f.sdkRoot, "snapshot-person");
  try { assert.equal((await (await read).memory!.withCaller(snapshotMemoryCaller("snapshot-person")).list("user", "snapshot-person")).find(entry => entry.memory_id === f.memoryId)?.text, "Retained SDK memory"); }
  finally { await read.close(); }
  const builder = snapshotSdk(f.builderRoot, "snapshot-builder");
  try { assert.equal((await (await builder).memory!.withCaller(snapshotMemoryCaller("snapshot-builder")).list("user", "snapshot-builder"))[0]?.text, "Retained builder memory"); }
  finally { await builder.close(); }
  assert.equal((await readRuntimeConfigBackup(f.home, "codex", "snapshot-config")).contents, f.runtimeText);
  assert.equal(createEvidenceContentStore({ secretStore: createLazyFileSecretStore(f.home), rootDirectory: join(f.home, "feed", "evidence") }).read(f.evidence), "Retained evidence body");
  const source = new LocalProjectDatabase(f.projects[0]!.database_path, { existingOnly: true });
  try {
    const artifacts = new ArtifactsModule({ db: source.db, appendEvent: event => source.appendEvent(event), eventCursor: id => source.eventCursor(id) });
    assert.deepEqual(artifacts.query.listArtifactVersions(f.projects[0]!.project_id, "snapshot-report").map(item => item.version).sort(), [1, 2]);
    assert.deepEqual(artifacts.query.getArtifactVersion(f.projects[0]!.project_id, { artifact_id: "snapshot-report", version: 2 })?.payload, { text: "Kept report 2" });
  } finally { source.close(); }
  assert.equal(createHash("sha256").update(await readFile(join(f.home, "feed", "secrets.key"))).digest("hex"), createHash("sha256").update(f.key).digest("hex"));
  assert.equal((await lstat(f.sdkRoot)).ino, identities.directory); assert.equal((await lstat(ownerFile)).ino, identities.lock);
  assert.equal(dirname(f.snapshot), f.directory);
});

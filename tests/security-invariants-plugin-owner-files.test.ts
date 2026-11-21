import assert from "node:assert/strict";
import fs, { chmodSync, existsSync, linkSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { PLUGIN_DATA_EXPORT_PERMISSION, PLUGIN_DATA_PROVIDER_ID, pluginDataActions, type HomePluginDatabaseDeclaration, type PluginDataExportResult, type PluginDataSectionDeclaration, type PluginInstanceRecord, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginManifestDigest, SqlitePluginRuntimeReleaseArtifactRepository, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { homeStores, openSandboxHomeLibrary } from "@molis-ai/molis-work-app-local-host";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { grantOwnerFiles, ownerFileActions, ownerFilesProbe } from "./fixtures/plugin-owner-files.js";

test("RAC-306 V-30 owner files are readable and writable by the Host's user only: created, read-only and read-write nodes carry no group or other bits, whatever the umask", async t => {
  const probe = ownerFilesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  await grantOwnerFiles(host, probe);
  const run = ownerFileActions(host, probe), root = join(home, probe.owner_files.store_name), mode = (path: string) => statSync(join(root, path)).mode & 0o777;
  const umask = process.umask(0);
  try {
    await run.write(writer => {
      writer.mkdir("documents/folder"); writer.writeFile("documents/folder/a.txt", Buffer.from("a"), "create");
      writer.copyFile("documents/folder/a.txt", "documents/b.txt"); writer.replaceFileAtomic("catalog.json", Buffer.from("{}"));
    });
    assert.deepEqual(["catalog.json", "documents/b.txt", "documents/folder/a.txt"].map(mode), [0o600, 0o600, 0o600]);
    assert.deepEqual(["documents", "documents/folder"].map(mode), [0o700, 0o700]);
    await run.write(writer => { writer.setAccess("documents/b.txt", "readonly"); writer.setAccess("documents/folder", "readonly"); });
    assert.deepEqual([mode("documents/b.txt"), mode("documents/folder")], [0o400, 0o500]);
    await run.write(writer => { writer.setAccess("documents/b.txt", "readwrite"); writer.setAccess("documents/folder", "readwrite"); });
    assert.deepEqual([mode("documents/b.txt"), mode("documents/folder")], [0o600, 0o700]);
  } finally { process.umask(umask); }
});

test("SHF-IO-S03 SHF-IO-S06 Home owner files keep Unicode bytes, exclusive creates and copies, replacement and read-only queries", async t => {
  const probe = ownerFilesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  await grantOwnerFiles(host, probe);
  const run = ownerFileActions(host, probe), root = join(home, probe.owner_files.store_name);
  assert.deepEqual(await run.read(client => [client.stat("documents"), client.list("documents"), client.read("catalog.json")]), [null, [], null]);
  assert.equal(existsSync(root), false);
  const bytes = Buffer.from("中文\u0000original");
  await run.write(writer => {
    writer.mkdir("documents/保留 空格"); writer.writeFile("documents/保留 空格/原件.txt", bytes, "create"); bytes.fill(0);
    assert.equal(Buffer.from(writer.read("documents/保留 空格/原件.txt")!).toString(), "中文\u0000original", "synchronous writes consume bytes before returning");
    writer.copyFile("documents/保留 空格/原件.txt", "documents/copy.txt");
    assert.throws(() => writer.copyFile("documents/copy.txt", "documents/copy.txt"));
    assert.throws(() => writer.writeFile("documents/copy.txt", Buffer.from("overwrite"), "create"));
    assert.throws(() => writer.writeFile("documents/missing.txt", Buffer.from("missing"), "replace"), { code: "ENOENT" });
    writer.writeFile("documents/copy.txt", Buffer.from("short"), "replace");
    writer.replaceFileAtomic("catalog.json", Buffer.from("complete catalog"));
    writer.setAccess("documents/copy.txt", "readonly"); writer.setAccess("documents/保留 空格", "readonly");
  });
  assert.equal(readFileSync(join(root, "documents/copy.txt"), "utf8"), "short");
  assert.equal(statSync(join(root, "documents/copy.txt")).mode & 0o777, 0o400);
  assert.equal(statSync(join(root, "documents/保留 空格")).mode & 0o777, 0o500);
  const before = [statSync(root), statSync(join(root, "catalog.json")), statSync(join(root, "documents"))].map(s => [s.mtimeMs, s.ctimeMs, s.mode]);
  for (let i = 0; i < 2; i++) await run.read(client => [client.stat("catalog.json"), client.list("documents"), client.read("catalog.json")]);
  assert.deepEqual([statSync(root), statSync(join(root, "catalog.json")), statSync(join(root, "documents"))].map(s => [s.mtimeMs, s.ctimeMs, s.mode]), before);
  await run.write(writer => {
    writer.setAccess("documents/保留 空格", "readwrite"); writer.setAccess("documents/copy.txt", "readwrite");
    writer.removeTree("documents/保留 空格"); writer.removeTree("catalog.json"); writer.removeTree("catalog.json");
  });
  assert.equal(existsSync(join(root, "catalog.json")), false);
  assert.equal(existsSync(join(root, "documents/保留 空格")), false);
});

test("SHF-IO-S03 invalid paths fail before creating any parent and undeclared roots remain untouched", async t => {
  const probe = ownerFilesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  await grantOwnerFiles(host, probe);
  const run = ownerFileActions(host, probe), root = join(home, probe.owner_files.store_name);
  for (const relative of ["", "/tmp/escape", "../escape", "documents/../escape", "documents//file", "documents/new/.", "documents/new/", "documents/new/../file", "documents/a\\b", "documents/a\u0000b", "C:/outside", "C:outside", "other/file", "catalog.json/child"]) {
    await assert.rejects(run.write(writer => writer.writeFile(relative, Buffer.from("refused"), "create")), /路径|声明/u, relative);
    await assert.rejects(run.read(client => client.stat(relative)), /路径|声明/u, relative);
    assert.equal(existsSync(root), false, relative);
  }
  await assert.rejects(run.write(writer => writer.mkdir("catalog.json")));
  await assert.rejects(run.write(writer => writer.removeTree("documents")));
  assert.equal(existsSync(root), false);
});

test("SHF-IO-S03 symlinks, special nodes, file parents and directory-as-file are rejected with stable disk contents", { timeout: 30_000 }, async t => {
  const probe = ownerFilesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  await grantOwnerFiles(host, probe);
  const run = ownerFileActions(host, probe), root = join(home, probe.owner_files.store_name), directory = join(root, "documents");
  const outside = join(home, "outside"); mkdirSync(outside); writeFileSync(join(outside, "original"), "another owner");
  await run.write(writer => writer.mkdir("documents"));
  symlinkSync(join(outside, "original"), join(directory, "linked"));
  symlinkSync(outside, join(directory, "linked-parent"));
  mkdirSync(join(directory, "folder")); writeFileSync(join(directory, "file-parent"), "ordinary");
  execFileSync("mkfifo", [join(directory, "pipe")]);
  for (const relative of ["documents/linked", "documents/linked-parent/child", "documents/pipe", "documents/folder", "documents/file-parent/child"]) {
    await assert.rejects(run.read(client => client.read(relative)), undefined, relative);
    await assert.rejects(run.write(writer => writer.writeFile(relative, Buffer.from("refused"), "replace")), undefined, relative);
  }
  await assert.rejects(run.read(client => client.list("documents")), { code: "host.owner_file_unsafe" });
  await assert.rejects(run.read(client => client.stat("documents/pipe")), { code: "host.owner_file_unsafe" });
  for (const relative of ["documents/linked", "documents/pipe"]) {
    await assert.rejects(run.write(writer => writer.setAccess(relative, "readonly")));
    await assert.rejects(run.write(writer => writer.removeTree(relative)));
    await assert.rejects(run.write(writer => writer.replaceFileAtomic(relative, Buffer.from("refused"))));
  }
  assert.equal(readFileSync(join(outside, "original"), "utf8"), "another owner");
  assert.equal(existsSync(join(outside, "child")), false);
  rmSync(directory, { recursive: true }); symlinkSync(outside, directory);
  await assert.rejects(run.write(writer => writer.mkdir("documents/new")));
  await assert.rejects(run.read(client => client.list("documents")));
  rmSync(directory); rmSync(root, { recursive: true }); symlinkSync(outside, root);
  await assert.rejects(run.read(client => client.stat("documents")));
  await assert.rejects(run.write(writer => writer.writeFile("catalog.json", Buffer.from("refused"), "create")));
  assert.deepEqual(readdirSync(outside), ["original"]);
});

test("SHF-IO-S03 hard links are refused by every file primitive and unsafe removeTree preflight deletes nothing", async t => {
  const probe = ownerFilesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  await grantOwnerFiles(host, probe);
  const run = ownerFileActions(host, probe), root = join(home, probe.owner_files.store_name), directory = join(root, "documents");
  await run.write(writer => { writer.mkdir("documents/tree"); writer.writeFile("documents/source", Buffer.from("source"), "create"); writer.writeFile("documents/tree/good", Buffer.from("keep"), "create"); });
  const outside = join(home, "hard-original"); writeFileSync(outside, "outside"); linkSync(outside, join(directory, "tree", "hard"));
  const outsideMode = statSync(outside).mode;
  for (const read of [(client: ReturnType<typeof probe.client>) => client.stat("documents/tree/hard"), (client: ReturnType<typeof probe.client>) => client.read("documents/tree/hard"), (client: ReturnType<typeof probe.client>) => client.list("documents/tree")]) {
    await assert.rejects(run.read(read), { code: "host.owner_file_unsafe" });
  }
  await assert.rejects(run.write(writer => writer.copyFile("documents/tree/hard", "documents/new")));
  await assert.rejects(run.write(writer => writer.copyFile("documents/source", "documents/tree/hard")));
  await assert.rejects(run.write(writer => writer.writeFile("documents/tree/hard", Buffer.from("bad"), "replace")));
  await assert.rejects(run.write(writer => writer.replaceFileAtomic("documents/tree/hard", Buffer.from("bad"))));
  await assert.rejects(run.write(writer => writer.setAccess("documents/tree/hard", "readonly")));
  await assert.rejects(run.write(writer => writer.removeTree("documents/tree")));
  assert.equal(readFileSync(join(directory, "tree/good"), "utf8"), "keep");
  assert.equal(readFileSync(outside, "utf8"), "outside");
  assert.equal(statSync(outside).mode, outsideMode);
  assert.equal(existsSync(join(directory, "new")), false);
  await run.write(writer => { writer.mkdir("documents/normal/child"); assert.equal(writer.stat("documents/normal")?.kind, "directory"); writer.setAccess("documents/normal", "readwrite"); writer.removeTree("documents/normal"); });
});

test("SHF-IO-S06 atomic rename failure keeps old bytes and removes only its temporary file; files over 32 MiB work", async t => {
  const probe = ownerFilesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  await grantOwnerFiles(host, probe);
  const run = ownerFileActions(host, probe), root = join(home, probe.owner_files.store_name);
  await run.write(writer => writer.writeFile("catalog.json", Buffer.from("old catalog"), "create"));
  // Inject a real permission failure after the temporary file has been written and closed.
  const rename = fs.renameSync, targetFile = realpathSync(join(root, "catalog.json"));
  let attempted = false;
  const failing = t.mock.method(fs, "renameSync", (source, target) => {
    if (target !== targetFile) return rename(source, target);
    attempted = true; assert.equal(readFileSync(source, "utf8"), "new catalog"); chmodSync(root, 0o500);
    try { return rename(source, target); } finally { chmodSync(root, 0o700); }
  });
  syncBuiltinESMExports();
  try { await assert.rejects(run.write(writer => writer.replaceFileAtomic("catalog.json", Buffer.from("new catalog")))); }
  finally { failing.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(attempted, true);
  assert.equal(readFileSync(join(root, "catalog.json"), "utf8"), "old catalog");
  assert.deepEqual(readdirSync(root), ["catalog.json"]);
  await run.write(writer => writer.replaceFileAtomic("catalog.json", Buffer.from("new catalog")));
  assert.equal(readFileSync(join(root, "catalog.json"), "utf8"), "new catalog");
  const large = Buffer.alloc(33 * 1024 * 1024, 71);
  await run.write(writer => writer.writeFile("documents/large", large, "create"));
  assert.equal(await run.read(client => {
    const returned = client.read("documents/large");
    assert.ok(returned instanceof Uint8Array); assert.deepEqual(returned, large);
    return returned.byteLength;
  }), large.byteLength, "the service reads all bytes; the action's diagnostic result stays small");
});

test("S-plugin-data plugins.data refuses non-person, delegated, quarantined, unowned Home DB, and non-partitioned Home tables without project_id under project scope", async t => {
  const ownedDecl: HomePluginDatabaseDeclaration = {
    store_name: "p06data",
    version: 1,
    read_permission: "p06data:read",
    write_permission: "p06data:write",
    schema: "CREATE TABLE p06_notes (id INTEGER PRIMARY KEY, label TEXT NOT NULL); CREATE TABLE p06_kv (k TEXT PRIMARY KEY, v TEXT NOT NULL) WITHOUT ROWID;",
  };
  const unownedDecl: HomePluginDatabaseDeclaration = {
    store_name: "p06unowned",
    version: 1,
    read_permission: "p06unowned:read",
    write_permission: "p06unowned:write",
    schema: "CREATE TABLE orphan_rows (id INTEGER PRIMARY KEY, body TEXT NOT NULL);",
  };
  const quarantinedDecl: HomePluginDatabaseDeclaration = {
    store_name: "p06quarantined",
    version: 1,
    read_permission: "p06q:read",
    write_permission: "p06q:write",
    schema: "CREATE TABLE q_rows (id INTEGER PRIMARY KEY, body TEXT NOT NULL);",
  };

  const makeManifest = (pluginId: string, signature: string, homeDb: HomePluginDatabaseDeclaration): PluginManifest => ({
    schema_version: 1,
    host_api_version: 1,
    plugin_id: pluginId,
    version: "1.0.0",
    name: pluginId,
    kind: "app",
    publisher: { publisher_id: "third-party", signature },
    entrypoints: [{ deployment: "local", entrypoint: "./plugin.mjs" }],
    permissions: [
      { permission: "storage:private", required: true, reason: "private storage" },
      { permission: homeDb.read_permission, required: true, reason: "read" },
      { permission: homeDb.write_permission, required: true, reason: "write" },
    ],
    capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] },
    ui: { contributions: [] },
    runtime: { scope: "home" },
    databases: { home: homeDb },
  });

  const ownedId = "io.molis.work.example.p06data";
  const unownedId = "io.molis.work.example.p06unowned";
  const quarantinedId = "io.molis.work.example.p06quarantined";
  const ownedManifest = makeManifest(ownedId, "sig-p06-owned", ownedDecl);
  const unownedManifest = makeManifest(unownedId, "sig-p06-unowned", unownedDecl);
  const quarantinedManifest = makeManifest(quarantinedId, "sig-p06-quarantined", quarantinedDecl);

  const f = await serveHomeRuntime(t);
  const project = await f.project("Plugin Data Boundary");
  const projectClient = f.host.actionClient(project.reference);
  const homeClient = f.host.homeActionClient();
  const sectionsRef = { ...pluginDataActions.sections, provider_id: PLUGIN_DATA_PROVIDER_ID };
  const exportRef = { ...pluginDataActions.export, provider_id: PLUGIN_DATA_PROVIDER_ID };

  // Ensure plugin-runtime DB exists, then record three third-party installed plugins (running, unowned, quarantined).
  await f.host.homePlugins!.ready();
  {
    const db = new DatabaseSync(homeSqlitePath(f.home, "plugin-runtime"));
    try {
      const installs = new SqlitePluginRuntimeRepository(db);
      const releases = new SqlitePluginRuntimeReleaseArtifactRepository(db);
      const now = new Date().toISOString();
      const seedInstall = (manifest: PluginManifest, state: PluginInstanceRecord["state"]) => {
        const digest = pluginManifestDigest(manifest);
        releases.save({
          plugin_id: manifest.plugin_id,
          publisher_signature: manifest.publisher.signature,
          version: manifest.version,
          manifest_digest: digest,
          manifest,
          module_source: "export default {};",
        });
        installs.save({
          install_id: `install-${manifest.plugin_id}`,
          installation_generation: "1",
          plugin_id: manifest.plugin_id,
          version: manifest.version,
          publisher_id: manifest.publisher.publisher_id,
          publisher_signature: manifest.publisher.signature,
          publisher_trust: "pinned",
          manifest_digest: digest,
          deployment: "local",
          selected_entrypoint: "./index.js",
          execution: "sandbox",
          state,
          recovery_count: 0,
          last_error_code: null,
          grants: ["storage:private"],
          installed_at: now,
          updated_at: now,
          uninstalled_at: null,
          retain_private_data: false,
        });
      };
      seedInstall(ownedManifest, "running");
      seedInstall(unownedManifest, "running");
      seedInstall(quarantinedManifest, "quarantined");
    } finally {
      db.close();
    }
  }

  // 1. Non-person audiences, delegated callers, and plugin identities are refused and not offered.
  const basePerson: ActionCallContext = {
    actor_id: LOCAL_PERSON_ACTOR_ID,
    audience: "user",
    project_id: project.project_id,
    permissions: [PLUGIN_DATA_EXPORT_PERMISSION],
  };
  const forbiddenCallers: Array<[string, ActionCallContext]> = [
    ["agent", { ...basePerson, audience: "agent", actor_kind: "runtime" }],
    ["plugin", { ...basePerson, audience: "plugin", actor_kind: "runtime" }],
    ["workflow", { ...basePerson, audience: "workflow", actor_kind: "runtime" }],
    ["mcp", { ...basePerson, audience: "mcp", actor_kind: "runtime" }],
    ["delegated", { ...basePerson, delegated_by: "io.molis.work.todo" }],
    ["calling_plugin_id", { ...basePerson, calling_plugin_id: "io.molis.work.todo" }],
    ["host_plugin", {
      ...basePerson,
      host_plugin: {
        plugin_id: "io.molis.work.todo",
        install_id: "builtin:io.molis.work.todo",
        actor_id: LOCAL_PERSON_ACTOR_ID,
        project_id: project.project_id,
        declaration: { manifest: {} as never },
        assertActive: () => {},
      },
    }],
  ];
  for (const [label, caller] of forbiddenCallers) {
    let discovered: Awaited<ReturnType<typeof projectClient.discover>> | null = null;
    try {
      discovered = await projectClient.discover(caller);
    } catch (error) {
      assert.ok(error instanceof ActionError && (error.code === "actions.forbidden" || error.kind === "forbidden"), `${label} discover refused`);
    }
    if (discovered) {
      for (const cap of [pluginDataActions.sections.capability_id, pluginDataActions.export.capability_id]) {
        const view = discovered.find(entry => entry.capability_id === cap);
        assert.ok(!view || !view.availability.available, `${label} must not see ${cap} as available`);
      }
    }
    await assert.rejects(
      projectClient.invoke(caller, sectionsRef, {}),
      (error: unknown) => error instanceof ActionError && (error.code === "actions.forbidden" || error.kind === "forbidden"),
      `${label} refused sections`,
    );
    await assert.rejects(
      projectClient.invoke(caller, exportRef, { plugin_id: ownedId }),
      (error: unknown) => error instanceof ActionError && (error.code === "actions.forbidden" || error.kind === "forbidden"),
      `${label} refused export`,
    );
  }

  // 2. Quarantined plugin is excluded from sections discovery and refused by export.
  const homePerson: ActionCallContext = {
    actor_id: LOCAL_PERSON_ACTOR_ID,
    audience: "user",
    project_id: null,
    permissions: [PLUGIN_DATA_EXPORT_PERMISSION],
  };
  const listed = await homeClient.invoke(homePerson, sectionsRef, {}) as { sections: PluginDataSectionDeclaration[] };
  assert.equal(listed.sections.some(section => section.plugin_id === quarantinedId), false, "quarantined plugin omitted from sections");
  await assert.rejects(
    homeClient.invoke(homePerson, exportRef, { plugin_id: quarantinedId }),
    (error: unknown) => error instanceof ActionError && error.code === "host.plugin_data_not_found",
  );

  // 3. Unowned Home DB file on disk without a plugin-libraries ledger row is refused.
  const unownedDbPath = homeSqlitePath(f.home, unownedDecl.store_name);
  mkdirSync(join(f.home, unownedDecl.store_name), { recursive: true });
  {
    const db = new DatabaseSync(unownedDbPath);
    try {
      db.exec(unownedDecl.schema);
      db.prepare("INSERT INTO orphan_rows(id, body) VALUES (1, 'forged')").run();
    } finally {
      db.close();
    }
  }
  await assert.rejects(
    homeClient.invoke(homePerson, exportRef, { plugin_id: unownedId }),
    (error: unknown) => error instanceof ActionError && error.code === "actions.forbidden",
    "unowned Home DB without ledger ownership row is refused",
  );

  // 4. Ledger-owned non-partitioned Home DB without project_id column: refused under project scope, deterministic under Home scope.
  const ownedLib = await openSandboxHomeLibrary(
    f.home,
    { plugin_id: ownedId, publisher_signature: ownedManifest.publisher.signature },
    ownedDecl,
    homeStores(),
    () => {},
    { install_id: `install-${ownedId}`, installation_generation: "1" },
  );
  await ownedLib.close();
  {
    const db = new DatabaseSync(homeSqlitePath(f.home, ownedDecl.store_name));
    try {
      db.prepare("INSERT INTO p06_notes(id, label) VALUES (10, 'second'), (2, 'first')").run();
      db.prepare("INSERT INTO p06_kv(k, v) VALUES ('b', 'two'), ('a', 'one')").run();
    } finally {
      db.close();
    }
  }
  await assert.rejects(
    projectClient.invoke(basePerson, exportRef, { plugin_id: ownedId, project_id: project.project_id }),
    (error: unknown) => error instanceof ActionError && error.code === "actions.scope_mismatch",
    "non-partitioned Home table lacking project_id must fail closed under project scope",
  );
  const homeExport = await homeClient.invoke(homePerson, exportRef, { plugin_id: ownedId }) as PluginDataExportResult;
  assert.equal(homeExport.sections.length, 1);
  const items = homeExport.sections[0]!.items as Array<{ table: string; rows: Array<Record<string, unknown>> }>;
  assert.deepEqual(items.find(item => item.table === "p06_notes")?.rows.map(row => row.label), ["first", "second"]);
  assert.deepEqual(items.find(item => item.table === "p06_kv")?.rows.map(row => row.k), ["a", "b"]);

  // 5. Cross-publisher mismatch in plugin-libraries ledger is refused.
  {
    const ledgerDb = new DatabaseSync(homeSqlitePath(f.home, "plugin-libraries"));
    try {
      ledgerDb.prepare("UPDATE plugin_home_libraries SET publisher_signature = 'other-publisher' WHERE plugin_id = ?").run(ownedId);
    } finally {
      ledgerDb.close();
    }
  }
  await assert.rejects(
    homeClient.invoke(homePerson, exportRef, { plugin_id: ownedId }),
    (error: unknown) => error instanceof ActionError && error.code === "actions.forbidden",
    "cross-publisher Home DB ledger mismatch is refused",
  );
});

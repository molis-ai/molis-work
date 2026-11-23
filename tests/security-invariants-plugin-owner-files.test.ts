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

  const ownedId = "com.example.p06data";
  const unownedId = "com.example.p06unowned";
  const quarantinedId = "com.example.p06quarantined";
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

  // 6. P1-2: project-scoped export refuses Home-level owner_files for built-in Shelf, third-party Home sandbox plugins,
  //    and non-builtin execution: "host" plugins (never falling back to real homeDirectory).
  const shelfDir = join(f.home, "shelf");
  mkdirSync(shelfDir, { recursive: true });
  writeFileSync(join(shelfDir, "catalog.json"), JSON.stringify({ copies: [{ id: "cross-project-secret" }] }));
  assert.ok(
    listed.sections.some(section => section.plugin_id === "io.molis.work.shelf" && section.scope === "home"),
    "built-in Shelf without databases and with runtime.scope=home must declare home-scoped sections",
  );
  const shelfHomeExport = await homeClient.invoke(homePerson, exportRef, { plugin_id: "io.molis.work.shelf" }) as PluginDataExportResult;
  assert.ok(shelfHomeExport.sections.some(section => section.files?.some(file => file.path === "catalog.json")), "Shelf exports under Home scope");
  await assert.rejects(
    projectClient.invoke(basePerson, exportRef, { plugin_id: "io.molis.work.shelf", project_id: project.project_id }),
    (error: unknown) => error instanceof ActionError && error.code === "actions.scope_mismatch",
    "built-in Shelf Home owner_files must be refused under project scope",
  );

  const homeSandboxFilesId = "com.example.p12homesandbox";
  const hostExecFilesId = "com.example.p12hostexec";
  const multiInstallId = "com.example.p23multi";
  const projectOnlyHomeDbId = "com.example.p23projonly";
  const hardenedDbDecl: HomePluginDatabaseDeclaration = {
    store_name: "p23multi",
    version: 1,
    read_permission: "p23multi:read",
    write_permission: "p23multi:write",
    schema: "CREATE TABLE m_items (id INTEGER PRIMARY KEY, label TEXT NOT NULL);",
  };
  const projectOnlyDbDecl: HomePluginDatabaseDeclaration = {
    store_name: "p23projonly",
    version: 1,
    read_permission: "p23po:read",
    write_permission: "p23po:write",
    schema: "CREATE TABLE po_items (id INTEGER PRIMARY KEY, label TEXT NOT NULL);",
  };

  const homeSandboxFilesManifest: PluginManifest = {
    schema_version: 1, host_api_version: 1, plugin_id: homeSandboxFilesId, version: "1.0.0", name: "Home Sandbox Files",
    kind: "app", publisher: { publisher_id: "third-party", signature: "sig-home-sandbox-files" },
    entrypoints: [{ deployment: "local", entrypoint: "./plugin.mjs" }],
    permissions: [
      { permission: "storage:private", required: true, reason: "storage" },
      { permission: "owner-files:read", required: false, reason: "read" },
      { permission: "owner-files:write", required: false, reason: "write" },
    ],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    runtime: { scope: "home" },
    owner_files: { store_name: "files", entries: [{ name: "notes", kind: "directory" }], read_permission: "owner-files:read", write_permission: "owner-files:write" },
  };
  const hostExecFilesManifest: PluginManifest = {
    ...homeSandboxFilesManifest,
    plugin_id: hostExecFilesId, name: "Host Exec Forged",
    publisher: { publisher_id: "third-party", signature: "sig-host-exec-forged" },
    owner_files: { store_name: "shelf", entries: [{ name: "catalog.json", kind: "file" }], read_permission: "owner-files:read", write_permission: "owner-files:write" },
  };
  const multiActiveManifest: PluginManifest = {
    ...makeManifest(multiInstallId, "sig-multi-active", hardenedDbDecl),
    owner_files: { store_name: "files", entries: [{ name: "notes", kind: "directory" }], read_permission: "owner-files:read", write_permission: "owner-files:write" },
  };
  const multiRetainedManifest: PluginManifest = {
    ...makeManifest(multiInstallId, "sig-multi-old", hardenedDbDecl),
    version: "0.9.0",
    owner_files: { store_name: "files", entries: [{ name: "notes", kind: "directory" }], read_permission: "owner-files:read", write_permission: "owner-files:write" },
  };
  const projectOnlyManifest: PluginManifest = {
    ...makeManifest(projectOnlyHomeDbId, "sig-proj-only", projectOnlyDbDecl),
    databases: { home: projectOnlyDbDecl },
  };

  {
    const homeDb = new DatabaseSync(homeSqlitePath(f.home, "plugin-runtime"));
    try {
      const installs = new SqlitePluginRuntimeRepository(homeDb);
      const releases = new SqlitePluginRuntimeReleaseArtifactRepository(homeDb);
      const now = new Date().toISOString();
      const seedRow = (
        manifest: PluginManifest,
        opts: { installId: string; execution: "sandbox" | "host"; state: PluginInstanceRecord["state"]; retain?: boolean; updatedAt?: string },
      ) => {
        const digest = pluginManifestDigest(manifest);
        releases.save({
          plugin_id: manifest.plugin_id, publisher_signature: manifest.publisher.signature, version: manifest.version,
          manifest_digest: digest, manifest, module_source: "export default {};",
        });
        installs.save({
          install_id: opts.installId, installation_generation: "1", plugin_id: manifest.plugin_id, version: manifest.version,
          publisher_id: manifest.publisher.publisher_id, publisher_signature: manifest.publisher.signature, publisher_trust: "pinned",
          manifest_digest: digest, deployment: "local", selected_entrypoint: "./index.js", execution: opts.execution,
          state: opts.state, recovery_count: 0, last_error_code: null, grants: ["storage:private"],
          installed_at: now, updated_at: opts.updatedAt ?? now,
          uninstalled_at: opts.state === "uninstalled" ? now : null, retain_private_data: opts.retain === true,
        });
      };
      seedRow(homeSandboxFilesManifest, { installId: "install-p12-home-sandbox", execution: "sandbox", state: "running" });
      seedRow(hostExecFilesManifest, { installId: "install-p12-host-exec", execution: "host", state: "running" });
      // Active install has lexicographically EARLIER install_id than uninstalled-retained row (would be overwritten by naive ORDER BY install_id).
      seedRow(multiActiveManifest, { installId: "install-aaa-active", execution: "sandbox", state: "running", updatedAt: "2026-11-20T00:00:00.000Z" });
      seedRow(multiRetainedManifest, { installId: "install-zzz-retained", execution: "sandbox", state: "uninstalled", retain: true, updatedAt: "2026-11-21T00:00:00.000Z" });
    } finally {
      homeDb.close();
    }
    const projDb = new DatabaseSync(project.reference.storage_key);
    try {
      const installs = new SqlitePluginRuntimeRepository(projDb);
      const releases = new SqlitePluginRuntimeReleaseArtifactRepository(projDb);
      const digest = pluginManifestDigest(projectOnlyManifest);
      const now = new Date().toISOString();
      releases.save({
        plugin_id: projectOnlyManifest.plugin_id, publisher_signature: projectOnlyManifest.publisher.signature,
        version: projectOnlyManifest.version, manifest_digest: digest, manifest: projectOnlyManifest, module_source: "export default {};",
      });
      installs.save({
        install_id: "install-proj-only", installation_generation: "1", plugin_id: projectOnlyManifest.plugin_id,
        version: projectOnlyManifest.version, publisher_id: "third-party", publisher_signature: projectOnlyManifest.publisher.signature,
        publisher_trust: "pinned", manifest_digest: digest, deployment: "local", selected_entrypoint: "./index.js",
        execution: "sandbox", state: "running", recovery_count: 0, last_error_code: null, grants: ["storage:private"],
        installed_at: now, updated_at: now, uninstalled_at: null, retain_private_data: false,
      });
    } finally {
      projDb.close();
    }
  }

  // Write real Home sandbox owner_files for homeSandboxFilesId and multiInstallId.
  const hsNotesDir = join(f.home, "plugin-files", "install-p12-home-sandbox", "files", "notes");
  mkdirSync(hsNotesDir, { recursive: true });
  writeFileSync(join(hsNotesDir, "cross.txt"), "home-only-secret");
  const hsHomeExport = await homeClient.invoke(homePerson, exportRef, { plugin_id: homeSandboxFilesId }) as PluginDataExportResult;
  assert.equal(hsHomeExport.sections[0]?.files?.length, 1, "third-party Home sandbox owner_files export under Home scope");
  await assert.rejects(
    projectClient.invoke(basePerson, exportRef, { plugin_id: homeSandboxFilesId, project_id: project.project_id }),
    (error: unknown) => error instanceof ActionError && error.code === "actions.scope_mismatch",
    "third-party Home sandbox owner_files must be refused under project scope",
  );

  // Non-builtin execution: "host" plugin must never fall back to real homeDirectory under Home or project scope.
  await assert.rejects(
    homeClient.invoke(homePerson, exportRef, { plugin_id: hostExecFilesId }),
    (error: unknown) => error instanceof ActionError && error.code === "actions.forbidden",
    "non-builtin execution:host plugin must be refused under Home scope",
  );
  await assert.rejects(
    projectClient.invoke(basePerson, exportRef, { plugin_id: hostExecFilesId, project_id: project.project_id }),
    (error: unknown) => error instanceof ActionError && error.code === "actions.forbidden",
    "non-builtin execution:host plugin must be refused under project scope",
  );

  // 7. P2-3: multi-install selection prefers active over uninstalled-retained regardless of install_id order,
  //    and project-only installs cannot borrow projectPublisherSignature to access Home libraries.
  const multiLib = await openSandboxHomeLibrary(
    f.home,
    { plugin_id: multiInstallId, publisher_signature: "sig-multi-active" },
    hardenedDbDecl,
    homeStores(),
    () => {},
    { install_id: "install-aaa-active", installation_generation: "1" },
  );
  await multiLib.close();
  {
    const mdb = new DatabaseSync(homeSqlitePath(f.home, hardenedDbDecl.store_name));
    try { mdb.prepare("INSERT INTO m_items(id, label) VALUES (1, 'active-row')").run(); } finally { mdb.close(); }
  }
  const activeNotesDir = join(f.home, "plugin-files", "install-aaa-active", "files", "notes");
  const oldNotesDir = join(f.home, "plugin-files", "install-zzz-retained", "files", "notes");
  mkdirSync(activeNotesDir, { recursive: true });
  mkdirSync(oldNotesDir, { recursive: true });
  writeFileSync(join(activeNotesDir, "from-active.txt"), "active-file");
  writeFileSync(join(oldNotesDir, "from-old.txt"), "stale-file");
  const multiExport = await homeClient.invoke(homePerson, exportRef, { plugin_id: multiInstallId }) as PluginDataExportResult;
  assert.deepEqual(multiExport.sections[0]?.files?.map(file => file.path), ["notes/from-active.txt"], "active install's sandbox files win over later install_id retained row");

  const projOnlyLib = await openSandboxHomeLibrary(
    f.home,
    { plugin_id: projectOnlyHomeDbId, publisher_signature: "sig-proj-only" },
    projectOnlyDbDecl,
    homeStores(),
    () => {},
    { install_id: "install-proj-only", installation_generation: "1" },
  );
  await projOnlyLib.close();
  await assert.rejects(
    projectClient.invoke(basePerson, exportRef, { plugin_id: projectOnlyHomeDbId, project_id: project.project_id }),
    (error: unknown) => error instanceof ActionError && error.code === "actions.forbidden",
    "project-only install must not borrow projectPublisherSignature to export a Home DB",
  );

  // 8. P2-3: verifyInstalledHomeLibrary refuses hardlinks, symlinks, tampered user_version, and foreign storage space.
  const multiDbFile = homeSqlitePath(f.home, hardenedDbDecl.store_name);
  const hardCopy = join(f.home, "p23-hardlink-outside.db");
  linkSync(multiDbFile, hardCopy);
  try {
    await assert.rejects(
      homeClient.invoke(homePerson, exportRef, { plugin_id: multiInstallId }),
      (error: unknown) => error instanceof ActionError,
      "hardlinked third-party Home DB must be refused by snapshotFileStat",
    );
  } finally {
    rmSync(hardCopy, { force: true });
  }

  // Tamper PRAGMA user_version -> refused; restore -> passes.
  {
    const mdb = new DatabaseSync(multiDbFile);
    try { mdb.exec("PRAGMA user_version = 99;"); } finally { mdb.close(); }
  }
  await assert.rejects(
    homeClient.invoke(homePerson, exportRef, { plugin_id: multiInstallId }),
    (error: unknown) => error instanceof ActionError && error.code === "actions.forbidden",
    "third-party Home DB with mismatched PRAGMA user_version must be refused",
  );
  {
    const mdb = new DatabaseSync(multiDbFile);
    try { mdb.exec("PRAGMA user_version = 1;"); } finally { mdb.close(); }
  }

  // Tamper molis_storage_space -> refused; restore -> passes.
  let originalSpaceRow: { space_id: string; descriptor: string } | undefined;
  {
    const mdb = new DatabaseSync(multiDbFile);
    try {
      originalSpaceRow = mdb.prepare("SELECT space_id, descriptor FROM molis_storage_space WHERE singleton = 1").get() as { space_id: string; descriptor: string };
      const foreignSpace = { spaceId: "space_foreign_0000000000000000", kind: "local", ownerUserId: null, teamId: null, issuer: null, applicationId: null };
      mdb.prepare("UPDATE molis_storage_space SET space_id = ?, descriptor = ? WHERE singleton = 1").run(foreignSpace.spaceId, JSON.stringify(foreignSpace));
    } finally { mdb.close(); }
  }
  await assert.rejects(
    homeClient.invoke(homePerson, exportRef, { plugin_id: multiInstallId }),
    (error: unknown) => error instanceof ActionError && error.code === "actions.forbidden",
    "third-party Home DB belonging to another storage space must be refused",
  );
  {
    const mdb = new DatabaseSync(multiDbFile);
    try {
      mdb.prepare("UPDATE molis_storage_space SET space_id = ?, descriptor = ? WHERE singleton = 1")
        .run(originalSpaceRow!.space_id, originalSpaceRow!.descriptor);
    } finally { mdb.close(); }
  }

  // Replace DB file with symlink -> refused.
  const outsideTarget = join(f.home, "p23-symlink-target.db");
  fs.renameSync(multiDbFile, outsideTarget);
  symlinkSync(outsideTarget, multiDbFile);
  await assert.rejects(
    homeClient.invoke(homePerson, exportRef, { plugin_id: multiInstallId }),
    (error: unknown) => error instanceof ActionError,
    "symlinked third-party Home DB must be refused by snapshotFileStat",
  );
});

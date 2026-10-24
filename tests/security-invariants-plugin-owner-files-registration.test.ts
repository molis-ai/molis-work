import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { homeStores, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { grantOwnerFiles, ownerFileActions, ownerFilesProbe, ownerFilesProject } from "./fixtures/plugin-owner-files.js";

const libraryOf = (probe: ReturnType<typeof ownerFilesProbe>, extra: Record<string, unknown> = {}) => ({ store_name: probe.owner_files.store_name, version: 1,
  schema: "CREATE TABLE own (id TEXT);", read_permission: probe.read, write_permission: probe.write, ...extra });

/** The reasons RAC-323 adds; the others only have to refuse before anything opens. */
const REASON: Partial<Record<string, RegExp>> = { "registered-library": /里的数据库不是插件 .* 的 Manifest 声明的/u, "other-database": /不能同时用于其他插件的数据库|已归|冲突|重复/u,
  "library-file": /库自己的文件/u, "library-journal": /库自己的文件/u, "partition-directory": /库自己的文件/u };

test("SHF-IO-S01 all trusted declaration failures precede managed Home stores", () => {
  for (const invalid of ["shelf-owner", "registered-library", "other-database", "library-file", "library-journal", "partition-directory", "duplicate-store", "no-home", "project", "sandbox", "permission", "storage", "root", "empty", "duplicate-name", "nested-name", "kind"] as const) {
    const home = mkdtempSync(join(tmpdir(), "owner-files-entry-")), probe = ownerFilesProbe(), good = ownerFilesProbe("goodowner"), thief = ownerFilesProbe("thiefowner");
    const entry = probe.entry();
    if (invalid === "shelf-owner") Object.assign(probe.owner_files, { store_name: "shelf" });
    if (invalid === "registered-library") {
      const existing = homeStores().stores.find(store => store.library)!;
      Object.assign(probe.owner_files, { store_name: existing.path });
      probe.definition.manifest = { ...probe.definition.manifest, plugin_id: existing.owner };
    }
    // Another plugin's library in the root, however it got there, is refused; the plugin's own is not (RAC-323).
    if (invalid === "other-database") thief.definition.manifest = { ...thief.definition.manifest, databases: { home: libraryOf(probe, { read_permission: thief.read, write_permission: thief.write }) } };
    if (invalid === "library-file" || invalid === "library-journal" || invalid === "partition-directory") {
      probe.definition.manifest = { ...probe.definition.manifest, databases: { home: libraryOf(probe, invalid === "partition-directory" ? { partition: "project" } : {}) } };
      Object.assign(probe.owner_files, { entries: [{ name: { "library-file": `${probe.owner_files.store_name}.db`, "library-journal": `${probe.owner_files.store_name}.db-wal`, "partition-directory": "projects" }[invalid], kind: invalid === "partition-directory" ? "directory" : "file" }] });
    }
    if (invalid === "sandbox") probe.definition.execution = "sandbox";
    if (invalid === "permission" || invalid === "storage") probe.definition.manifest = { ...probe.definition.manifest,
      permissions: probe.definition.manifest.permissions.filter(permission => permission.permission !== (invalid === "permission" ? probe.write : "storage:private")) };
    if (invalid === "root") Object.assign(probe.owner_files, { store_name: "../outside" });
    if (invalid === "empty") Object.assign(probe.owner_files, { entries: [] });
    if (invalid === "duplicate-name") Object.assign(probe.owner_files, { entries: [{ name: "same", kind: "file" }, { name: "same", kind: "directory" }] });
    if (invalid === "nested-name") Object.assign(probe.owner_files, { entries: [{ name: "parent/child", kind: "file" }] });
    if (invalid === "kind") Object.assign(probe.owner_files.entries[0]!, { kind: "socket" });
    const entries = [good.entry(), entry, ...(invalid === "other-database" ? [thief.entry()] : []), ...(invalid === "duplicate-store" ? [{ ...entry, definition: { ...probe.definition } }] : [])];
    try {
      assert.throws(() => new MolisWorkLocalHost({ ...(invalid === "no-home" ? {} : { homeDirectory: home }), completeText: null,
        pluginFixtures: invalid === "project" ? { home: [good.entry()], project: [entry] } : { home: entries } }), REASON[invalid], invalid);
      assert.equal(good.contexts.length, 0, invalid); assert.equal(probe.contexts.length, 0, invalid); assert.equal(thief.contexts.length, 0, invalid);
      assert.deepEqual(readdirSync(home), [], `${invalid}: even the Home runtime store was not opened`);
    } finally { rmSync(home, { recursive: true, force: true }); }
  }
});

test("RAC-323 a root may hold the plugin's own library: a plugin whose Manifest declares both, in the same store, starts, and its files and library are apart", async t => {
  const probe = ownerFilesProbe();
  probe.definition.manifest = { ...probe.definition.manifest, databases: { home: libraryOf(probe) } };
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  await grantOwnerFiles(host, probe);
  const run = ownerFileActions(host, probe);
  await run.write(writer => writer.writeFile("catalog.json", Buffer.from("beside the library"), "create"));
  const root = join(home, probe.owner_files.store_name);
  assert.equal(readFileSync(join(root, "catalog.json"), "utf8"), "beside the library");
  assert.ok(existsSync(join(root, `${probe.owner_files.store_name}.db`)), "the library is in the same root");
  assert.ok(probe.contexts.at(-1)!.services?.database, "and it has its library too");
  await assert.rejects(run.write(writer => writer.writeFile(`${probe.owner_files.store_name}.db`, Buffer.from("bad"), "replace")), "the library's file is not one of its declared entries");
});

for (const first of ["home", "project"] as const) {
  test(`SHF-IO-S01 ${first}-first configuration rejects same-id different-definition cross-scope entries before either can start`, () => {
    const home = mkdtempSync(join(tmpdir(), "owner-files-cross-scope-")), owner = ownerFilesProbe("sharedroot"), project = ownerFilesProbe("sharedroot", "project");
    const fixtures = first === "home" ? { home: [owner.entry()], project: [project.entry()] } : { project: [project.entry()], home: [owner.entry()] };
    try {
      assert.equal(owner.definition.manifest.plugin_id, project.definition.manifest.plugin_id);
      assert.notEqual(owner.definition, project.definition);
      assert.throws(() => new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: fixtures }), /不能同时在 Home 与项目|不能声明/u);
      assert.equal(project.contexts.length, 0); assert.equal(owner.contexts.length, 0); assert.deepEqual(readdirSync(home), []);
    } finally { rmSync(home, { recursive: true, force: true }); }
  });
}

test("SHF-IO-S01 unrelated same-id cross-scope entries retain the original scope rejection", () => {
  const home = mkdtempSync(join(tmpdir(), "owner-files-scope-id-")), owner = ownerFilesProbe("scopeid"), project = ownerFilesProbe("scopeid", "project");
  try {
    assert.throws(() => new MolisWorkLocalHost({ homeDirectory: home, completeText: null,
      pluginFixtures: { home: [owner.entry()], project: [{ definition: project.withoutFiles() }] } }), /不能同时在 Home 与项目/u);
    assert.deepEqual(readdirSync(home), []);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("SHF-IO-S01 deep-frozen declaration cannot be retargeted after trusted startup", async t => {
  const probe = ownerFilesProbe();
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  await host.homePlugins!.ready();
  Object.assign(probe.owner_files.entries[0]!, { name: "outside.json" });
  Object.assign(probe.owner_files, { store_name: "outside", entries: [{ name: "changed", kind: "directory" }], write_permission: probe.read });
  await grantOwnerFiles(host, probe);
  const run = ownerFileActions(host, probe);
  await run.write(writer => writer.replaceFileAtomic("catalog.json", Buffer.from("original")));
  assert.equal(await run.read(client => Buffer.from(client.read("catalog.json")!).toString()), "original");
  await assert.rejects(run.write(writer => writer.writeFile("outside.json", Buffer.from("bad"), "create")));
  assert.equal(existsSync(join(home, "outside")), false);
  assert.equal(readFileSync(join(home, "ownerprobe", "catalog.json"), "utf8"), "original");
});

test("SHF-IO-S07 actual project platform refuses ownerFiles declarations and ordinary project/Home definitions receive no service", async t => {
  const home = mkdtempSync(join(tmpdir(), "owner-files-project-")), probe = ownerFilesProbe("project-owner", "project");
  const project = ownerFilesProject(home, probe);
  t.after(async () => { await project.close(); rmSync(home, { recursive: true, force: true }); });
  await assert.rejects(project.platform.start([probe.entry()]), /项目插件/u);
  assert.equal(probe.contexts.length, 0); assert.equal(existsSync(join(home, probe.owner_files.store_name)), false);
  const bare = ownerFilesProbe("project-owner", "project");
  assert.deepEqual((await project.platform.start([{ definition: bare.withoutFiles() }])).running, [bare.id]);
  assert.equal(bare.contexts.at(-1)!.services?.ownerFiles, undefined);
  const plain = ownerFilesProbe("plainowner"), { host } = await serveHomeRuntime(t, { pluginFixtures: { home: [plain.withoutFiles()] } });
  await host.homePlugins!.ready(); assert.equal(plain.contexts.at(-1)!.services?.ownerFiles, undefined);
});

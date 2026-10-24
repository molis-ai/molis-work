import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { homeStores, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import type { PluginFilesDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { filesProbe, filesProject } from "./fixtures/plugin-files.js";
import { grantOwnerFiles, ownerFileActions, ownerFilesProbe } from "./fixtures/plugin-owner-files.js";

test("SHF-IO-S01 all trusted declaration failures precede managed Home stores and all seeds", () => {
  for (const invalid of ["shelf-owner", "registered-library", "database", "old-files", "duplicate-store", "no-home", "project", "sandbox", "permission", "storage", "initializer-only", "root", "empty", "duplicate-name", "nested-name", "kind"] as const) {
    const home = mkdtempSync(join(tmpdir(), "owner-files-entry-")), probe = ownerFilesProbe(), good = ownerFilesProbe("goodowner");
    let seeds = 0;
    const entry = probe.entry(() => { seeds++; });
    let files: PluginFilesDeclaration | undefined;
    if (invalid === "shelf-owner") Object.assign(probe.owner_files, { store_name: "shelf" });
    if (invalid === "registered-library") {
      const existing = homeStores().stores.find(store => store.library)!;
      Object.assign(probe.owner_files, { store_name: existing.path });
      probe.definition.manifest = { ...probe.definition.manifest, plugin_id: existing.owner };
    }
    if (invalid === "database") probe.definition.manifest = { ...probe.definition.manifest, databases: { home: { store_name: probe.owner_files.store_name, version: 1,
      schema: "CREATE TABLE own (id TEXT);", read_permission: probe.read, write_permission: probe.write } } };
    if (invalid === "old-files") files = { store_name: probe.owner_files.store_name, directory: "assets", max_file_bytes: 64, read_permission: probe.read, write_permission: probe.write };
    if (invalid === "sandbox") probe.definition.execution = "sandbox";
    if (invalid === "permission" || invalid === "storage") probe.definition.manifest = { ...probe.definition.manifest,
      permissions: probe.definition.manifest.permissions.filter(permission => permission.permission !== (invalid === "permission" ? probe.write : "storage:private")) };
    if (invalid === "root") Object.assign(probe.owner_files, { store_name: "../outside" });
    if (invalid === "empty") Object.assign(probe.owner_files, { entries: [] });
    if (invalid === "duplicate-name") Object.assign(probe.owner_files, { entries: [{ name: "same", kind: "file" }, { name: "same", kind: "directory" }] });
    if (invalid === "nested-name") Object.assign(probe.owner_files, { entries: [{ name: "parent/child", kind: "file" }] });
    if (invalid === "kind") Object.assign(probe.owner_files.entries[0]!, { kind: "socket" });
    const bad = invalid === "initializer-only" ? { definition: probe.withoutFiles(), initialize_owner_files: () => { seeds++; } } : { ...entry, files };
    const entries = [good.entry(() => { seeds++; }), bad, ...(invalid === "duplicate-store" ? [{ ...entry, definition: { ...probe.definition } }] : [])];
    try {
      assert.throws(() => new MolisWorkLocalHost({ ...(invalid === "no-home" ? {} : { homeDirectory: home }), completeText: null,
        pluginFixtures: invalid === "project" ? { home: [good.entry(() => { seeds++; })], project: [bad] } : { home: entries } }), undefined, invalid);
      assert.equal(seeds, 0, invalid); assert.equal(good.contexts.length, 0, invalid); assert.equal(probe.contexts.length, 0, invalid);
      assert.deepEqual(readdirSync(home), [], `${invalid}: even the Home runtime store was not opened`);
    } finally { rmSync(home, { recursive: true, force: true }); }
  }
});

for (const first of ["home", "project"] as const) {
  test(`SHF-IO-S01 ${first}-first configuration rejects same-id different-definition cross-scope shared roots before either can start`, () => {
    const home = mkdtempSync(join(tmpdir(), "owner-files-cross-scope-")), owner = ownerFilesProbe("sharedroot"), project = filesProbe("sharedroot", "project");
    const oldFiles = { ...project.files, store_name: owner.owner_files.store_name };
    let seeds = 0;
    const fixtures = first === "home" ? { home: [owner.entry(() => { seeds++; })], project: [{ definition: project.definition, files: oldFiles }] }
      : { project: [{ definition: project.definition, files: oldFiles }], home: [owner.entry(() => { seeds++; })] };
    try {
      assert.equal(owner.definition.manifest.plugin_id, project.definition.manifest.plugin_id);
      assert.notEqual(owner.definition, project.definition);
      assert.throws(() => new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: fixtures }), /不能同时用于数据库或旧文件服务/u);
      assert.equal(seeds, 0); assert.equal(project.contexts.length, 0); assert.deepEqual(readdirSync(home), []);
    } finally { rmSync(home, { recursive: true, force: true }); }
  });
}

test("SHF-IO-S01 unrelated same-id cross-scope entries retain the original scope rejection", () => {
  const home = mkdtempSync(join(tmpdir(), "owner-files-scope-id-")), owner = ownerFilesProbe("scopeid"), project = filesProbe("scopeid", "project");
  try {
    assert.throws(() => new MolisWorkLocalHost({ homeDirectory: home, completeText: null,
      pluginFixtures: { home: [owner.entry()], project: [{ definition: project.definition, files: { ...project.files, store_name: "other-root" } }] } }), /不能同时在 Home 与项目/u);
    assert.deepEqual(readdirSync(home), []);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("SHF-IO-S01 deep-frozen declaration and initialization binding cannot be retargeted after trusted startup", async t => {
  const probe = ownerFilesProbe(), calls: string[] = [];
  const entry = probe.entry(writer => { calls.push("original"); writer.replaceFileAtomic("catalog.json", Buffer.from("original initializer")); });
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [entry] } });
  await host.homePlugins!.ready();
  Object.assign(probe.owner_files.entries[0]!, { name: "outside.json" });
  Object.assign(probe.owner_files, { store_name: "outside", entries: [{ name: "changed", kind: "directory" }], write_permission: probe.read });
  Object.assign(entry, { initialize_owner_files: () => { calls.push("changed"); } });
  await grantOwnerFiles(host, probe);
  const run = ownerFileActions(host, probe);
  assert.equal(await run.read(client => Buffer.from(client.read("catalog.json")!).toString()), "original initializer");
  await assert.rejects(run.write(writer => writer.writeFile("outside.json", Buffer.from("bad"), "create")));
  assert.deepEqual(calls, ["original"]); assert.equal(existsSync(join(home, "outside")), false);
  assert.equal(readFileSync(join(home, "ownerprobe", "catalog.json"), "utf8"), "original initializer");
});

test("SHF-IO-S07 actual project platform refuses ownerFiles declarations and ordinary project/Home definitions receive no service", async t => {
  const home = mkdtempSync(join(tmpdir(), "owner-files-project-")), old = filesProbe("project-owner", "project"), probe = ownerFilesProbe("project-owner", "project");
  const project = filesProject(home, old);
  t.after(async () => { await project.close(); rmSync(home, { recursive: true, force: true }); });
  await assert.rejects(project.platform.start([probe.entry()]), /项目插件/u);
  assert.equal(probe.contexts.length, 0); assert.equal(existsSync(join(home, probe.owner_files.store_name)), false);
  const bare = ownerFilesProbe("project-owner", "project");
  assert.deepEqual((await project.platform.start([{ definition: bare.withoutFiles() }])).running, [bare.id]);
  assert.equal(bare.contexts.at(-1)!.services?.ownerFiles, undefined);
  const plain = ownerFilesProbe("plainowner"), { host } = await serveHomeRuntime(t, { pluginFixtures: { home: [plain.withoutFiles()] } });
  await host.homePlugins!.ready(); assert.equal(plain.contexts.at(-1)!.services?.ownerFiles, undefined);
});

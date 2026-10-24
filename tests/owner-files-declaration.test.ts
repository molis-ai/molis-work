import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { SHELF_OWNER_FILES } from "@molis-ai/molis-work-plugin-shelf";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { ownerFilesProbe } from "./fixtures/plugin-owner-files.js";

// specs/repository-anti-corruption/slices/pg022-manifest-declarations.md, P2a: a plugin's files in the Home are declared in its
// Manifest (`owner_files`) and nowhere else.

const FILES = { store_name: "notes", entries: [{ name: "catalog.json", kind: "file" }, { name: "documents", kind: "directory" }], read_permission: "notes:read", write_permission: "notes:write" };
const manifest = (owner_files: unknown, permissions = ["storage:private", "notes:read", "notes:write"]) => ({
  schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.notes-probe", version: "0.1.0", name: "Notes", kind: "native",
  publisher: { publisher_id: "example", signature: "publisher-a" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
  permissions: permissions.map(permission => ({ permission, required: true, reason: "自己的文件" })),
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
  ...(owner_files === undefined ? {} : { owner_files }),
});

test("RAC-309 the Manifest's owner_files declare a store name, top-level entries that are single names, and permissions the Manifest holds", () => {
  assert.deepEqual(parsePluginManifest(manifest(FILES)).owner_files, FILES);
  assert.equal(parsePluginManifest(manifest(undefined)).owner_files, undefined);
  for (const [declared, mentions, permissions] of [
    [[], /owner_files 必须为对象/u],
    [{ ...FILES, quota: 1 }, /owner_files 不认这些字段：quota/u],
    [{ ...FILES, store_name: "Notes" }, /owner_files\.store_name/u],
    [{ ...FILES, store_name: "../notes" }, /owner_files\.store_name/u],
    [{ ...FILES, entries: [] }, /至少要有一个顶层条目/u],
    [{ ...FILES, entries: "documents" }, /至少要有一个顶层条目/u],
    [{ ...FILES, entries: [{ name: "a/b", kind: "file" }] }, /单段名字/u],
    [{ ...FILES, entries: [{ name: "..", kind: "directory" }] }, /单段名字/u],
    [{ ...FILES, entries: [{ name: "same", kind: "file" }, { name: "same", kind: "directory" }] }, /互不相同/u],
    [{ ...FILES, entries: [{ name: "socket", kind: "socket" }] }, /kind 只能是 file 或 directory/u],
    [{ ...FILES, entries: [{ name: "x", kind: "file", mode: 0o777 }] }, /只能有 name 和 kind/u],
    [{ ...FILES, read_permission: "notes:elsewhere" }, /owner_files\.read_permission/u],
    [{ ...FILES, write_permission: undefined }, /owner_files\.write_permission/u],
    [FILES, /需要这份 Manifest 在 permissions 里声明 storage:private/u, ["notes:read", "notes:write"]],
  ] as const) assert.throws(() => parsePluginManifest(manifest(declared, permissions as string[] | undefined)), mentions, JSON.stringify(declared));
});

test("RAC-310 Shelf's files are its Manifest's owner_files: its registration names none, and it is the only shipped plugin that declares any", () => {
  const shelf = BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === "io.molis.work.shelf")!;
  assert.equal(shelf.manifest.owner_files, SHELF_OWNER_FILES);
  assert.equal("owner_files" in (shelf.runtime ?? {}), false, "the registration carries no files of its own");
  assert.deepEqual(BUILTIN_PLUGIN_CATALOG.filter(entry => entry.manifest.owner_files).map(entry => entry.manifest.plugin_id), ["io.molis.work.shelf"]);
  assert.equal(readFileSync(new URL("../apps/local-host/src/plugin-owner-files-entries.ts", import.meta.url), "utf8").includes("readonly owner_files?"), false,
    "the start entry type does not either");
});

test("RAC-308 a definition that declares owner_files and is not on the Host's start list is refused to start with its own code, and reads and writes nothing", async t => {
  const listed = ownerFilesProbe("listedowner"), beside = ownerFilesProbe("besideowner"), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [listed.entry()] } });
  const platform = await host.homePlugins!.ready();
  const { install } = platform.runtime.install({ definition: beside.definition, deployment: "local", grants: beside.permissions });
  await assert.rejects(platform.runtime.start(install.install_id), /启动失败/u);
  assert.equal(beside.contexts.length, 0, "its code never ran");
  assert.equal(platform.runtime.get(install.install_id).last_error_code, "plugin.declaration_invalid", "not the Runtime's generic executor failure");
  assert.equal(existsSync(`${home}/${beside.owner_files.store_name}`), false);
});

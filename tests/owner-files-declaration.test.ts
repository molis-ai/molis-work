import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { IMAGES_OWNER_FILES, imagesActions, imagesManifest } from "@molis-ai/molis-work-plugin-images";
import { SHELF_OWNER_FILES, createShelfPlugin } from "@molis-ai/molis-work-plugin-shelf";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { DEMO_PROJECT_ID, LocalProjectDatabase, createPluginPlatform, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { pluginActions } from "./fixtures/plugin-actions.js";
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

test("RAC-310 Shelf's and Images' files are their Manifests' owner_files: their registrations name none, and they are the only shipped plugins that declare any", () => {
  const shelf = BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === "io.molis.work.shelf")!;
  assert.equal(shelf.manifest.owner_files, SHELF_OWNER_FILES);
  assert.equal("owner_files" in (shelf.runtime ?? {}), false, "the registration carries no files of its own");
  const images = BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === "io.molis.work.images")!;
  assert.equal(images.manifest.owner_files, IMAGES_OWNER_FILES);
  assert.equal("files" in (images.runtime ?? {}), false, "and no start entry of its own either");
  assert.deepEqual(BUILTIN_PLUGIN_CATALOG.filter(entry => entry.manifest.owner_files).map(entry => entry.manifest.plugin_id).sort(), ["io.molis.work.images", "io.molis.work.shelf"]);
  assert.equal(readFileSync(new URL("../apps/local-host/src/plugin-owner-files-entries.ts", import.meta.url), "utf8").includes("readonly owner_files?"), false,
    "the start entry type does not either");
});

test("RAC-308 a definition that declares owner_files and is not on the Host's start list is refused to start with its own code, and reads and writes nothing", async t => {
  const listed = ownerFilesProbe("listedowner"), beside = ownerFilesProbe("besideowner"), installed = new Set([beside.definition]);
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [listed.entry()], installed } });
  const platform = await host.homePlugins!.ready();
  const { install } = platform.runtime.install({ trust: { level: "unsigned" }, definition: beside.definition, deployment: "local", grants: beside.permissions });
  await assert.rejects(platform.runtime.start(install.install_id), /启动失败/u);
  assert.equal(beside.contexts.length, 0, "its code never ran");
  assert.equal(platform.runtime.get(install.install_id).last_error_code, "plugin.declaration_invalid", "not the Runtime's generic executor failure");
  assert.equal(existsSync(`${home}/${beside.owner_files.store_name}`), false);
});

test("RAC-322 a project's platform with no Home does not refuse the shipped Shelf's project half, which shares the Manifest's owner_files and is given none; a project plugin that is not a dual-instance half and declares them is refused", async () => {
  const directory = mkdtempSync(join(tmpdir(), "owner-files-no-home-"));
  const file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const platformWithoutHome = () => createPluginPlatform({ actions: pluginActions(store, DEMO_PROJECT_ID), project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    ui: new UiHost(), privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }), home: null });
  try {
    const shelf = createShelfPlugin();
    assert.deepEqual(shelf.manifest.owner_files, SHELF_OWNER_FILES, "the project half carries the declaration the Home half does");
    // The bare platform here has no Host capabilities, so Shelf's actions are not redeemed and it does not run; the list check is
    // what this is about: it is not refused as a project plugin that declares files.
    const report = await platformWithoutHome().start([{ definition: shelf, trust: { level: "host" } }]);
    assert.deepEqual(report.failed.filter(entry => entry.code === "plugin.declaration_invalid"), []);
    const imposter = ownerFilesProbe("noHomeOwner");
    await assert.rejects(platformWithoutHome().start([{ definition: imposter.definition }]), /不能声明.*主人文件服务/u);
    assert.equal(imposter.contexts.length, 0, "it never ran");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("RAC-327 there is no host start hook for initial files: Shelf puts its sample on a new shelf in its own start, and no registration, entry type or contract names the hook", () => {
  const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  for (const file of ["apps/local-host/src/plugin-owner-files-entries.ts", "apps/local-host/src/plugin-platform.ts", "apps/local-host/src/home-plugins.ts",
    "apps/local-host/src/home-plugin-executor.ts", "packages/contracts/src/platform/plugin-registration.ts", "packages/plugin-runtime/src/owner-files-service.ts",
    "plugins/native/shelf/src/registration.ts"]) {
    assert.doesNotMatch(source(file), /initialize_owner_files|initializeTrusted/u, file);
  }
  assert.match(source("plugins/native/shelf/src/home-plugin.ts"), /files\.write\(initializeShelfFiles\)/u, "Shelf's own start writes the sample");
  // The sample appears on the first start and not again after the person removed it: tests/shelf-owner-files.test.ts, "the first start writes the sample".
});

test("RAC-328 Images' generated images are written through ownerFiles under a required images:files:write: jobs.start is version 3 and jobs.delete version 2, both carry it, and no second files service is left", () => {
  const permission = imagesManifest.permissions.find(item => item.permission === "images:files:write");
  assert.equal(permission?.required, true, "without it a job cannot save its images, so it is not one the person can leave out");
  assert.deepEqual(imagesManifest.owner_files, { store_name: "images", entries: [{ name: "assets", kind: "directory" }], read_permission: "images:read", write_permission: "images:files:write" });
  assert.equal(imagesActions.start.version, 3); assert.equal(imagesActions.delete.version, 2);
  for (const action of [imagesActions.start, imagesActions.delete]) assert.ok(action.action.permissions.includes("images:files:write"), action.capability_id);
  for (const [name, action] of Object.entries(imagesActions)) {
    if (action !== imagesActions.start && action !== imagesActions.delete) assert.equal(action.action.permissions.includes("images:files:write"), false, `${name} writes no files`);
  }
  const contract = readFileSync(new URL("../packages/contracts/src/platform/plugin-host-services.ts", import.meta.url), "utf8");
  assert.doesNotMatch(contract, /PluginFilesClient|\bfiles\?:/u, "the services a plugin is given have one files service");
  assert.equal(existsSync(new URL("../apps/local-host/src/plugin-files.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../packages/contracts/src/platform/plugin-files.ts", import.meta.url)), false);
});

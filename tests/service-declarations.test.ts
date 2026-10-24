import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { JELLY_MODEL_CONFIGURATION } from "@molis-ai/molis-work-plugin-jelly";
import { IMAGES_IMAGE_GENERATION } from "@molis-ai/molis-work-plugin-images";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { ownerFilesProbe, ownerFilesProject } from "./fixtures/plugin-owner-files.js";

// specs/repository-anti-corruption/slices/pg022-manifest-declarations.md, P3: a plugin's model settings and image connections are
// declared in its Manifest (`model_configuration`, `image_generation`) and nowhere else.

const MODEL = { preference: { store_name: "notes", file_name: "preferences.json" }, custom_provider: { provider_id: "notes-text", display_name: "Notes 模型" },
  actions: { read: { capability_id: "notes.model.settings", version: 1 }, save: { capability_id: "notes.model.configure", version: 1 } } };
const IMAGES = { store_name: "notes", read_permission: "notes:read", write_permission: "notes:write", generate_permission: "notes:generate" };
const manifest = (extra: Record<string, unknown>, permissions = ["storage:private", "model:invoke", "notes:read", "notes:write", "notes:generate"]) => ({
  schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.notes-probe", version: "0.1.0", name: "Notes", kind: "native",
  publisher: { publisher_id: "example", signature: "publisher-a" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
  permissions: permissions.map(permission => ({ permission, required: true, reason: "自己的设置" })),
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, ...extra,
});

test("RAC-311 the Manifest's model_configuration and image_generation declare their store, names, actions and the permissions the Manifest holds", () => {
  assert.deepEqual(parsePluginManifest(manifest({ model_configuration: MODEL })).model_configuration, MODEL);
  assert.deepEqual(parsePluginManifest(manifest({ image_generation: IMAGES })).image_generation, IMAGES);
  assert.equal(parsePluginManifest(manifest({})).model_configuration, undefined);
  for (const [extra, mentions, permissions] of [
    [{ model_configuration: [] }, /model_configuration 必须为对象/u],
    [{ model_configuration: { ...MODEL, quota: 1 } }, /model_configuration 不认这些字段：quota/u],
    [{ model_configuration: { ...MODEL, preference: { store_name: "Notes", file_name: "preferences.json" } } }, /model_configuration\.preference/u],
    [{ model_configuration: { ...MODEL, preference: { store_name: "notes", file_name: "../preferences.json" } } }, /model_configuration\.preference/u],
    [{ model_configuration: { ...MODEL, custom_provider: { provider_id: "Notes", display_name: "x" } } }, /model_configuration\.custom_provider/u],
    [{ model_configuration: { ...MODEL, custom_provider: { provider_id: "notes-text", display_name: "  " } } }, /model_configuration\.custom_provider/u],
    [{ model_configuration: { ...MODEL, actions: { read: MODEL.actions.read } } }, /model_configuration\.actions\.save/u],
    [{ model_configuration: { ...MODEL, actions: { ...MODEL.actions, read: { capability_id: "notes.model.settings", version: 0 } } } }, /model_configuration\.actions\.read/u],
    [{ model_configuration: MODEL }, /model_configuration 需要这份 Manifest 在 permissions 里声明 model:invoke/u, ["storage:private"]],
    [{ model_configuration: MODEL }, /model_configuration 需要这份 Manifest 在 permissions 里声明 storage:private/u, ["model:invoke"]],
    [{ image_generation: "images" }, /image_generation 必须为对象/u],
    [{ image_generation: { ...IMAGES, bucket: "x" } }, /image_generation 不认这些字段：bucket/u],
    [{ image_generation: { ...IMAGES, store_name: "../images" } }, /image_generation\.store_name/u],
    [{ image_generation: { ...IMAGES, generate_permission: "notes:elsewhere" } }, /image_generation\.generate_permission/u],
    [{ image_generation: { ...IMAGES, read_permission: undefined } }, /image_generation\.read_permission/u],
    [{ image_generation: IMAGES }, /image_generation 需要这份 Manifest 在 permissions 里声明 model:invoke/u, ["notes:read", "notes:write", "notes:generate"]],
  ] as const) assert.throws(() => parsePluginManifest(manifest(extra, permissions as string[] | undefined)), mentions, JSON.stringify(extra));
});

test("RAC-312 Jelly's model settings and Images' image connections are their own Manifests' declarations: no registration names them", () => {
  const find = (id: string) => BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === id)!;
  assert.equal(find("io.molis.work.jelly").manifest.model_configuration, JELLY_MODEL_CONFIGURATION);
  assert.equal(find("io.molis.work.images").manifest.image_generation, IMAGES_IMAGE_GENERATION);
  assert.deepEqual(BUILTIN_PLUGIN_CATALOG.filter(entry => entry.manifest.model_configuration).map(entry => entry.manifest.plugin_id), ["io.molis.work.jelly"]);
  assert.deepEqual(BUILTIN_PLUGIN_CATALOG.filter(entry => entry.manifest.image_generation).map(entry => entry.manifest.plugin_id), ["io.molis.work.images"]);
  for (const entry of BUILTIN_PLUGIN_CATALOG) {
    for (const field of ["model_configuration", "image_generation"]) assert.equal(field in (entry.runtime ?? {}), false, `${entry.manifest.plugin_id}: runtime.${field}`);
  }
});

/** The same definition whose Manifest also asks for `extra`, with the `model:invoke` permission both of them need. */
const declaring = (definition: PluginDefinition, extra: Record<string, unknown>): PluginDefinition => ({ ...definition, manifest: { ...definition.manifest, ...extra,
  permissions: [...definition.manifest.permissions, { permission: "model:invoke", required: false, reason: "用模型" }] } });

test("RAC-313 a definition that declares model settings or image connections and is not on the Host's start list is refused to start with its own code", async t => {
  const listed = ownerFilesProbe("listedset"), { host } = await serveHomeRuntime(t, { pluginFixtures: { home: [listed.entry()] } });
  const platform = await host.homePlugins!.ready();
  for (const [name, what] of [["besidemodel", "model_configuration"], ["besideimages", "image_generation"]] as const) {
    const beside = ownerFilesProbe(name), own = { ...MODEL, preference: { ...MODEL.preference, store_name: name } };
    const extra = what === "model_configuration" ? { model_configuration: own }
      : { image_generation: { store_name: name, read_permission: beside.read, write_permission: beside.write, generate_permission: beside.write } };
    const definition = declaring(beside.withoutFiles(), extra);
    const { install } = platform.runtime.install({ definition, deployment: "local", grants: [...beside.permissions, "model:invoke"] });
    await assert.rejects(platform.runtime.start(install.install_id), /启动失败/u, name);
    assert.equal(beside.contexts.length, 0, `${name}: its code never ran`);
    assert.equal(platform.runtime.get(install.install_id).last_error_code, "plugin.declaration_invalid", name);
  }
});

test("RAC-314 a project plugin that declares model settings or image connections is refused, so none is left without the service it asked for", async t => {
  const home = mkdtempSync(join(tmpdir(), "service-declarations-")), old = ownerFilesProbe("project-set", "project");
  const project = ownerFilesProject(home, old);
  t.after(async () => { await project.close(); rmSync(home, { recursive: true, force: true }); });
  for (const [what, extra] of [["model settings", { model_configuration: MODEL }], ["image connections", { image_generation: IMAGES }]] as const) {
    await assert.rejects(project.platform.start([{ definition: declaring(old.withoutFiles(), extra) }]), /项目插件.*不能声明/u, what);
  }
  assert.equal(old.contexts.length, 0);
});

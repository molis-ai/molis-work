import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { defineSettingsActions, parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { IMAGES_IMAGE_GENERATION } from "@molis-ai/molis-work-plugin-images";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { ownerFilesProbe, ownerFilesProject } from "./fixtures/plugin-owner-files.js";

// specs/archive/repository-anti-corruption/slices/pg022-manifest-declarations.md, P3: a plugin's image connections are declared in its
// Manifest (`image_generation`) and nowhere else. A Manifest's own model choice (`settings_entries.model_configuration`) was retired with its
// last owner (Jelly, batch 112-2): a Home package's model settings are derived from `effects.modelSettings` (BL-491).

const IMAGES = { store_name: "notes", read_permission: "notes:read", write_permission: "notes:write", generate_permission: "notes:generate" };
const manifest = (extra: Record<string, unknown>, permissions = ["storage:private", "model:invoke", "notes:read", "notes:write", "notes:generate"]) => ({
  schema_version: 1, host_api_version: 1, plugin_id: "io.molis.work.notes-probe", version: "0.1.0", name: "Notes", kind: "native",
  publisher: { publisher_id: "example", signature: "publisher-a" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
  permissions: permissions.map(permission => ({ permission, required: true, reason: "自己的设置" })),
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, ...extra,
});
const settings = defineSettingsActions({ scope: "home",
  read: { capability_id: "probe.preferences.read", version: 1, title: "读取", description: "读取偏好", permissions: ["storage:private"] },
  write: { capability_id: "probe.preferences.write", version: 1, title: "保存", description: "保存偏好", permissions: ["storage:private"] },
});
/** A Home personal setting of its own, declared the ordinary way; `beside` adds members next to `entries`, `read` and `write`. */
const preferences = (beside: Record<string, unknown> = {}) => ({ actions: [settings.read, settings.write], settings_entries: {
  entries: [{ key: "probe.model", title: { key: "common.save" }, layers: ["personal"], schema: { type: "object", additionalProperties: false,
    required: ["provider_id", "model_id"], properties: { provider_id: { type: "string" }, model_id: { type: "string" } } } }],
  read: { capability_id: settings.read.capability_id, version: 1 }, write: { capability_id: settings.write.capability_id, version: 1 }, ...beside } });

test("RAC-311 the Manifest's image_generation declares its store, names and the permissions the Manifest holds; settings no longer carry a model choice of their own", () => {
  assert.deepEqual(parsePluginManifest(manifest({ image_generation: IMAGES })).image_generation, IMAGES);
  assert.ok(parsePluginManifest(manifest(preferences())).settings_entries, "a model choice kept as an ordinary setting still parses");
  const retired = { key: "probe.model", preference: { store_name: "notes", file_name: "preferences.json" }, custom_provider: { provider_id: "notes-text", display_name: "Notes 模型" },
    actions: { read: settings.read, save: settings.write } };
  assert.throws(() => parsePluginManifest(manifest(preferences({ model_configuration: retired }))), /settings_entries\.model_configuration/u);
  for (const [extra, mentions, permissions] of [
    [{ image_generation: "images" }, /image_generation 必须为对象/u],
    [{ image_generation: { ...IMAGES, bucket: "x" } }, /image_generation 不认这些字段：bucket/u],
    [{ image_generation: { ...IMAGES, store_name: "../images" } }, /image_generation\.store_name/u],
    [{ image_generation: { ...IMAGES, generate_permission: "notes:elsewhere" } }, /image_generation\.generate_permission/u],
    [{ image_generation: { ...IMAGES, read_permission: undefined } }, /image_generation\.read_permission/u],
    [{ image_generation: IMAGES }, /image_generation 需要这份 Manifest 在 permissions 里声明 model:invoke/u, ["notes:read", "notes:write", "notes:generate"]],
  ] as const) assert.throws(() => parsePluginManifest(manifest(extra, permissions as string[] | undefined)), mentions, JSON.stringify(extra));
});

test("RAC-312 Images' image connections are its own Manifest's declaration and no registration names them", () => {
  const find = (id: string) => BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === id)!;
  assert.equal(find("io.molis.work.images").manifest.image_generation, IMAGES_IMAGE_GENERATION);
  assert.deepEqual(BUILTIN_PLUGIN_CATALOG.filter(entry => entry.manifest.image_generation).map(entry => entry.manifest.plugin_id), ["io.molis.work.images"]);
  for (const entry of BUILTIN_PLUGIN_CATALOG) assert.equal("image_generation" in (entry.runtime ?? {}), false, `${entry.manifest.plugin_id}: runtime.image_generation`);
});

/** The same definition whose Manifest also asks for `extra`, with the `model:invoke` permission image generation needs. */
const declaring = (definition: PluginDefinition, extra: Record<string, unknown>): PluginDefinition => ({ ...definition, manifest: { ...definition.manifest, ...extra,
  permissions: [...definition.manifest.permissions, { permission: "model:invoke", required: false, reason: "用模型" }] } });

test("RAC-313 a definition that declares image connections and is not on the Host's start list is refused to start with its own code", async t => {
  const listed = ownerFilesProbe("listedset"), installed = new Set<PluginDefinition>();
  const { host } = await serveHomeRuntime(t, { pluginFixtures: { home: [listed.entry()], installed } });
  const platform = await host.homePlugins!.ready();
  const name = "besideimages", beside = ownerFilesProbe(name);
  const definition = declaring(beside.withoutFiles(), { image_generation: { store_name: name, read_permission: beside.read, write_permission: beside.write, generate_permission: beside.write } });
  installed.add(definition); // the test acts as the Host's code here: it admits this one object to the process (S-75 ⑥)
  const { install } = platform.runtime.install({ trust: { level: "unsigned" }, definition, deployment: "local", grants: [...beside.permissions, "model:invoke"] });
  await assert.rejects(platform.runtime.start(install.install_id), /启动失败/u, name);
  assert.equal(beside.contexts.length, 0, `${name}: its code never ran`);
  assert.equal(platform.runtime.get(install.install_id).last_error_code, "plugin.declaration_invalid", name);
});

test("RAC-314 a project plugin that declares image connections is refused, so none is left without the service it asked for", async t => {
  const home = mkdtempSync(join(tmpdir(), "service-declarations-")), old = ownerFilesProbe("project-set", "project");
  const project = ownerFilesProject(home, old);
  t.after(async () => { await project.close(); rmSync(home, { recursive: true, force: true }); });
  await assert.rejects(project.platform.start([{ definition: declaring(old.withoutFiles(), { image_generation: IMAGES }) }]), /项目插件.*不能声明/u);
  assert.equal(old.contexts.length, 0);
});

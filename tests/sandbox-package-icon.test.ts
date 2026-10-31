import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginInstallActions, readSandboxPackage, sandboxPluginManifest } from "@molis-ai/molis-work-app-local-host";
import { PACKAGE_PLUGIN_ID, newPublisher, packageFiles, payloadOf, signedPackage } from "./fixtures/sandbox-package.js";
import { fixture, mac, person, ref } from "./fixtures/home-sandbox.js";

// BL-713 (PG-011; specs/repository-anti-corruption/slices/pg011-pg017-remaining.md §5): the one view a sandbox package has may name its icon,
// from the platform's set. The package's Manifest is still compared with the one the Host builds, so the icon is the only thing it gained.

const stageView = (manifest: PluginManifest) => manifest.ui.views![0]! as { icon?: string };
const withIcon = (icon: string | undefined) => {
  const { files, manifest } = packageFiles("example", (_files, built) => { if (icon !== undefined) stageView(built).icon = icon; });
  return { payload: payloadOf(manifest, files), manifest };
};

test("RAC-2620 a package's stage view may name its icon, and the Host's rebuilt Manifest carries it", () => {
  const { payload, manifest } = withIcon("book");
  const read = readSandboxPackage(payload);
  assert.equal(stageView(read.manifest).icon, "book");
  assert.deepEqual(JSON.parse(JSON.stringify(read.manifest)), JSON.parse(JSON.stringify(sandboxPluginManifest({
    pluginId: manifest.plugin_id, version: manifest.version, name: manifest.name, publisher: manifest.publisher, presentation: false, icon: "book" }))),
  "the Manifest is the Host's own shape plus the icon, nothing else");
});

test("RAC-2620 a package that names no icon reads exactly as before: its stage view has no icon key", () => {
  const { payload } = withIcon(undefined);
  assert.equal(Object.hasOwn(stageView(readSandboxPackage(payload).manifest), "icon"), false);
});

test("RAC-2625 a package that names an icon outside the platform's set is refused, at signing and at the Host's preview, and one that names a set icon installs", mac, async t => {
  const refusal = (error: unknown) => error instanceof ActionError && error.code === "plugin.declaration_invalid" && error.message.includes("not-a-glyph") && error.message.includes("不在平台图标集里");
  assert.throws(() => signedPackage(newPublisher(), (_files, manifest) => { stageView(manifest).icon = "not-a-glyph"; }), refusal, "the author cannot sign it");
  const h = await fixture(t);
  const unsigned = withIcon("not-a-glyph");
  await assert.rejects(h.projectClient().invoke(person(), ref(pluginInstallActions.preview), { bundle: { payload: unsigned.payload, signature: null, publisher_key: null } }), refusal,
    "the Host reads the Manifest of what it is given, whoever made it");
  const { installed } = await h.install(signedPackage(newPublisher(), (_files, manifest) => { stageView(manifest).icon = "book"; }));
  assert.equal((installed as { plugin_id: string }).plugin_id, PACKAGE_PLUGIN_ID, "a name in the set installs");
});

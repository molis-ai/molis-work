import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import * as module from "@molis-ai/molis-work-module-artifacts";
import * as plugin from "@molis-ai/molis-work-plugin-artifacts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("RAC-413: the 成果 plugin carries no action definitions and no 成果 type declaration: the module serves the actions alone, the Host declares the type", () => {
  assert.equal(existsSync(new URL("../plugins/native/artifacts/src/actions.ts", import.meta.url)), false, "no second copy of the actions");
  assert.equal(existsSync(new URL("../plugins/native/artifacts/src/action-schemas.ts", import.meta.url)), false, "nor of their schemas");
  const manifest = plugin.artifactsManifest;
  assert.equal(manifest.actions, undefined, "the Manifest declares none: the Host registers them as a platform provider (PG-077)");
  assert.deepEqual(manifest.permissions, []);
  assert.deepEqual(manifest.artifacts, { produces: [], consumes: [] });
  // The type the 成果库 writes is the Host's own producer's declaration, with the preview action that type names.
  assert.deepEqual(module.ARTIFACTS_HOST_PRODUCER.produces.map(type => type.artifact_type_id), ["io.molis.work.document"]);
  assert.deepEqual(module.ARTIFACTS_HOST_PRODUCER.actions.map(action => action.capability_id), ["artifacts.documents.preview"]);
  assert.ok(module.ARTIFACT_ACTIONS.some(action => action === module.ARTIFACTS_HOST_PRODUCER.actions[0]), "and it is one of the 17 the module serves");
});

test("RAC-414: the module serves the 17 actions, and its constants for the provider and the producer identity match the plugin's shell", () => {
  assert.equal(module.ARTIFACT_ACTIONS.length, 17);
  const { plugin_id, name, version, publisher } = plugin.artifactsManifest;
  // RAC-1047 (PG-077): the id the actions are called by and the identity a version carries are two constants with one value each, pinned.
  assert.equal(module.ARTIFACTS_PROVIDER_ID, plugin_id);
  assert.equal(module.ARTIFACTS_PROVIDER_ID, "io.molis.work.artifacts");
  assert.equal(module.ARTIFACTS_PROVIDER_TITLE, name);
  assert.deepEqual({ ...module.ARTIFACT_PRODUCER }, { plugin_id, plugin_version: version, binding_signature: publisher.signature });
  assert.deepEqual({ ...module.ARTIFACT_PRODUCER }, { plugin_id: "io.molis.work.artifacts", plugin_version: "0.3.0", binding_signature: "official-artifacts-binding" });
  assert.equal(module.ARTIFACTS_PLUGIN_ID, plugin.ARTIFACTS_PLUGIN_ID);
  assert.equal(module.ARTIFACTS_PROJECT_PLUGIN_ID, plugin.ARTIFACTS_PROJECT_PLUGIN_ID);
  assert.deepEqual(module.ARTIFACTS_HOME_STORE, plugin.ARTIFACTS_HOME_STORE);
  assert.equal(module.artifactVersionPath({ artifact_id: "a b", version: 3 }), plugin.artifactVersionPath({ artifact_id: "a b", version: 3 }));
  const sources = read("modules/artifacts/src/artifact-actions.ts");
  for (const source of module.EXTERNAL_DOCUMENT_SOURCES) assert.ok(sources.includes(`"${source}"`), `${source} is in the module's source list`);
});

test("RAC-414: the module's project deletion removes the originals it wrote and preserves another project's originals", async () => {
  const home = await mkdtemp(join(tmpdir(), "artifact-original-owner-"));
  // A dot exercises the project-id encoding used by the original-file owners.
  const projectId = "a2b.project", otherProjectId = "a2b.keep";
  const content = Buffer.from("Original bytes for the deleted project\n");
  const otherContent = Buffer.from("Original bytes for the retained project\n");
  try {
    const source = join(home, "original.txt"), otherSource = join(home, "other-original.txt");
    await writeFile(source, content);
    await writeFile(otherSource, otherContent);
    const original = await module.storeArtifactOriginal(home, projectId, source);
    const otherOriginal = await module.storeArtifactOriginal(home, otherProjectId, otherSource);
    const originalPath = module.artifactOriginalPath(home, projectId, original.sha256);
    const otherPath = module.artifactOriginalPath(home, otherProjectId, otherOriginal.sha256);
    const directory = dirname(originalPath);
    assert.equal(original.size_bytes, content.length);
    assert.ok(original.size_bytes > 0);
    assert.notEqual(directory, dirname(otherPath));
    assert.deepEqual(await readFile(originalPath), content);
    assert.deepEqual(await readFile(otherPath), otherContent);
    await module.artifactsProjectData.purge!(home, projectId);
    await assert.rejects(access(directory), { code: "ENOENT" });
    assert.deepEqual(await readFile(otherPath), otherContent);
  } finally { await rm(home, { recursive: true, force: true }); }
});

// 统筹 10-25: the generated platform registry takes every plugin's registration, pure data, through the plugin's `/registration`
// subpath; that is the one path every plugin has alike (W5-02 PR-B), so the Host's package depends on the plugin package for it.
// Beyond it the Host takes nothing of the 成果库 plugin: no other file imports it, and that file imports no other subpath.
test("RAC-413: the Host imports no 成果库 plugin code: only the generated registry takes its registration, its artifact code comes from the module", () => {
  const importers = readdirSync(new URL("../apps/local-host/src/", import.meta.url), { recursive: true }).filter(file => file.endsWith(".ts")
    && read(`apps/local-host/src/${file}`).includes("@molis-ai/molis-work-plugin-artifacts"));
  assert.deepEqual(importers, ["plugin-registry.generated.ts"], "no Host file but the generated registry names the plugin package");
  const specifiers = [...read("apps/local-host/src/plugin-registry.generated.ts").matchAll(/["'](@molis-ai\/molis-work-plugin-artifacts[^"']*)["']/g)].map(match => match[1]);
  assert.deepEqual(specifiers, ["@molis-ai/molis-work-plugin-artifacts/registration"], "and it takes the registration only");
});

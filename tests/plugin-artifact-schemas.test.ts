import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import * as module from "@molis-ai/molis-work-module-artifacts";
import { catalogProblems, homeStores } from "@molis-ai/molis-work-app-local-host";
import { artifactBrowserUiContribution, artifactReferenceUiContribution, BUILTIN_PLUGIN_CATALOG, clientPluginDirectory, createWorkbenchUiHost, railEntries } from "@molis-ai/molis-work-app-workbench";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("RAC-2340 platform Artifact navigation and declared surfaces remain reachable without any project Plugins", () => {
  assert.equal(BUILTIN_PLUGIN_CATALOG.some(entry => entry.project_plugin_id === "artifacts"), false);
  const nav = railEntries([], []);
  assert.deepEqual(nav.map(entry => [entry.id, entry.chosen]), [["artifacts", false]]);
  assert.deepEqual(clientPluginDirectory([]), [{ id: "artifacts", accepts_objects: true, hue: "pink" }]);
  const host = createWorkbenchUiHost([]);
  assert.equal(host.list().length, 2);
  const html = host.mountDeclared({ contribution_id: "io.molis.work.native.artifacts.reference.v1", surface: "reference",
    model: { value: "result", label: "kept", primitives: { text: (text: string) => text, escape: (text: string) => text, icon: () => "" } } }).html;
  assert.match(html, /data-copy-value="result"/u);
});

test("RAC-2341 resolved registrations cannot take the platform key or replace its declared UI", () => {
  assert.deepEqual(catalogProblems(BUILTIN_PLUGIN_CATALOG), []);
  const alias = ["arti", "facts"].join("");
  const first = BUILTIN_PLUGIN_CATALOG[0]!;
  assert.match(catalogProblems([{ ...first, project_plugin_id: alias }]).join("\n"), /project key belongs to the platform/u);
  const host = createWorkbenchUiHost([]), before = host.list();
  assert.throws(() => host.register({ ...artifactBrowserUiContribution, descriptor: { ...artifactBrowserUiContribution.descriptor, plugin_id: "com.impostor" } }));
  assert.deepEqual(host.list(), before);
});

test("RAC-2344 Artifact originals remain registered for Home snapshot and purge under their Module owner", () => {
  const stores = homeStores().stores.filter(store => store.path === "artifacts");
  assert.equal(stores.length, 1);
  assert.equal(stores[0]!.owner, "modules/artifacts");
  assert.equal(stores[0]!.snapshot.emptyOnly, undefined);
  assert.equal(stores[0]!.snapshot.omit, undefined);
});

test("RAC-2342: platform Artifact UI has no Plugin Manifest or registration; the Module serves the actions and the Host declares the type", () => {
  assert.equal(existsSync(new URL("../plugins/native/artifacts", import.meta.url)), false, "no Plugin shell, duplicate actions or schemas");
  assert.equal(artifactBrowserUiContribution.descriptor.contribution_id, "io.molis.work.native.artifacts.browser.v1");
  assert.equal(artifactReferenceUiContribution.descriptor.contribution_id, "io.molis.work.native.artifacts.reference.v1");
  // The type the 成果库 writes is the Host's own producer's declaration, with the preview action that type names.
  assert.deepEqual(module.ARTIFACTS_HOST_PRODUCER.produces.map(type => type.artifact_type_id), ["io.molis.work.document"]);
  assert.deepEqual(module.ARTIFACTS_HOST_PRODUCER.actions.map(action => action.capability_id), ["artifacts.documents.preview"]);
  assert.ok(module.ARTIFACT_ACTIONS.some(action => action === module.ARTIFACTS_HOST_PRODUCER.actions[0]), "and it is one of the 17 the module serves");
});

test("RAC-2342: the Module keeps all 17 actions and the platform provider and producer identities", () => {
  assert.equal(module.ARTIFACT_ACTIONS.length, 17);
  // RAC-1047 (PG-077): the id the actions are called by and the identity a version carries are two constants with one value each, pinned.
  assert.equal(module.ARTIFACTS_PROVIDER_ID, "io.molis.work.artifacts");
  assert.equal(module.ARTIFACTS_PROVIDER_TITLE, "成果");
  assert.deepEqual({ ...module.ARTIFACT_PRODUCER }, { plugin_id: "io.molis.work.artifacts", plugin_version: "0.3.0", binding_signature: "official-artifacts-binding" });
  assert.equal(module.ARTIFACTS_PLUGIN_ID, "io.molis.work.artifacts");
  assert.equal(module.ARTIFACTS_PROJECT_PLUGIN_ID, "artifacts");
  assert.deepEqual(module.ARTIFACTS_HOME_STORE, { path: "artifacts" });
  assert.equal(module.artifactVersionPath({ artifact_id: "a b", version: 3 }), "/artifacts/a%20b/versions/3");
  const sources = read("modules/artifacts/src/artifact-actions.ts");
  for (const source of module.EXTERNAL_DOCUMENT_SOURCES) assert.ok(sources.includes(`"${source}"`), `${source} is in the module's source list`);
});

test("RAC-2344 RAC-414: the module's project deletion removes the originals it wrote and preserves another project's originals", async () => {
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

test("RAC-2342: the Host and generated registry import no retired 成果库 Plugin code", () => {
  const importers = readdirSync(new URL("../apps/local-host/src/", import.meta.url), { recursive: true }).filter(file => file.endsWith(".ts")
    && read(`apps/local-host/src/${file}`).includes("@molis-ai/molis-work-plugin-artifacts"));
  assert.deepEqual(importers, [], "the generated registry no longer declares the retired Plugin either");
  const specifiers = [...read("apps/local-host/src/plugin-registry.generated.ts").matchAll(/["'](@molis-ai\/molis-work-plugin-artifacts[^"']*)["']/g)].map(match => match[1]);
  assert.deepEqual(specifiers, []);
});

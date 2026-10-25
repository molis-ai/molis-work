import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { defineArtifactPreviewAction } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { pagesManifest } from "@molis-ai/molis-work-plugin-pages";
import { MemoryPluginRuntimeRepository, PluginRuntime, PluginSupervisor, UNSIGNED_TRUST } from "@molis-ai/molis-work-plugin-runtime";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { DEMO_PROJECT_ID, LocalProjectDatabase, artifactDeclarationOwners, artifactLinkKinds, artifactTypeDeclarations, declaredArtifactTypes,
  installedArtifacts, supervisedArtifacts, openProjectVersionStores, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";

// ac-artifacts A3 step 4 (slices/ac-artifacts.md §3.3, §3.5). RAC-415 the registry reads the Manifests of the installs in effect and
// follows their lifecycle; RAC-416 / S-75 the Host refuses an installed producer's undeclared type; RAC-417 / S-76 an install
// whose Manifest declares a type id or link kind another Plugin owns is refused.

const PRODUCER = "io.molis.work.example.notes";

/** An installed app Plugin of another publisher, declaring `types` and link `kinds`. */
function plugin(id: string, version: string, types: string[], kinds: string[] = []): PluginDefinition {
  const previews = types.map(type => defineArtifactPreviewAction(`${type}.preview`, "笔记", []));
  return { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version, name: id, kind: "app",
    publisher: { publisher_id: "example", signature: `sig-${id}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, ui: { contributions: [], views: [] }, actions: previews,
    artifacts: { produces: types.map(type => ({ artifact_type_id: type, schema_version: 1, title: type, preview: { capability_id: `${type}.preview`, version: 1 } })), consumes: [],
      ...kinds.length ? { links: kinds.map(kind => ({ kind, role: "output" as const })) } : {} },
    ...version === "2.0.0" ? { upgrade_compatibility: { compatible_from_versions: ["1.0.0"] } } : {} },
  async start() { return { kind: "app", views: [], actions: previews.map(preview => ({ ...preview, async handle() { return { media_type: "text/plain", text: "" }; } })) }; } } as PluginDefinition;
}

/** A Runtime that compares declarations with the Host's, supervised and watched by the registry like a project's. */
function rig(t: TestContext) {
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { declarationOwners: artifactDeclarationOwners, actions: pluginActions(t, DEMO_PROJECT_ID) });
  const supervisor = new PluginSupervisor(runtime), unwatch = installedArtifacts.watch(supervisedArtifacts(supervisor, runtime));
  t.after(async () => {
    unwatch();
    for (const install of runtime.list()) if (install.state === "running") await runtime.stop(install.install_id);
  });
  return { runtime, supervisor };
}
const types = () => declaredArtifactTypes().map(type => type.artifact_type_id);

test("RAC-415 the registry follows an installed Plugin's Manifest through enable, disable, upgrade and uninstall", async t => {
  const { runtime, supervisor } = rig(t);
  assert.equal(types().includes("example.note"), false);
  const report = await supervisor.start([{ definition: plugin(PRODUCER, "1.0.0", ["example.note"], ["example.note.ref"]), trust: UNSIGNED_TRUST }]);
  assert.deepEqual(report.failed, []);
  assert.equal(types().includes("example.note"), true, "installed and in effect: its type is declared");
  assert.equal(artifactTypeDeclarations().get("example.note")?.plugin_id, PRODUCER);
  assert.equal(artifactLinkKinds().get("example.note.ref")?.module, PRODUCER, "its link kind is read from its Manifest");

  supervisor.revoke(PRODUCER);
  assert.equal(types().includes("example.note"), false, "disabled: nothing it declares is read");
  assert.equal(artifactLinkKinds().has("example.note.ref"), false);
  await supervisor.enable(PRODUCER);
  assert.equal(types().includes("example.note"), true, "enabled again");

  await supervisor.upgrade(PRODUCER, plugin(PRODUCER, "2.0.0", ["example.note", "example.sheet"]));
  assert.equal(types().includes("example.sheet"), true, "upgraded: the new Manifest is the one read");
  assert.equal(artifactLinkKinds().has("example.note.ref"), false, "...and a kind the new Manifest dropped is gone");

  await runtime.uninstall(supervisor.installation(PRODUCER)!.install_id);
  assert.equal(types().includes("example.note") || types().includes("example.sheet"), false, "uninstalled");
});

test("RAC-415 a built-in Plugin that is not in effect declares nothing, and Goals disabled leaves no link kinds", async t => {
  const { supervisor } = rig(t);
  await supervisor.start([{ definition: { manifest: goalsManifest, async start() { return { kind: "app", views: [], actions: [] }; } } as PluginDefinition, trust: UNSIGNED_TRUST }]);
  assert.equal(artifactLinkKinds().has("goal.input"), true);
  supervisor.revoke(goalsManifest.plugin_id);
  assert.equal(artifactLinkKinds().size, 0, "Goals absent: no kinds");
  assert.equal(types().includes(pagesManifest.artifacts.produces[0]!.artifact_type_id), true, "a built-in this supervisor never held is read from the build");
});

test("RAC-417 S-76 an install whose Manifest declares a 成果 type or link kind another Plugin owns is refused", async t => {
  const { runtime, supervisor } = rig(t);
  await supervisor.start([{ definition: plugin(PRODUCER, "1.0.0", ["example.note"], ["example.note.ref"]), trust: UNSIGNED_TRUST }]);
  const take = (definition: PluginDefinition) => () => runtime.install({ definition, deployment: "local", trust: UNSIGNED_TRUST });
  const code = { code: "plugin.definition_conflict" };
  assert.throws(take(plugin("io.molis.work.example.other-a", "1.0.0", ["example.note"])), { ...code, message: /example\.note 已由 io\.molis\.work\.example\.notes 声明/ }, "a type an installed Plugin owns");
  assert.throws(take(plugin("io.molis.work.example.other-b", "1.0.0", [], ["example.note.ref"])), { ...code, message: /example\.note\.ref 已由 io\.molis\.work\.example\.notes 声明/ }, "a link kind an installed Plugin owns");
  assert.throws(take(plugin("io.molis.work.example.other-c", "1.0.0", [pagesManifest.artifacts.produces[0]!.artifact_type_id])), code, "a type a shipped Plugin owns");
  assert.throws(take(plugin("io.molis.work.example.other-d", "1.0.0", [], [goalsManifest.artifacts.links![0]!.kind])), code, "a link kind a shipped Plugin owns");
  assert.deepEqual(runtime.list().map(record => record.plugin_id), [PRODUCER], "a refused install leaves no record");
  // The owner itself is not another owner: its own version change passes.
  await supervisor.upgrade(PRODUCER, plugin(PRODUCER, "2.0.0", ["example.note", "example.sheet"], ["example.note.ref"]));
  assert.equal(types().includes("example.sheet"), true);
});

test("RAC-416 S-75 the Host refuses an installed Plugin's undeclared type, and any write once the Plugin is no longer in effect", async t => {
  const { runtime, supervisor } = rig(t);
  const directory = mkdtempSync(join(tmpdir(), "molis-artifact-declarations-")), file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  const write = (type: string, artifactId: string) => openProjectVersionStores(store).artifacts.commands.registerVersion({ project_id: DEMO_PROJECT_ID, actor_id: "web-user",
    artifact_id: artifactId, version: 1, artifact_type_id: type, schema_version: 1, producer: { plugin_id: PRODUCER, plugin_version: "1.0.0", binding_signature: "sig" },
    content: { kind: "inline", payload: { title: "笔记" } }, origin: { kind: "pinned", subject: { kind: "item", id: artifactId }, revision: "1" }, title: "笔记", media_type: "application/json" });
  await supervisor.start([{ definition: plugin(PRODUCER, "1.0.0", ["example.note"]), trust: UNSIGNED_TRUST }]);
  assert.doesNotThrow(() => write("example.note", "declared"), "a declared type is written");
  assert.throws(() => write("example.secret", "undeclared"), { code: "artifacts.artifact.type_undeclared", message: /没有在 artifacts\.produces 声明 example\.secret@1/ });
  supervisor.revoke(PRODUCER);
  assert.throws(() => write("example.note", "disabled"), { code: "artifacts.artifact.type_undeclared", message: /已停用或已卸载/ }, "disabled");
  await supervisor.enable(PRODUCER);
  await runtime.uninstall(supervisor.installation(PRODUCER)!.install_id);
  assert.throws(() => write("example.note", "uninstalled"), { code: "artifacts.artifact.type_undeclared", message: /已停用或已卸载/ }, "uninstalled");
});

test("RAC-415 a supervisor whose project closed under it no longer answers, and the registry goes on without it", () => {
  const unwatch = installedArtifacts.watch({ effectiveManifests() { throw new Error("The database connection is not open"); }, knownPluginIds() { return []; } });
  try {
    assert.equal(types().includes(pagesManifest.artifacts.produces[0]!.artifact_type_id), true, "the shipped types are still read");
    assert.doesNotThrow(() => artifactDeclarationOwners());
  } finally { unwatch(); }
});

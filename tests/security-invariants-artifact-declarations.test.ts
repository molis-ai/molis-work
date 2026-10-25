import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { defineArtifactPreviewAction } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { pagesManifest } from "@molis-ai/molis-work-plugin-pages";
import { createPluginRuntimeReleaseArtifact, PluginRuntime, SqlitePluginRuntimeReleaseArtifactRepository, SqlitePluginRuntimeRepository, UNSIGNED_TRUST } from "@molis-ai/molis-work-plugin-runtime";
import { homeStoreRegistry } from "@molis-ai/molis-work-storage";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { DEMO_PROJECT_ID, LocalProjectDatabase, artifactLinkKinds, artifactTypeDeclarations, bindProjectArtifacts, createPluginPlatform, declaredArtifactTypes,
  heldInstalls, homeStores, installedArtifacts, openProjectVersionStores, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { openTestHome } from "./fixtures/test-home.js";

// ac-artifacts A3 step 4 (slices/ac-artifacts.md §3.3, §3.5). RAC-415 the display registry follows the supervisors' installs;
// RAC-416 / S-75 a project's writes are judged by that project's own supervisors, by the Manifest of the installation in effect
// there; RAC-417 / S-76 a type id or link kind has one owner in the whole Home, worked out from the installation records on disk,
// and an install, a version change and an enable each ask.

const PRODUCER = "io.molis.work.example.notes", OTHER = "io.molis.work.example.other";

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
/** The entry a project's start list gives: the definition, and the release row that keeps its Manifest on disk. */
const entry = (definition: PluginDefinition) => ({ definition, trust: UNSIGNED_TRUST, releaseArtifact: { capture: () => "export {}", restore: () => definition } });

/** A project of a Home with the real platform, and version stores that ask it before they write. */
function project(t: TestContext, home: string, existing?: { file: string; projectId: string }) {
  const projectId = existing?.projectId ?? DEMO_PROJECT_ID, file = existing?.file ?? join(mkdtempSync(join(home, "project-")), "project.db");
  if (!existing) seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, projectId), versions = openProjectVersionStores(store);
  const platform = createPluginPlatform({ actions, project_id: projectId, actor_id: "tester", db: store.db, journal: store, ...versions, ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }), home: { directory: home, completeText: () => null, stores: homeStoreRegistry(homeStores().stores) } });
  const rig = { platform, store, versions, projectId, runtime: platform.runtime, supervisor: platform.supervisor,
    write: (producerId: string, type: string, artifactId: string) => write(versions, projectId, producerId, type, artifactId),
    install: (definition: PluginDefinition) => platform.runtime.install({ definition, deployment: "local", trust: UNSIGNED_TRUST, grants: [] }),
    async close() {
      try { await platform.closeCoordination(); for (const instance of platform.runtime.list()) if (instance.state === "running") await platform.runtime.stop(instance.install_id); }
      finally { store.close(); }
    } };
  t.after(() => rig.close());
  return rig;
}
const write = (versions: ReturnType<typeof openProjectVersionStores>, projectId: string, producerId: string, type: string, artifactId: string) => versions.artifacts.commands.registerVersion({
  project_id: projectId, actor_id: "web-user", artifact_id: artifactId, version: 1, artifact_type_id: type, schema_version: 1,
  producer: { plugin_id: producerId, plugin_version: "1.0.0", binding_signature: "sig" }, content: { kind: "inline", payload: { title: "笔记" } },
  origin: { kind: "pinned", subject: { kind: "item", id: artifactId }, revision: "1" }, title: "笔记", media_type: "application/json" });
const bareHome = (t: TestContext) => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "molis-artifact-declarations-")));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
};
const types = () => declaredArtifactTypes().map(type => type.artifact_type_id);
const refusal = { code: "plugin.definition_conflict" };
const undeclared = { code: "artifacts.artifact.type_undeclared" };
const twoProjects = async (t: TestContext) => {
  const testHome = await openTestHome(t), [a, b] = [await testHome.createProject("项目 A"), await testHome.createProject("项目 B")];
  return { home: testHome.home, pa: project(t, testHome.home, { file: a.database_path, projectId: a.project_id }), pb: project(t, testHome.home, { file: b.database_path, projectId: b.project_id }) };
};

test("RAC-415 the registry follows an installed Plugin's Manifest through enable, disable, upgrade and uninstall", async t => {
  const p = project(t, bareHome(t));
  assert.equal(types().includes("example.note"), false);
  const report = await p.supervisor.start([entry(plugin(PRODUCER, "1.0.0", ["example.note"], ["example.note.ref"]))]);
  assert.deepEqual(report.failed, []);
  assert.equal(types().includes("example.note"), true, "installed and in effect: its type is declared");
  assert.equal(artifactTypeDeclarations().get("example.note")?.plugin_id, PRODUCER);
  assert.equal(artifactLinkKinds().get("example.note.ref")?.module, PRODUCER, "its link kind is read from its Manifest");

  p.supervisor.revoke(PRODUCER);
  assert.equal(types().includes("example.note"), false, "disabled: nothing it declares is read");
  assert.equal(artifactLinkKinds().has("example.note.ref"), false);
  await p.supervisor.enable(PRODUCER);
  assert.equal(types().includes("example.note"), true, "enabled again");

  await p.platform.upgrade(PRODUCER, plugin(PRODUCER, "2.0.0", ["example.note", "example.sheet"]));
  assert.equal(types().includes("example.sheet"), true, "upgraded: the new Manifest is the one read");
  assert.equal(artifactLinkKinds().has("example.note.ref"), false, "...and a kind the new Manifest dropped is gone");

  await p.runtime.uninstall(p.supervisor.installation(PRODUCER)!.install_id, { retain_private_data: false });
  assert.equal(types().includes("example.note") || types().includes("example.sheet"), false, "uninstalled");
});

test("RAC-415 a built-in Plugin that is not in effect declares nothing, and Goals disabled leaves no link kinds", async t => {
  const p = project(t, bareHome(t));
  // Goals' declarations (its link kinds, its actions) with the pages and routes it serves left out, so a bare start redeems all it declares.
  const manifest = { ...structuredClone(goalsManifest), ui: { contributions: [], views: [] }, routes: [] } as typeof goalsManifest;
  const report = await p.supervisor.start([entry({ manifest, async start() { return { kind: "app", views: [], actions: (manifest.actions ?? []).map(action => ({ ...action, async handle() { return {}; } })) }; } } as PluginDefinition)]);
  assert.deepEqual(report.failed, []);
  assert.equal(artifactLinkKinds().has("goal.input"), true);
  p.supervisor.revoke(goalsManifest.plugin_id);
  assert.equal(artifactLinkKinds().size, 0, "Goals absent: no kinds");
  assert.equal(types().includes(pagesManifest.artifacts.produces[0]!.artifact_type_id), true, "a built-in this supervisor never held is read from the build");
});

test("RAC-415 a supervisor whose project closed no longer answers; any other failure of a view is not swallowed", () => {
  let open = true;
  const unwatch = installedArtifacts.watch({ alive: () => open, effectiveManifests: () => [], knownPluginIds: () => [] as string[] });
  const broken = installedArtifacts.watch({ alive: () => true, effectiveManifests: () => { throw new Error("the view broke"); }, knownPluginIds: () => [] });
  try {
    assert.throws(() => types(), /the view broke/, "a failure that is not a closed project is reported");
  } finally { broken(); }
  try {
    open = false;
    assert.equal(types().includes(pagesManifest.artifacts.produces[0]!.artifact_type_id), true, "the shipped types are still read once it has closed");
  } finally { unwatch(); }
});

test("RAC-416 S-75 a project's writes are judged by its own installation: undeclared, disabled, uninstalled, another version, another project", { timeout: 180_000 }, async t => {
  const { pa, pb } = await twoProjects(t);
  await pa.supervisor.start([entry(plugin(PRODUCER, "1.0.0", ["example.note"]))]);
  await pb.supervisor.start([entry(plugin(PRODUCER, "1.0.0", ["example.note"]))]);
  assert.doesNotThrow(() => pa.write(PRODUCER, "example.note", "declared"), "a declared type is written");
  assert.throws(() => pa.write(PRODUCER, "example.secret", "undeclared"), { ...undeclared, message: /没有在 artifacts\.produces 声明 example\.secret@1/ });

  await pb.platform.upgrade(PRODUCER, plugin(PRODUCER, "2.0.0", ["example.note", "example.sheet"]));
  assert.doesNotThrow(() => pb.write(PRODUCER, "example.sheet", "v2-in-b"), "B runs v2, which declares the sheet");
  assert.throws(() => pa.write(PRODUCER, "example.sheet", "v2-in-a"), { ...undeclared, message: /没有在 artifacts\.produces 声明 example\.sheet@1/ }, "A still runs v1, judged by v1's Manifest");

  pa.supervisor.revoke(PRODUCER);
  assert.throws(() => pa.write(PRODUCER, "example.note", "disabled-in-a"), { ...undeclared, message: /已停用或已卸载/ }, "disabled in A though B has it enabled");
  assert.doesNotThrow(() => pb.write(PRODUCER, "example.note", "enabled-in-b"));
  await pa.supervisor.enable(PRODUCER);
  assert.doesNotThrow(() => pa.write(PRODUCER, "example.note", "enabled-again"));
  await pa.runtime.uninstall(pa.supervisor.installation(PRODUCER)!.install_id, { retain_private_data: false });
  assert.throws(() => pa.write(PRODUCER, "example.note", "uninstalled-in-a"), { ...undeclared, message: /已停用或已卸载/ }, "uninstalled");
  assert.ok(pa.versions.artifacts.query.getArtifactVersion(pa.projectId, { artifact_id: "declared", version: 1 }), "what it wrote while it was in effect stays readable");
});

test("RAC-416 S-75 a producer the project cannot be asked about is refused, never passed", t => {
  const p = project(t, bareHome(t));
  assert.throws(() => p.write(OTHER, "example.note", "no-installation"), { ...undeclared, message: /不是这个项目里装着的插件/ }, "not installed in this project");
  assert.throws(() => p.write(pagesManifest.plugin_id, "io.example.not-pages", "shipped-undeclared"), undeclared, "a shipped plugin is held to its Manifest");

  const file = join(bareHome(t), "alone.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), alone = openProjectVersionStores(store);
  t.after(() => store.close());
  assert.throws(() => write(alone, DEMO_PROJECT_ID, OTHER, "example.note", "x"), { ...undeclared, message: /没有找到这个项目的插件监督器/ }, "a project with no supervisor");
  const unbind = bindProjectArtifacts(store.db, { alive: () => true, effectiveManifests: () => { throw new Error("cannot ask"); }, knownPluginIds: () => [] });
  t.after(unbind);
  assert.throws(() => write(alone, DEMO_PROJECT_ID, OTHER, "example.note", "y"), { ...undeclared, message: /查不到（cannot ask）/ }, "a supervisor that cannot answer");
});

test("RAC-417 S-76 a name has one owner in the whole Home: a disabled owner still holds it, and so does one in another project", { timeout: 180_000 }, async t => {
  const { pa, pb } = await twoProjects(t);
  await pb.supervisor.start([entry(plugin(PRODUCER, "1.0.0", ["example.note"], ["example.note.ref"]))]);
  const take = (definition: PluginDefinition) => () => pa.install(definition);
  assert.throws(take(plugin(OTHER, "1.0.0", ["example.note"])), { ...refusal, message: /example\.note 已由 io\.molis\.work\.example\.notes 声明/ }, "a type held by an installation in another project");
  assert.throws(take(plugin(OTHER, "1.0.0", [], ["example.note.ref"])), { ...refusal, message: /example\.note\.ref 已由 io\.molis\.work\.example\.notes 声明/ }, "a link kind held in another project");
  assert.throws(take(plugin(OTHER, "1.0.0", [pagesManifest.artifacts.produces[0]!.artifact_type_id])), refusal, "a type a shipped plugin owns");
  assert.throws(take(plugin(OTHER, "1.0.0", [], [goalsManifest.artifacts.links![0]!.kind])), refusal, "a link kind a shipped plugin owns");
  assert.deepEqual(pa.runtime.list(), [], "a refused install leaves no record");

  const installId = pb.supervisor.installation(PRODUCER)!.install_id;
  pb.supervisor.revoke(PRODUCER);
  assert.throws(take(plugin(OTHER, "1.0.0", ["example.note"])), refusal, "disabling the owner does not give the name up");
  await pb.runtime.uninstall(installId, { retain_private_data: true });
  assert.throws(take(plugin(OTHER, "1.0.0", ["example.note"])), refusal, "an uninstall that keeps the data still holds it");
  pb.runtime.install({ definition: plugin(PRODUCER, "1.0.0", ["example.note"], ["example.note.ref"]), deployment: "local", trust: UNSIGNED_TRUST, grants: [], discard_kept_data: true });
  await pb.runtime.uninstall(installId, { retain_private_data: false });
  assert.doesNotThrow(take(plugin(OTHER, "1.0.0", ["example.note"])), "the last holder gone without its data lets the name go");
});

test("RAC-417 S-76 an enable asks too: a second owner that got in cannot be switched on, and an unreadable installation refuses", { timeout: 180_000 }, async t => {
  const { home, pa, pb } = await twoProjects(t);
  await pa.supervisor.start([entry(plugin(PRODUCER, "1.0.0", ["example.note"]))]);
  pa.supervisor.revoke(PRODUCER);
  // A second owner of the name, put into B by a Runtime that was not asked (a record from before the rule, or a hand-made one).
  const y = plugin(OTHER, "1.0.0", ["example.note"]);
  new SqlitePluginRuntimeReleaseArtifactRepository(pb.store.db).save(createPluginRuntimeReleaseArtifact(y.manifest, "export {}"));
  new PluginRuntime(new SqlitePluginRuntimeRepository(pb.store.db)).install({ definition: y, deployment: "local", trust: UNSIGNED_TRUST, grants: [] });
  const state = await pa.supervisor.enable(PRODUCER);
  assert.equal(state.status, "failed", "the enable is refused");
  assert.equal(state.code, "plugin.definition_conflict");
  assert.match(state.message ?? "", /example\.note 已由 io\.molis\.work\.example\.other 声明/);
  assert.equal(artifactTypeDeclarations().get("example.note")?.plugin_id === PRODUCER, false, "and it stays out of the registry");

  // An installation whose Manifest was never kept cannot be read for its names, so it holds every name.
  const z = plugin("io.molis.work.example.unkept", "1.0.0", ["example.unkept"]);
  new PluginRuntime(new SqlitePluginRuntimeRepository(pb.store.db)).install({ definition: z, deployment: "local", trust: UNSIGNED_TRUST, grants: [] });
  assert.throws(() => pa.install(plugin("io.molis.work.example.third", "1.0.0", ["example.third"])), { ...refusal, message: /读不到已装插件 io\.molis\.work\.example\.unkept 的 Manifest/ });
  assert.equal(heldInstalls(home).some(held => held.record.plugin_id === z.manifest.plugin_id && held.manifest === null), true);
});

test("RAC-417 S-76 two Homes in one process do not share names", { timeout: 120_000 }, async t => {
  const one = project(t, bareHome(t)), two = project(t, bareHome(t));
  await one.supervisor.start([entry(plugin(PRODUCER, "1.0.0", ["example.note"]))]);
  assert.throws(() => one.install(plugin(OTHER, "1.0.0", ["example.note"])), refusal, "in the Home that holds the name");
  assert.doesNotThrow(() => two.install(plugin(OTHER, "1.0.0", ["example.note"])), "another Home's installation does not hold it");
  assert.doesNotThrow(() => one.install(plugin(PRODUCER, "2.0.0", ["example.note", "example.sheet"])), "the owner's own version change is not another owner");
});

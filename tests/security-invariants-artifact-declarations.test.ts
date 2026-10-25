import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test, { type TestContext } from "node:test";
import { defineArtifactPreviewAction } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginTrust } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { pagesManifest } from "@molis-ai/molis-work-plugin-pages";
import { createPluginRuntimeReleaseArtifact, PluginRuntime, SqlitePluginRuntimeReleaseArtifactRepository, SqlitePluginRuntimeRepository, UNSIGNED_TRUST } from "@molis-ai/molis-work-plugin-runtime";
import { homeStoreRegistry } from "@molis-ai/molis-work-storage";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { readRestoredAssets, restoreWorkAssets } from "@molis-ai/molis-work-app-server";
import { DEMO_PROJECT_ID, LocalProjectDatabase, artifactLinkKinds, artifactTypeDeclarations, bindProjectArtifacts, createPluginPlatform, declaredArtifactTypes,
  heldInstalls, pluginHeldElsewhere, homeStores, installedArtifacts, openProjectVersionStores, restoreArtifactVersions, seedDemoBoard, seedSceneRules, withFunctionsService } from "@molis-ai/molis-work-app-local-host";
import { DECLARED_RULE_OPTIONS, declaredRule, declaredScene } from "./fixtures/declared-rules.js";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { openTestHome } from "./fixtures/test-home.js";

// ac-artifacts A3 step 4 (slices/ac-artifacts.md §3.3, §3.5). RAC-415 the display registry follows the supervisors' installs;
// RAC-416 / S-81 a project's writes are judged by that project's own supervisors, by the Manifest of the installation in effect
// there; RAC-417 / S-82 a type id or link kind has one owner in the whole Home, worked out from the installation records on disk,
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
const entry = (definition: PluginDefinition, trust: PluginTrust = UNSIGNED_TRUST) => ({ definition, trust, releaseArtifact: { capture: () => "export {}", restore: () => definition } });

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
/** A version as a bundle records it. */
const restored = (projectId: string, producerId: string, type: string, artifactId: string) => ({
  artifact_id: artifactId, version: 1, artifact_type_id: type, schema_version: 1,
  producer: { plugin_id: producerId, plugin_version: "1.0.0", binding_signature: "sig" }, content: { kind: "inline" as const, payload: { title: "笔记", for: projectId } },
  origin: { kind: "pinned" as const, subject: { kind: "item", id: artifactId }, revision: "1" }, title: "笔记", media_type: "application/json" });
/** Every product source file under `directory` (tests, builds and dependencies left out). */
function productSources(directory: string, found: string[] = []): string[] {
  for (const name of readdirSync(directory)) {
    if (name === "node_modules" || name === "dist" || name === "tests" || name === ".git") continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) productSources(path, found);
    else if (/\.(ts|tsx|mts)$/u.test(name)) found.push(path);
  }
  return found;
}
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

/** The production restore creates its catalog identity; every later call opens a new, unsupervised target connection. */
async function restoreTarget(t: TestContext) {
  const home = bareHome(t);
  const bundle = { format: "molis-work-assets", version: 1, source_project_id: "historical-source", title: "恢复", goals: [], artifacts: [], dependencies: [], notes: [] };
  const created = await restoreWorkAssets(bundle, home);
  const target = await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.getProject(created.project_id));
  const p = project(t, home, { file: target.database_path, projectId: target.project_id });
  const asset = (producer: string, type: string, id: string) => ({ ...restored(p.projectId, producer, type, id), supersedes_version: null, owner_actor_id: "web-user", availability: "available" as const, lifecycle_state: "active" as const });
  const state = () => {
    const reopened = new LocalProjectDatabase(target.database_path, { existingOnly: true });
    try { return { artifacts: openProjectVersionStores(reopened).artifacts.query.listArtifacts(p.projectId), cursor: reopened.eventCursor(p.projectId) }; }
    finally { reopened.close(); }
  };
  return { home, bundle, p, asset, state };
}

for (const disabled of [false, true]) test(`RAC-416-R1 S-81 production restore checks the exact persisted ${disabled ? "disabled" : "installed"} release and rolls back the whole bundle`, async t => {
  const r = await restoreTarget(t), definition = plugin(PRODUCER, "1.0.0", ["example.note"]);
  let starts = 0;
  const start = definition.start;
  definition.start = async context => { starts += 1; return start(context); };
  const releases = new SqlitePluginRuntimeReleaseArtifactRepository(r.p.store.db);
  releases.save(createPluginRuntimeReleaseArtifact(definition.manifest, "export {}"));
  // Another release declares the forbidden type; the target still has v1, so v2 must not authorize it.
  releases.save(createPluginRuntimeReleaseArtifact(plugin(PRODUCER, "2.0.0", ["example.note", "example.secret"]).manifest, "export {}"));
  const install = r.p.install(definition).install;
  if (disabled) { await r.p.runtime.start(install.install_id); await r.p.runtime.stop(install.install_id); }
  const startsBeforeRestore = starts;
  assert.equal(r.p.runtime.get(install.install_id)?.state, disabled ? "disabled" : "installed");
  const before = r.state();
  const historical = r.asset(OTHER, "example.old", "first-in-transaction"), forbidden = r.asset(PRODUCER, "example.secret", "forbidden");
  await assert.rejects(() => restoreWorkAssets({ ...r.bundle, artifacts: [historical, forbidden] }, r.home),
    { ...undeclared, message: /没有在 artifacts\.produces 声明 example\.secret@1/ });
  assert.deepEqual(r.state(), before, "new connection observes zero new versions or business events after the refusal");
  assert.equal(starts, startsBeforeRestore, "persisted declarations suffice without activating any plugin");
  // RAC-416-R2: restoring declared fixed history is not an ordinary plugin write, including for a disabled producer.
  const allowed = r.asset(PRODUCER, "example.note", "declared-history");
  assert.equal((await restoreWorkAssets({ ...r.bundle, artifacts: [allowed] }, r.home)).restored, 1);
  assert.equal(starts, startsBeforeRestore);
  assert.equal(r.p.runtime.get(install.install_id)?.state, disabled ? "disabled" : "installed", "restore never enables the target producer");
});

test("RAC-416-R2 S-81 production restore preserves genuinely uninstalled history and warnings, replays without writes and keeps ordinary writes refused", async t => {
  const r = await restoreTarget(t), asset = r.asset(OTHER, "example.old", "history");
  const result = await restoreWorkAssets({ ...r.bundle, artifacts: [asset] }, r.home);
  assert.equal(result.restored, 1);
  assert.ok(result.warnings.some(warning => warning.includes(`${OTHER}@1.0.0`)));
  const read = await readRestoredAssets(r.home, r.bundle.source_project_id);
  assert.equal(read.artifacts[0]?.producer_plugin_id, OTHER);
  assert.equal(read.artifacts[0]?.artifact_type_id, "example.old");
  assert.deepEqual(read.artifacts[0]?.payload, asset.content.payload);
  const before = r.state();
  await restoreWorkAssets({ ...r.bundle, artifacts: [asset] }, r.home);
  assert.deepEqual(r.state(), before, "replay appends no version or event");
  assert.throws(() => r.p.write(OTHER, "example.old", "ordinary-after-restore"), undeclared);
  const changed = { ...asset, content: { kind: "inline", payload: { changed: true } } };
  await assert.rejects(() => restoreWorkAssets({ ...r.bundle, artifacts: [changed] }, r.home), /内容|版本|摘要/);
  await assert.rejects(() => restoreWorkAssets({ ...r.bundle, artifacts: [r.asset(OTHER, "example.old", "outside")] }, r.home), { code: "actions.input_invalid" });
  assert.deepEqual(r.state(), before);
});

test("RAC-416-R2 S-81 production restore refuses a missing exact release and an unreadable installation table without writes", async t => {
  const r = await restoreTarget(t), definition = plugin(PRODUCER, "1.0.0", ["example.note"]);
  r.p.install(definition); // A real persisted install with no corresponding captured release.
  new SqlitePluginRuntimeReleaseArtifactRepository(r.p.store.db).save(createPluginRuntimeReleaseArtifact(plugin(PRODUCER, "2.0.0", ["example.note"]).manifest, "export {}"));
  const before = r.state(), asset = r.asset(PRODUCER, "example.note", "unreadable-release");
  await assert.rejects(() => restoreWorkAssets({ ...r.bundle, artifacts: [asset] }, r.home), { ...undeclared, message: /Manifest|查不到/ });
  assert.deepEqual(r.state(), before);
  // Break and restore the real table inside the isolated test database; the restore's new connection must observe the refusal.
  r.p.store.db.exec("ALTER TABLE plugin_runtime_installs RENAME TO unavailable_test_installs");
  try {
    await assert.rejects(() => restoreWorkAssets({ ...r.bundle, artifacts: [r.asset(OTHER, "example.old", "unreadable-installs")] }, r.home),
      { ...undeclared, message: /查不到/ });
    assert.deepEqual(r.state(), before);
  } finally { r.p.store.db.exec("ALTER TABLE unavailable_test_installs RENAME TO plugin_runtime_installs"); }
});

test("RAC-417-R1 S-82 a missing catalog project's library refuses installs and keeps another version's rule and user sample through real cleanup", async t => {
  const { home, pa, pb } = await twoProjects(t);
  await pa.supervisor.start([entry(plugin(PRODUCER, "1.0.0", ["example.note"]))]);
  await pb.supervisor.start([entry(plugin(PRODUCER, "2.0.0", ["example.note", "example.sheet"]))]);
  const [ia, ib] = [pa.supervisor.installation(PRODUCER)!.install_id, pb.supervisor.installation(PRODUCER)!.install_id];
  assert.equal(ia, ib, "scope, not install_id alone, distinguishes the holders");
  seedSceneRules(home, { provider_id: PRODUCER, plugin_id: PRODUCER, title: "笔记", kind: "plugin" }, [declaredScene("example.pick", declaredRule("restore_rule_hold"))], DECLARED_RULE_OPTIONS);
  const rule = () => withFunctionsService(home, service => service.getByKey("restore_rule_hold"), DECLARED_RULE_OPTIONS);
  const before = withFunctionsService(home, service => service.addSample(rule()!.id, { input: "另一版本安装的用户样例" }), DECLARED_RULE_OPTIONS);
  const target = await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.getProject(pb.projectId));
  const missing = target.database_path + ".temporarily-unavailable";
  renameSync(target.database_path, missing);
  try {
    await t.test("RAC-417-R1 missing library refuses the actual install without saving it", () => {
      assert.throws(() => pa.install(plugin(OTHER, "1.0.0", ["example.sheet"])), { ...refusal, message: /核不了|读不了/ });
      assert.deepEqual(pa.runtime.list().map(record => record.install_id), [ia], "refused install saves no record");
    });
    await t.test("RAC-417-R1 missing library keeps the rule and sample through actual non-retaining uninstall", async () => {
      await pa.runtime.uninstall(ia, { retain_private_data: false });
      assert.deepEqual(rule(), before, "uncertain ownership retains the exact rule, declarer and sample");
    });
  } finally { renameSync(missing, target.database_path); }
  assert.equal(pluginHeldElsewhere(home, PRODUCER, { scope: { kind: "project", project_id: pa.projectId }, install_id: ia }), true);
  assert.throws(() => pa.install(plugin(OTHER, "1.0.0", ["example.sheet"])), refusal, "restored B's v2 Manifest still holds its extra type");
  await pb.runtime.uninstall(ib, { retain_private_data: true });
  assert.deepEqual(rule(), before, "retained data continues to hold its rule");
  assert.throws(() => pa.install(plugin(OTHER, "1.0.0", ["example.sheet"])), refusal);
  pb.runtime.install({ definition: plugin(PRODUCER, "2.0.0", ["example.note", "example.sheet"]), deployment: "local", trust: UNSIGNED_TRUST, grants: [], discard_kept_data: true });
  assert.equal(rule(), null, "after the file returns, the last non-retaining cleanup can release the rule");
  await pb.runtime.uninstall(ib, { retain_private_data: false });
  assert.doesNotThrow(() => pa.install(plugin(OTHER, "1.0.0", ["example.sheet"])), "the released type can be claimed after readable final cleanup");
});

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
  // Goals is the Host's own build, so it starts under Host trust, as the Host starts it.
  const manifest = { ...structuredClone(goalsManifest), ui: { contributions: [], views: [] }, routes: [] } as typeof goalsManifest;
  const report = await p.supervisor.start([entry({ manifest, async start() { return { kind: "app", views: [], actions: (manifest.actions ?? []).map(action => ({ ...action, async handle() { return {}; } })) }; } } as PluginDefinition, { level: "host" })]);
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

test("RAC-416 S-81 a project's writes are judged by its own installation: undeclared, disabled, uninstalled, another version, another project", { timeout: 180_000 }, async t => {
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

test("RAC-416 S-81 a producer the project cannot be asked about is refused, never passed", t => {
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

test("RAC-416 S-81 a project rebuilt from a bundle takes a producer it has not installed, and still holds an installed one to its Manifest", { timeout: 180_000 }, async t => {
  const p = project(t, bareHome(t));
  const asset = (producerId: string, type: string, artifactId: string) => ({ ...restored(p.projectId, producerId, type, artifactId), owner_actor_id: "web-user", availability: "available" as const, lifecycle_state: "active" as const });
  assert.throws(() => write(p.versions, p.projectId, OTHER, "example.note", "ordinary"), undeclared, "an ordinary write for an uninstalled producer is refused");
  assert.equal(restoreArtifactVersions(p.store, p.projectId, [asset(OTHER, "example.note", "restored")])[0]!.replayed, false, "the restore takes the history of a producer not installed here");
  assert.equal(restoreArtifactVersions(p.store, p.projectId, [asset(OTHER, "example.note", "restored")])[0]!.replayed, true, "restoring again changes nothing");
  assert.throws(() => write(p.versions, p.projectId, OTHER, "example.note", "after"), undeclared, "the restored producer still writes nothing until it is installed here");
  assert.equal(p.versions.artifacts.query.getArtifactVersion(p.projectId, { artifact_id: "restored", version: 1 })?.producer_plugin_id, OTHER, "the version keeps the producer the bundle recorded");
  assert.throws(() => restoreArtifactVersions(p.store, p.projectId, [asset(OTHER, "example.note", "second")]), { code: "actions.input_invalid" }, "outside a restore: a project that holds a version the bundle does not bring refuses");
  assert.equal(p.versions.artifacts.query.getArtifactVersion(p.projectId, { artifact_id: "second", version: 1 }), null);
  await p.supervisor.start([entry(plugin(PRODUCER, "1.0.0", ["example.note"]))]);
  const own = asset(PRODUCER, "example.other", "undeclared");
  assert.throws(() => restoreArtifactVersions(p.store, p.projectId, [asset(OTHER, "example.note", "restored"), own]), undeclared, "an installed producer is held to its Manifest in a restore too");
});

test("RAC-416 S-81 only the restore from a work-assets bundle calls the restore entry", () => {
  // The entry that takes a version from an uninstalled producer: defined with the stores, exported by the Host, called by the restore.
  const allowed = new Set(["apps/local-host/src/project-version-stores.ts", "apps/local-host/src/index.ts", "apps/server/src/assets.ts", "modules/artifacts/src/index.ts"]);
  const root = join(import.meta.dirname, "..");
  const users = ["apps", "packages", "modules", "plugins", "server", "horizontal"].flatMap(top => productSources(join(root, top)))
    .map(file => relative(root, file)).filter(path => !allowed.has(path) && /restoreArtifactVersions|restoreVersionStores/u.test(readFileSync(join(root, path), "utf8")));
  assert.deepEqual(users, []);
});

test("RAC-417 S-82 a name has one owner in the whole Home: a disabled owner still holds it, and so does one in another project", { timeout: 180_000 }, async t => {
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

test("RAC-417 S-82 every held installation names its own scope and install, and only that exact installation is left out of what others hold", { timeout: 180_000 }, async t => {
  const { home, pa, pb } = await twoProjects(t);
  const definition = plugin(PRODUCER, "1.0.0", ["example.note"]);
  await pa.supervisor.start([entry(definition)]);
  await pb.supervisor.start([entry(plugin(PRODUCER, "1.0.0", ["example.note"]))]);
  const [ia, ib] = [pa.supervisor.installation(PRODUCER)!.install_id, pb.supervisor.installation(PRODUCER)!.install_id];
  const held = heldInstalls(home).filter(item => item.record.plugin_id === PRODUCER);
  assert.deepEqual(held.map(item => item.scope).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))),
    [{ kind: "project", project_id: pa.projectId }, { kind: "project", project_id: pb.projectId }].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))), "each installation names the project it lives in");
  assert.equal(held.find(item => item.scope.kind === "project" && item.scope.project_id === pa.projectId)!.record.install_id, ia);
  const as = (projectId: string, installId: string) => ({ scope: { kind: "project" as const, project_id: projectId }, install_id: installId });
  assert.equal(pluginHeldElsewhere(home, PRODUCER, as(pa.projectId, ia)), true, "the other project's installation holds");
  assert.equal(pluginHeldElsewhere(home, PRODUCER, as(pb.projectId, ia)), true, "an install id under another scope is not the installation asking");
  assert.equal(pluginHeldElsewhere(home, PRODUCER, null), true, "the Home's own activation leaves nothing out");
  await pb.runtime.uninstall(ib, { retain_private_data: false });
  assert.equal(pluginHeldElsewhere(home, PRODUCER, as(pa.projectId, ia)), false, "the last installation asking holds nothing else");
  assert.equal(pluginHeldElsewhere(home, PRODUCER, as(pa.projectId, "another-install")), true, "an installation in the same scope that is not the one asking is not left out");
});

test("RAC-417 S-82 an enable asks too: a second owner that got in cannot be switched on, and an unreadable installation refuses", { timeout: 180_000 }, async t => {
  const { home, pa, pb } = await twoProjects(t);
  await pa.supervisor.start([entry(plugin(PRODUCER, "1.0.0", ["example.note"]))]);
  pa.supervisor.revoke(PRODUCER);
  // A second owner of the name, put into B by a Runtime that was not asked (a record from before the rule, or a hand-made one).
  const y = plugin(OTHER, "1.0.0", ["example.note"]);
  new SqlitePluginRuntimeReleaseArtifactRepository(pb.store.db).save(createPluginRuntimeReleaseArtifact(y.manifest, "export {}"));
  new PluginRuntime(new SqlitePluginRuntimeRepository(pb.store.db), undefined, { hostIds: ISOLATED_HOST_IDS }).install({ definition: y, deployment: "local", trust: UNSIGNED_TRUST, grants: [] });
  const state = await pa.supervisor.enable(PRODUCER);
  assert.equal(state.status, "failed", "the enable is refused");
  assert.equal(state.code, "plugin.definition_conflict");
  assert.match(state.message ?? "", /example\.note 已由 io\.molis\.work\.example\.other 声明/);
  assert.equal(artifactTypeDeclarations().get("example.note")?.plugin_id === PRODUCER, false, "and it stays out of the registry");

  // An installation whose Manifest was never kept cannot be read for its names, so it holds every name.
  const z = plugin("io.molis.work.example.unkept", "1.0.0", ["example.unkept"]);
  new PluginRuntime(new SqlitePluginRuntimeRepository(pb.store.db), undefined, { hostIds: ISOLATED_HOST_IDS }).install({ definition: z, deployment: "local", trust: UNSIGNED_TRUST, grants: [] });
  assert.throws(() => pa.install(plugin("io.molis.work.example.third", "1.0.0", ["example.third"])), { ...refusal, message: /读不到已装插件 io\.molis\.work\.example\.unkept 的 Manifest/ });
  assert.equal(heldInstalls(home).some(held => held.record.plugin_id === z.manifest.plugin_id && held.manifest === null), true);
});

/** A development installation: put in unsigned from a directory, with no release row kept for its Manifest. */
const bare = (definition: PluginDefinition) => ({ definition, trust: UNSIGNED_TRUST });

test("RAC-417 S-82 a development installation with no kept Manifest is not refused by its own record, and its running Manifest holds its names", { timeout: 180_000 }, async t => {
  const p = project(t, bareHome(t));
  await p.supervisor.start([bare(plugin(PRODUCER, "1.0.0", ["example.note"]))]);
  assert.equal(p.supervisor.state(PRODUCER)?.status ?? "running", "running", "a development installation starts");
  // Its own record has no Manifest to read, and it is the plugin being asked about: the name is its own, so nothing is refused.
  p.supervisor.revoke(PRODUCER);
  assert.equal((await p.supervisor.enable(PRODUCER)).status, "running", "its own enable is not refused by its own record");
  // Another plugin's names are held by the Manifest this project's supervisor is running for it.
  assert.throws(() => p.install(plugin(OTHER, "1.0.0", ["example.note"])), { ...refusal, message: /example\.note 已由 io\.molis\.work\.example\.notes 声明/ }, "a name the running development plugin declares");
  assert.doesNotThrow(() => p.install(plugin("io.molis.work.example.third", "1.0.0", ["example.third"])), "a plugin of other names installs next to it");
});

test("RAC-417 S-82 two development installations start together, whichever the supervisor reaches first", { timeout: 180_000 }, async t => {
  const p = project(t, bareHome(t));
  await p.supervisor.start([bare(plugin(PRODUCER, "1.0.0", ["example.note"])), bare(plugin(OTHER, "1.0.0", ["example.other"]))]);
  assert.deepEqual([PRODUCER, OTHER].map(id => p.supervisor.state(id)?.status), ["running", "running"], "both start");
  await p.supervisor.start([bare(plugin(PRODUCER, "1.0.0", ["example.note"])), bare(plugin(OTHER, "1.0.0", ["example.other"]))]);
  assert.deepEqual([PRODUCER, OTHER].map(id => p.supervisor.state(id)?.status), ["running", "running"], "and start again over their records");
});

test("RAC-417 S-82 a development installation in another project that cannot be read still refuses, never passes", { timeout: 180_000 }, async t => {
  const { pa, pb } = await twoProjects(t);
  await pb.supervisor.start([bare(plugin(PRODUCER, "1.0.0", ["example.note"]))]);
  assert.throws(() => pa.install(plugin(OTHER, "1.0.0", ["example.other"])), { ...refusal, message: /读不到已装插件 io\.molis\.work\.example\.notes 的 Manifest/ }, "only the project that runs it can say what it declares");
});

test("RAC-417 S-82 two Homes in one process do not share names", { timeout: 120_000 }, async t => {
  const one = project(t, bareHome(t)), two = project(t, bareHome(t));
  await one.supervisor.start([entry(plugin(PRODUCER, "1.0.0", ["example.note"]))]);
  assert.throws(() => one.install(plugin(OTHER, "1.0.0", ["example.note"])), refusal, "in the Home that holds the name");
  assert.doesNotThrow(() => two.install(plugin(OTHER, "1.0.0", ["example.note"])), "another Home's installation does not hold it");
  assert.doesNotThrow(() => one.install(plugin(PRODUCER, "2.0.0", ["example.note", "example.sheet"])), "the owner's own version change is not another owner");
});

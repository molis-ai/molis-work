import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { bindProjectArtifacts, DEMO_PROJECT_ID, LocalProjectDatabase, openProjectVersionStores, runLocalPluginDevelopment,
  runPluginDevelopment, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { CHARACTER_ARTIFACT_TYPE } from "@molis-ai/molis-work-contracts/modules/characters";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SqlitePluginPrivateStorage, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { homeSqlitePath, MEMORY_LEDGER_STORE } from "@molis-ai/molis-work-storage";
import { pluginActions } from "./fixtures/plugin-actions.js";

// `molis-work plugin dev` lists the 成果 versions the run's plugin published. A personal 成果 belongs to the Home's person whoever
// produced it (specs/artifact-positioning, 2026-10-07), so the run is told apart by the producing actor in `created_by`, not by owner.
const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("W3-07-6-01: plugin dev lists the 成果 versions the plugin published although the person owns them", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-dev-artifacts-"));
  try {
    // The repository sample, with the workspace SDK where `npm install` would put the packed one.
    const sample = join(directory, "sample");
    mkdirSync(sample);
    for (const file of ["index.mjs", "manifest.json", "package.json"]) cpSync(join(root, "examples/plugin-sample", file), join(sample, file));
    mkdirSync(join(sample, "node_modules/@molis-ai"), { recursive: true });
    symlinkSync(join(root, "packages/plugin-sdk"), join(sample, "node_modules/@molis-ai/molis-work-plugin-sdk"), "dir");
    const manifest = JSON.parse(readFileSync(join(sample, "manifest.json"), "utf8")) as { permissions: Array<{ permission: string }> };
    const run = () => runLocalPluginDevelopment({ directory: sample, state_directory: join(directory, "state"),
      grants: manifest.permissions.map(value => value.permission), allow_unsigned_development: true });

    const first = await run();
    assert.equal(first.poll.ok, true);
    assert.equal(first.artifacts.length, 1, "the version the plugin published is listed");
    assert.deepEqual([first.artifacts[0].owner_actor_id, first.artifacts[0].created_by], [LOCAL_PERSON_ACTOR_ID, "local-plugin-developer"]);
    assert.deepEqual(first.artifacts[0].payload, { title: "Local sample result", sequence: 1 });

    // Versions from earlier runs on the same development state stay listed.
    const second = await run();
    assert.deepEqual(second.artifacts.map(value => value.version).sort(), [1, 2]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});


// A3-DEV-01: this complete developer-door path reaches the Runtime client first. It does not prove declaredOnly rejected it.
test("W3-07-6-01 A3-DEV-01: Runtime refuses an undeclared development publication before the version owner", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-dev-undeclared-"));
  try {
    const sample = join(directory, "sample");
    mkdirSync(sample);
    for (const file of ["index.mjs", "package.json"]) cpSync(join(root, "examples/plugin-sample", file), join(sample, file));
    const manifest = JSON.parse(readFileSync(join(root, "examples/plugin-sample/manifest.json"), "utf8")) as { permissions: Array<{ permission: string }>; artifacts: { produces: unknown[] } };
    manifest.artifacts.produces = [];
    writeFileSync(join(sample, "manifest.json"), JSON.stringify(manifest));
    mkdirSync(join(sample, "node_modules/@molis-ai"), { recursive: true });
    symlinkSync(join(root, "packages/plugin-sdk"), join(sample, "node_modules/@molis-ai/molis-work-plugin-sdk"), "dir");
    const run = () => runLocalPluginDevelopment({ directory: sample, state_directory: join(directory, "state"),
      grants: manifest.permissions.map(value => value.permission), allow_unsigned_development: true });
    await assert.rejects(run(), { code: "artifacts.plugin_incompatible", message: "Manifest 未声明生产此成果 type/schema" });
    const file = join(directory, "state", "development.db");
    assert.equal(existsSync(file), true, "inspect the actual developer state, not a new empty database");
    const store = new LocalProjectDatabase(file);
    try {
      const versions = openProjectVersionStores(store);
      assert.deepEqual(versions.artifacts.query.listArtifacts("plugin-development"), []);
      const installed = new SqlitePluginRuntimeRepository(store.db).list().filter(row => row.plugin_id === "io.molis.work.example.notes");
      assert.equal(installed.length, 1);
      assert.equal(installed[0].state, "uninstalled");
      assert.deepEqual(versions.artifacts.query.listArtifactVersions("plugin-development", `${installed[0].install_id}:sample-result`), []);
    } finally { store.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

// Public Host ports with real SQLite owners, ActionService, private storage and the repository sample. No simulated declaration
// view: every new test receives the view made by runPluginDevelopment for the installation it actually creates.
function developmentRig(directory: string, failure?: "start" | "stop") {
  let store: LocalProjectDatabase | undefined;
  try {
    const sample = join(directory, "sample");
    mkdirSync(sample);
    for (const file of ["index.mjs", "manifest.json", "package.json"]) cpSync(join(root, "examples/plugin-sample", file), join(sample, file));
    mkdirSync(join(sample, "node_modules/@molis-ai"), { recursive: true });
    symlinkSync(join(root, "packages/plugin-sdk"), join(sample, "node_modules/@molis-ai/molis-work-plugin-sdk"), "dir");
    if (failure) {
      const file = join(sample, "index.mjs"), source = readFileSync(file, "utf8");
      const needle = failure === "start" ? "async start(context) {" : "definePlugin({";
      assert.ok(source.includes(needle));
      writeFileSync(file, source.replace(needle, failure === "start" ? 'async start(context) { throw new Error("development start failed");'
        : 'definePlugin({ async stop() { throw new Error("development stop failed"); },'));
    }
    const manifest = JSON.parse(readFileSync(join(sample, "manifest.json"), "utf8")) as PluginManifest;
    const file = join(directory, "project.db");
    seedDemoBoard(file);
    store = new LocalProjectDatabase(file);
    const versions = openProjectVersionStores(store);
    const repository = new SqlitePluginRuntimeRepository(store.db), privateStorage = new SqlitePluginPrivateStorage(store.db);
    const actions = pluginActions(store, DEMO_PROJECT_ID), ui = new UiHost();
    const options = { project_id: DEMO_PROJECT_ID, actor_id: "local-plugin-developer", repository, ...versions, actions, ui,
      privateStorageFor: (context, declaration) => privateStorage.forPlugin(context, declaration),
      deleteInstallationData: (id: string) => privateStorage.deleteInstallationData(id) } satisfies Parameters<typeof runPluginDevelopment>[1];
    const input = { directory: sample, project_id: DEMO_PROJECT_ID, grants: manifest.permissions.map(value => value.permission), allow_unsigned_development: true as const };
    return { manifest, store, versions, repository, actions, ui, input, options };
  } catch (error) {
    store?.close();
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

test("W3-07-6-01 A3-DEV-02: the real development installation view makes the version owner refuse undeclared types", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-dev-owner-layer-"));
  const rig = developmentRig(directory);
  let bound = 0, released = 0;
  const write = (type: string, id: string) => rig.versions.artifacts.commands.registerVersion({ project_id: DEMO_PROJECT_ID,
    actor_id: rig.options.actor_id, artifact_id: id, version: 1, artifact_type_id: type, schema_version: 1,
    producer: { plugin_id: rig.manifest.plugin_id, plugin_version: rig.manifest.version, binding_signature: rig.manifest.publisher.signature },
    content: { kind: "inline", payload: { title: "Owner boundary" } }, title: "Owner boundary", media_type: "application/json",
    origin: { kind: "pinned", subject: { kind: "item", id }, revision: "1" } });
  try {
    const result = await runPluginDevelopment(rig.input, { ...rig.options, bindInstallation: view => {
      bound++;
      assert.deepEqual(view.knownPluginIds(), [rig.manifest.plugin_id]);
      assert.deepEqual(view.effectiveManifests().map(value => [value.plugin_id, value.version, value.artifacts.produces]),
        [[rig.manifest.plugin_id, rig.manifest.version, rig.manifest.artifacts.produces]]);
      assert.equal(rig.repository.list()[0].state, "installed");
      const unbind = bindProjectArtifacts(rig.store.db, view);
      try {
        const before = rig.store.eventCursor(DEMO_PROJECT_ID);
        assert.deepEqual(rig.versions.artifacts.query.listArtifacts(DEMO_PROJECT_ID), []);
        // Direct trusted owner entry deliberately isolates A3. A plugin-facing publish of this type would be refused earlier
        // by the Runtime client, so this assertion does not claim that an undeclared publication passed through that client.
        assert.throws(() => write("example.undeclared", "owner-refused"), { code: "artifacts.artifact.type_undeclared",
          message: `${rig.manifest.plugin_id} 没有在 artifacts.produces 声明 example.undeclared@1，不能写入成果库` });
        assert.deepEqual(rig.versions.artifacts.query.listArtifacts(DEMO_PROJECT_ID), []);
        assert.deepEqual(rig.versions.artifacts.query.listArtifactVersions(DEMO_PROJECT_ID, "owner-refused"), []);
        assert.equal(rig.store.eventCursor(DEMO_PROJECT_ID), before, "A3 refusal records no version or business event");
        write(rig.manifest.artifacts.produces[0].artifact_type_id, "owner-declared");
        assert.deepEqual(rig.versions.artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, { artifact_id: "owner-declared", version: 1 })?.payload,
          { title: "Owner boundary" }, "the same real owner accepts this run's legitimate declaration");
      } catch (error) { unbind(); throw error; }
      return () => {
        released++;
        assert.equal(rig.repository.list()[0].state, "uninstalled", "uninstall happens before releasing the bound view");
        assert.deepEqual(view.effectiveManifests(), []);
        unbind();
      };
    } });
    assert.equal(result.poll.ok, true);
    assert.deepEqual([bound, released], [1, 1]);
    assert.throws(() => write(rig.manifest.artifacts.produces[0].artifact_type_id, "after-release"), {
      code: "artifacts.artifact.type_undeclared",
      message: `${rig.manifest.plugin_id} 没有找到这个项目的插件监督器，不能确认它装着，不能写入成果库`,
    }, "the view was actually removed, not merely made ineffective");
    assert.deepEqual(rig.versions.artifacts.query.listArtifactVersions(DEMO_PROJECT_ID, "after-release"), []);
  } finally { rig.store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("W3-07-6-01 A3-DEV-03: a throwing binding callback preserves its error and uninstalls before any plugin effects", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-dev-bind-failure-"));
  const rig = developmentRig(directory), expected = new Error("development installation binding failed");
  let captured: Parameters<NonNullable<Parameters<typeof runPluginDevelopment>[1]["bindInstallation"]>>[0] | undefined;
  try {
    await assert.rejects(runPluginDevelopment(rig.input, { ...rig.options, bindInstallation: view => {
      captured = view;
      assert.equal(rig.repository.list()[0].state, "installed", "installation actually happened before the callback failed");
      assert.equal(view.effectiveManifests()[0].plugin_id, rig.manifest.plugin_id);
      throw expected; // No release function was acquired; cleanup must not invent one.
    } }), error => error === expected);
    assert.ok(captured);
    assert.equal(rig.repository.list()[0].state, "uninstalled");
    assert.deepEqual(captured.effectiveManifests(), []);
    assert.deepEqual(rig.versions.artifacts.query.listArtifacts(DEMO_PROJECT_ID), []);
    assert.deepEqual(rig.ui.list(), []);
    assert.deepEqual(rig.actions.registry.registry.descriptors(), []);
    const reopened = new LocalProjectDatabase(join(directory, "project.db"));
    try {
      assert.equal(new SqlitePluginRuntimeRepository(reopened.db).list()[0].state, "uninstalled", "the cleanup survives reopening the real installation owner");
      assert.deepEqual(openProjectVersionStores(reopened).artifacts.query.listArtifacts(DEMO_PROJECT_ID), []);
    } finally { reopened.close(); }
  } finally { rig.store.close(); rmSync(directory, { recursive: true, force: true }); }
});

for (const failure of [undefined, "start", "stop"] as const) {
  test(`W3-07-6-01 A3-DEV-03: uninstall precedes one release on ${failure ?? "success"}`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "molis-dev-release-order-"));
    const rig = developmentRig(directory, failure), order: string[] = [];
    try {
      const result = runPluginDevelopment(rig.input, { ...rig.options, bindInstallation: view => {
        order.push(`bind:${rig.repository.list()[0].state}`);
        const unbind = bindProjectArtifacts(rig.store.db, view);
        return () => { order.push(`release:${rig.repository.list()[0].state}`); unbind(); };
      } });
      if (failure) await assert.rejects(result, (error: unknown) => error instanceof ActionError && error.code === "plugin.executor_failed");
      else assert.equal((await result).poll.ok, true);
      const state = failure === "stop" ? "crashed" : "uninstalled";
      assert.deepEqual(order, ["bind:installed", `release:${state}`]);
      assert.equal(rig.repository.list()[0].state, state);
      assert.deepEqual(rig.ui.list(), []);
      assert.deepEqual(rig.actions.registry.registry.descriptors(), []);
      assert.equal(rig.versions.artifacts.query.listArtifacts(DEMO_PROJECT_ID).length, failure === "start" ? 0 : 1,
        "start failure stores nothing; success and failed uninstall keep the published version under the existing retention contract");
    } finally { rig.store.close(); rmSync(directory, { recursive: true, force: true }); }
  });
}

test("W3-07-6-01: nonempty and unsupported development state are refused before loading code", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-dev-state-refusal-"));
  try {
    const ordinary = join(directory, "ordinary"), marked = join(directory, "marked"); mkdirSync(ordinary); mkdirSync(marked);
    writeFileSync(join(ordinary, "keep.txt"), "preserve this ordinary directory");
    writeFileSync(join(marked, ".molis-work-plugin-development.json"), JSON.stringify({ kind: "foreign", schema_version: 1 }));
    const input = { directory: join(directory, "does-not-exist"), grants: [], allow_unsigned_development: true as const };
    await assert.rejects(runLocalPluginDevelopment({ ...input, state_directory: ordinary }), /非空的普通目录/);
    await assert.rejects(runLocalPluginDevelopment({ ...input, state_directory: marked }), /不是受支持/);
    assert.equal(readFileSync(join(ordinary, "keep.txt"), "utf8"), "preserve this ordinary directory");
    assert.equal(existsSync(join(ordinary, "development.db")), false); assert.equal(existsSync(join(marked, "development.db")), false);
    // #1064: a valid developer-state marker does not adopt unknown pre-existing Home contents.
    const owned = join(directory, "owned"), home = join(owned, "home"); mkdirSync(home, { recursive: true });
    writeFileSync(join(owned, ".molis-work-plugin-development.json"), JSON.stringify({ kind: "molis-work-plugin-development", schema_version: 1 }));
    writeFileSync(join(home, "keep.txt"), "unadopted Home");
    await assert.rejects(runLocalPluginDevelopment({ ...input, state_directory: owned }), { code: "memory.unavailable" });
    assert.equal(readFileSync(join(home, "keep.txt"), "utf8"), "unadopted Home");
    assert.equal(existsSync(homeSqlitePath(home, MEMORY_LEDGER_STORE)), false, "no automatic adoption ledger was written");
    assert.equal(existsSync(join(owned, "development.db")), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

// S-82: the development run reserves the names this build ships, so a plugin learns here what its real install would refuse.
test("RAC-417 S-82 a development plugin that declares a type this build already owns is refused and stores nothing", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-dev-owned-type-"));
  try {
    const sample = join(directory, "sample");
    mkdirSync(sample);
    for (const file of ["index.mjs", "package.json"]) cpSync(join(root, "examples/plugin-sample", file), join(sample, file));
    const manifest = JSON.parse(readFileSync(join(root, "examples/plugin-sample/manifest.json"), "utf8")) as {
      permissions: Array<{ permission: string }>; artifacts: { produces: Array<{ artifact_type_id: string }>; consumes: Array<{ artifact_type_id: string }> } };
    manifest.artifacts.produces[0]!.artifact_type_id = CHARACTER_ARTIFACT_TYPE;
    manifest.artifacts.consumes = [];
    writeFileSync(join(sample, "manifest.json"), JSON.stringify(manifest));
    mkdirSync(join(sample, "node_modules/@molis-ai"), { recursive: true });
    symlinkSync(join(root, "packages/plugin-sdk"), join(sample, "node_modules/@molis-ai/molis-work-plugin-sdk"), "dir");
    await assert.rejects(runLocalPluginDevelopment({ directory: sample, state_directory: join(directory, "state"),
      grants: manifest.permissions.map(value => value.permission), allow_unsigned_development: true }), /character\.definition\.v1|已由/u);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

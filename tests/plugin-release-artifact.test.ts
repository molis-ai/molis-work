import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Database from "better-sqlite3";

import {
  parsePluginManifest,
  type PluginDefinition,
  type PluginInstanceRecord,
  type PluginManifest,
  type PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { createFilesPlugin } from "@molis-ai/molis-work-plugin-files";
import {
  NativePluginExecutor,
  PluginRuntime,
  PluginSupervisor,
  SqlitePluginPrivateStorage,
  SqlitePluginRuntimeReleaseArtifactRepository,
  SqlitePluginRuntimeRepository,
  pluginManifestDigest,
  type PluginSupervisorReport,
} from "@molis-ai/molis-work-plugin-runtime";
import { nativePluginReleaseArtifact } from "../apps/local-host/src/native-plugin-release-artifact.js";

const PLUGIN_ID = "io.molis.work.release-fixture";
const SIGNATURE = "release-fixture-publisher";

// Permissions the fixtures declare: two required ones, a second one a build may drop, one that stays optional, and one for private storage.
const READ = { permission: "artifact:read", required: true, reason: "读取绑定的文本快照" } as const;
const WRITE = { permission: "artifact:write", required: true, reason: "写入结果" } as const;
const KEPT = { permission: "feature:kept", required: false, reason: "两个构建都声明的可选能力" } as const;
const RETIRED = { permission: "feature:retired", required: false, reason: "只有旧构建声明的可选能力" } as const;
const NOTE = { permission: "storage:private", required: true, reason: "保存一条私人记录" } as const;

test("SQLite release artifacts restore an installed Native version after Host restart and keep updates manual", async () => {
  const db = new Database(":memory:");
  try {
    const runtimeRepository = new SqlitePluginRuntimeRepository(db);
    const releaseRepository = new SqlitePluginRuntimeReleaseArtifactRepository(db);
    let allowUpgrade = false;
    const started: string[] = [];
    const oldDefinition = definition("1.0.0", started);
    const candidate = definition("2.0.0", started, async () => {
      if (!allowUpgrade) throw new Error("fixture data check failed");
    }, { migratable_from_versions: ["1.0.0"] });

    const initialRuntime = new PluginRuntime(runtimeRepository, new NativePluginExecutor());
    const initial = new PluginSupervisor(initialRuntime, {
      releaseArtifacts: releaseRepository,
    });
    const firstReport = await initial.start([{
      definition: oldDefinition,
      releaseArtifact: { capture: () => "native-v1", restore: () => oldDefinition },
    }]);
    assert.deepEqual(firstReport.running, [PLUGIN_ID]);
    const installId = initial.state(PLUGIN_ID)?.install_id;
    assert.ok(installId);
    assert.equal(releaseRepository.get(PLUGIN_ID, SIGNATURE, "1.0.0", pluginManifestDigest(oldDefinition.manifest))?.module_source, "native-v1");
    await initialRuntime.stop(installId);

    // A fresh Runtime and Supervisor represent the next Host process. Its only
    // current definition is v2; the v1 implementation comes from SQLite.
    const restartedRuntime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
    const restarted = new PluginSupervisor(restartedRuntime, {
      releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db),
    });
    const restartedReport = await restarted.start([{
      definition: candidate,
      releaseArtifact: {
        capture: () => "native-v2",
        restore: source => source === "native-v1" ? oldDefinition : candidate,
      },
    }]);
    assert.deepEqual(restartedReport.running, [PLUGIN_ID]);
    assert.equal(restartedRuntime.get(installId).version, "1.0.0");
    assert.equal(restarted.manifest(PLUGIN_ID)?.version, "1.0.0");
    assert.equal(restarted.upgradeCandidates()[0]?.mode, "migratable");
    assert.equal(started.at(-1), "1.0.0");

    const failedUpgrade = await restarted.upgrade(PLUGIN_ID);
    assert.equal(failedUpgrade.status, "failed");
    assert.equal(restartedRuntime.get(installId).version, "1.0.0");
    assert.equal(restarted.state(PLUGIN_ID)?.status, "running");
    assert.equal(restartedRepositoryCount(new SqlitePluginRuntimeReleaseArtifactRepository(db)), 2);

    allowUpgrade = true;
    const upgraded = await restarted.upgrade(PLUGIN_ID);
    assert.equal(upgraded.status, "running");
    assert.equal(restartedRuntime.get(installId).version, "2.0.0");
    assert.equal(restarted.state(PLUGIN_ID)?.install_id, installId);
  } finally {
    db.close();
  }
});

test("Native plugin factory archives are bundled and rehydrated as exact definitions", async () => {
  const artifact = nativePluginReleaseArtifact<typeof createFilesPlugin>(
    "@molis-ai/molis-work-plugin-files",
    "createFilesPlugin",
    factory => factory({ readable: () => true }),
  );
  const current = createFilesPlugin({ readable: () => true });
  const source = await artifact.capture();
  const restored = await artifact.restore(source);
  assert.deepEqual(restored.manifest, current.manifest);
  assert.equal(typeof restored.start, "function");
});

test("an archived compatible Native release remains usable when a later candidate is incompatible", async () => {
  const db = new Database(":memory:");
  try {
    const started: string[] = [];
    const old = definition("1.0.0", started);
    const compatible = definition("2.0.0", started, undefined, { compatible_from_versions: ["1.0.0"] });
    const laterCandidate = definition("3.0.0", started);
    const runtime1 = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
    const installed = runtime1.install({ definition: old, deployment: "local" });
    await runtime1.start(installed.install.install_id);
    await runtime1.stop(installed.install.install_id);

    // This simulates an install that predates release archives. The first
    // compatible Host release can run and persist its own factory for later use.
    const runtime2 = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
    const host2 = new PluginSupervisor(runtime2, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db) });
    const report2 = await host2.start([{
      definition: compatible,
      releaseArtifact: { capture: () => "native-v2", restore: source => source === "native-v2" ? compatible : old },
    }]);
    assert.deepEqual(report2.running, [PLUGIN_ID]);
    assert.equal(runtime2.get(installed.install.install_id).version, "1.0.0");
    assert.equal(started.at(-1), "2.0.0");
    await runtime2.stop(installed.install.install_id);

    const runtime3 = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
    const host3 = new PluginSupervisor(runtime3, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db) });
    const report3 = await host3.start([{
      definition: laterCandidate,
      releaseArtifact: { capture: () => "native-v3", restore: source => source === "native-v2" ? compatible : laterCandidate },
    }]);
    assert.deepEqual(report3.running, [PLUGIN_ID]);
    assert.equal(runtime3.get(installed.install.install_id).version, "1.0.0");
    assert.equal(host3.manifest(PLUGIN_ID)?.version, "2.0.0");
    assert.equal(host3.upgradeCandidates()[0]?.target_version, "3.0.0");
    assert.equal(started.at(-1), "2.0.0");
  } finally {
    db.close();
  }
});

// A plugin that ships with the Host follows the Host's version (repository-anti-corruption §1, 2026-10-04): an older install
// moves up on start without any per-version declaration and runs the new code; it does not fall back to its old release.
test("a bundled Native plugin's older install moves up to the Host's version on start, without per-version declarations", async () => {
  const db = new Database(":memory:");
  try {
    const started: string[] = [];
    const oldDefinition = definition("1.0.0", started);
    const firstRuntime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
    const first = new PluginSupervisor(firstRuntime, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db) });
    await first.start([{ definition: oldDefinition, bundled: true, releaseArtifact: { capture: () => "native-v1", restore: () => oldDefinition } }]);
    const installId = first.state(PLUGIN_ID)?.install_id;
    assert.ok(installId);
    await firstRuntime.stop(installId);

    const candidate = definition("2.0.0", started);
    assert.equal(candidate.manifest.upgrade_compatibility, undefined, "no list of versions it can come from");
    const restartedRuntime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
    const restarted = new PluginSupervisor(restartedRuntime, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db) });
    const report = await restarted.start([{ definition: candidate, bundled: true,
      releaseArtifact: { capture: () => "native-v2", restore: source => source === "native-v1" ? oldDefinition : candidate } }]);
    assert.deepEqual(report.running, [PLUGIN_ID]);
    assert.equal(restartedRuntime.get(installId).version, "2.0.0", "the install record says what runs");
    assert.equal(restarted.state(PLUGIN_ID)?.install_id, installId, "the same install keeps its data");
    assert.equal(started.at(-1), "2.0.0", "the new code runs, not the old release");
  } finally {
    db.close();
  }
});

// docs/releases/POLICY.md section 7, the user's decision A (2026-10-08): a plugin that ships with the Host (a bundled Supervisor
// entry) runs the Host's build whatever its install record holds. Start moves the record to the build when the build's version is
// higher, lower, or the same with another Manifest digest; the record keeps its install, its installation generation and its
// private data, and the stored release of the recorded version is never restored for it. The tests below took the place of the
// two that pinned the old rule (a lower or a changed Manifest was not followed: the stored release kept running, or the plugin
// did not start); the old bodies live on further down for a plugin that is not bundled, whose rules did not change.
test("a bundled Manifest below the installed version is followed: the record moves down to it and the Host's code runs, with the stored release or without", async () => {
  for (const storedRelease of [true, false]) {
    const db = new Database(":memory:");
    try {
      const started: string[] = [], seen: Array<string | null> = [];
      const owner = new SqlitePluginPrivateStorage(db);
      const installed = definition("1.44.0", started, undefined, undefined,
        { permissions: [NOTE], publisherId: "molis-before", entrypoint: "./before.js", onStart: remember(owner, seen) });
      const lower = definition("0.3.0", started, undefined, undefined, { permissions: [NOTE], onStart: remember(owner, seen) });
      const restart = await installThenRestart(db, installed, lower, { bundled: true, storedRelease });
      const record = restart.runtime.get(restart.installId);

      assert.deepEqual(restart.report.running, [PLUGIN_ID], "the plugin starts: nothing needs the stored release of the installed version");
      assert.deepEqual(restart.report.failed, []);
      assert.equal(record.version, "0.3.0", "the install record says what runs");
      assert.equal(record.manifest_digest, pluginManifestDigest(lower.manifest));
      assert.equal(record.publisher_id, "fixture", "the publisher and the entrypoint are the build's");
      assert.equal(record.selected_entrypoint, "./index.js");
      assert.equal(restart.supervisor.state(PLUGIN_ID)?.install_id, restart.installId, "the same install keeps its data");
      assert.equal(record.installation_generation, restart.before.installation_generation, "and is the same installation");
      assert.equal(record.installed_at, restart.before.installed_at);
      assert.deepEqual(started, ["1.44.0", "0.3.0"], "after the restart the Host's code runs, not the installed version's");
      assert.deepEqual(seen, [null, "written by 1.44.0"], "and it reads what the installed version left in the install's private storage");
      assert.deepEqual(owner.snapshotInstallationData(restart.installId), [{ item_key: "note", item_value: "written by 0.3.0" }]);
      assert.deepEqual(restart.restored, [], "no stored release is restored");
      assert.equal(restart.supervisor.manifest(PLUGIN_ID)?.version, "0.3.0");
      assert.deepEqual(restart.supervisor.upgradeCandidates(), [], "a plugin that follows the Host has no market update pending");
      // docs/releases/CHECKLIST.md 4.5 compares the record's version and digest with the build's.
      assert.deepEqual(installedRecordsAsChecked(db), [[PLUGIN_ID, "0.3.0", pluginManifestDigest(lower.manifest)]]);
    } finally {
      db.close();
    }
  }
});

test("a bundled Manifest changed without a new version is followed: the record takes the new digest and the new build runs, with the stored build or without", async () => {
  for (const storedRelease of [true, false]) {
    const db = new Database(":memory:");
    try {
      const started: string[] = [], seen: Array<string | null> = [];
      const owner = new SqlitePluginPrivateStorage(db);
      const buildA = definition("0.3.0", started, undefined, undefined, { build: "A", permissions: [NOTE], onStart: remember(owner, seen) });
      const buildB = definition("0.3.0", started, undefined, undefined, { build: "B", permissions: [NOTE], onStart: remember(owner, seen) });
      assert.notEqual(pluginManifestDigest(buildA.manifest), pluginManifestDigest(buildB.manifest), "one field of the Manifest differs");
      const restart = await installThenRestart(db, buildA, buildB, { bundled: true, storedRelease });
      const record = restart.runtime.get(restart.installId);

      assert.deepEqual(restart.report.running, [PLUGIN_ID], "the plugin starts: nothing needs the stored build");
      assert.deepEqual(restart.report.failed, []);
      assert.equal(record.version, "0.3.0");
      assert.equal(record.manifest_digest, pluginManifestDigest(buildB.manifest), "the record takes the digest of the build that runs");
      assert.equal(record.installation_generation, restart.before.installation_generation, "it is still the same installation");
      assert.equal(restart.supervisor.state(PLUGIN_ID)?.install_id, restart.installId);
      // docs/releases/CHECKLIST.md 4.5 compares the record's version and digest with the build's, and finds them equal.
      assert.deepEqual(installedRecordsAsChecked(db), [[PLUGIN_ID, "0.3.0", pluginManifestDigest(buildB.manifest)]]);
      assert.ok(new SqlitePluginRuntimeReleaseArtifactRepository(db).get(PLUGIN_ID, SIGNATURE, "0.3.0", pluginManifestDigest(buildB.manifest)),
        "the release table has the record's own version and digest, which is where the Host reads the plugin's title");
      assert.deepEqual(started, ["0.3.0 A", "0.3.0 B"], "the changed build's code runs after the restart, the stored build's does not");
      assert.deepEqual(seen, [null, "written by 0.3.0 A"], "and it reads what the earlier build left in the install's private storage");
      assert.equal(restart.supervisor.manifest(PLUGIN_ID)?.name, "Release fixture B");
      assert.deepEqual(restart.restored, [], "no stored release is restored");
      assert.deepEqual(restart.supervisor.upgradeCandidates(), [], "the same version is not offered as an upgrade");
    } finally {
      db.close();
    }
  }
});

test("a bundled plugin follows the build in both directions, and the stored release of a version it comes back to is no more restored than any other", async () => {
  const db = new Database(":memory:");
  try {
    const started: string[] = [];
    const processes: HostProcess[] = [];
    for (const version of ["1.0.0", "0.3.0", "1.0.0"]) {
      processes.push(await startProcess(db, definition(version, started), { bundled: true, archive: [] }));
    }
    const installIds = processes.map(process => process.supervisor.state(PLUGIN_ID)?.install_id);
    assert.equal(new Set(installIds).size, 1, "one install throughout");
    assert.deepEqual(processes.map(process => process.report.running), [[PLUGIN_ID], [PLUGIN_ID], [PLUGIN_ID]]);
    assert.deepEqual(started, ["1.0.0", "0.3.0", "1.0.0"], "each start runs the Host's build");
    assert.deepEqual(processes.map(process => process.restored), [[], [], []], "the release stored for 1.0.0 is not restored when 1.0.0 comes back, nor at any other start");
    assert.equal(processes[2]!.runtime.get(installIds[0]!).version, "1.0.0");
    assert.equal(new SqlitePluginRuntimeReleaseArtifactRepository(db).list(PLUGIN_ID, SIGNATURE).length, 2, "one stored release per build");
  } finally {
    db.close();
  }
});

// The grants a followed record ends with, in every direction: what the person holds and the new Manifest still declares stays,
// what it requires is added, what it no longer declares goes (the rule the upward follow has had since 2026-10-04).
for (const [target, installedVersion, hostVersion] of [["a higher version", "0.2.0", "0.3.0"], ["a lower version", "1.44.0", "0.3.0"], ["the same version with another Manifest", "0.3.0", "0.3.0"]] as const) {
  test(`a bundled follow to ${target} converges the grants: kept when still declared, added when required, dropped when no longer declared`, async () => {
    const db = new Database(":memory:");
    try {
      const started: string[] = [], held: string[][] = [];
      const record = (context: PluginStartContext) => { held.push([...context.grants]); };
      const installed = definition(installedVersion, started, undefined, undefined, { permissions: [READ, KEPT, RETIRED], onStart: record });
      const host = definition(hostVersion, started, undefined, undefined, { permissions: [READ, WRITE, KEPT], onStart: record });
      assert.notEqual(pluginManifestDigest(installed.manifest), pluginManifestDigest(host.manifest));
      const restart = await installThenRestart(db, installed, host, { bundled: true, storedRelease: true, grants: ["artifact:read", "feature:kept", "feature:retired"] });
      const converged = ["artifact:read", "artifact:write", "feature:kept"];

      assert.deepEqual(restart.before.grants, ["artifact:read", "feature:kept", "feature:retired"], "what the person held before");
      assert.deepEqual(restart.report.running, [PLUGIN_ID]);
      assert.deepEqual(restart.runtime.get(restart.installId).grants, converged);
      assert.deepEqual(held.at(-1), converged, "the code that runs holds exactly those");

      const again = await startProcess(db, definition(hostVersion, started, undefined, undefined, { permissions: [READ, WRITE, KEPT], onStart: record }), { bundled: true, archive: [] });
      assert.deepEqual(again.report.failed, [], "the next start of the same build is not a silent grant change");
      assert.deepEqual(again.report.running, [PLUGIN_ID]);
      assert.deepEqual(again.runtime.get(restart.installId).grants, converged);
    } finally {
      db.close();
    }
  });
}

test("a bundled plugin whose new Manifest asks for another required permission is granted it, as when the Host's version is higher, with a same-version declaration or without", async () => {
  const outcome = async (version: string, declaration?: PluginManifest["upgrade_compatibility"]) => {
    const db = new Database(":memory:");
    try {
      const installed = definition("0.3.0", [], undefined, undefined, { build: "A", permissions: [READ] });
      const widened = definition(version, [], undefined, declaration, { build: "B", permissions: [READ, WRITE] });
      const restart = await installThenRestart(db, installed, widened, { bundled: true, storedRelease: true });
      return { running: restart.report.running, failed: restart.report.failed, grants: restart.runtime.get(restart.installId).grants };
    } finally {
      db.close();
    }
  };
  const upward = await outcome("0.4.0");
  assert.deepEqual(upward, { running: [PLUGIN_ID], failed: [], grants: ["artifact:read", "artifact:write"] }, "the upward rule grants what the new Manifest requires, as a fresh install would");
  assert.deepEqual(await outcome("0.3.0", { compatible_from_versions: ["0.3.0"] }), upward, "a same-version declaration changes nothing for a bundled plugin");
  assert.deepEqual(await outcome("0.3.0"), upward);
});

test("PluginRuntime.install with bundled moves the record to the build whatever its version, and keeps what is the installation's rather than the build's", async () => {
  for (const [direction, installedVersion, hostVersion] of [["lower", "1.44.0", "0.3.0"], ["higher", "0.2.0", "0.3.0"], ["the same version", "0.3.0", "0.3.0"]] as const) {
    const db = new Database(":memory:");
    try {
      const installed = definition(installedVersion, [], undefined, undefined, { build: "before", publisherId: "molis-before", entrypoint: "./before.js" });
      const host = definition(hostVersion, [], undefined, undefined, { build: "after" });
      const earlier = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
      const first = earlier.install({ definition: installed, deployment: "local", bundled: true }).install;
      await earlier.start(first.install_id);
      await earlier.stop(first.install_id);
      const switchedOff = earlier.get(first.install_id);
      assert.equal(switchedOff.state, "disabled", direction);

      // The build that follows is another Host process's: one process never holds two implementations of one identity.
      const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
      const receipt = runtime.install({ definition: host, deployment: "local", bundled: true });
      const record = receipt.install;
      assert.equal(receipt.replayed, false, direction);
      assert.equal(record.version, hostVersion, direction);
      assert.equal(record.manifest_digest, pluginManifestDigest(host.manifest), direction);
      assert.equal(record.publisher_id, "fixture", direction);
      assert.equal(record.selected_entrypoint, "./index.js", direction);
      for (const field of ["install_id", "installation_generation", "plugin_id", "publisher_signature", "deployment", "execution", "state",
        "recovery_count", "last_error_code", "installed_at", "uninstalled_at", "retain_private_data"] as const) {
        assert.deepEqual(record[field], switchedOff[field], `${direction}: ${field} stays`);
      }
      assert.deepEqual(runtime.get(first.install_id), record, `${direction}: the repository holds the record that was returned`);
      assert.equal(runtime.install({ definition: host, deployment: "local", bundled: true }).replayed, true, `${direction}: the same build again changes nothing`);
      // The build is what starts, and it starts from the record it was moved onto.
      await runtime.start(first.install_id);
      assert.equal(runtime.get(first.install_id).state, "running", direction);
      await runtime.stop(first.install_id);
    } finally {
      db.close();
    }
  }
});

test("following a bundled build never changes the deployment of an installation", () => {
  const db = new Database(":memory:");
  try {
    const entrypoints: PluginManifest["entrypoints"] = [{ deployment: "local", entrypoint: "./index.js" }, { deployment: "server", entrypoint: "./server.js" }];
    const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
    const installed = runtime.install({ definition: definition("1.0.0", [], undefined, undefined, { entrypoints }), deployment: "local", bundled: true }).install;
    assert.throws(() => runtime.install({ definition: definition("0.3.0", [], undefined, undefined, { entrypoints }), deployment: "server", bundled: true }),
      (error: unknown) => (error as { code?: string }).code === "plugin_state_invalid" && /部署环境/.test((error as Error).message));
    assert.deepEqual(runtime.get(installed.install_id), installed, "the refused follow left the record as it was");
  } finally {
    db.close();
  }
});

test("a bundled plugin that could not start on the new build still has no market update pending, while a plugin that is not bundled keeps the update it is offered", async () => {
  for (const bundled of [true, false]) {
    const db = new Database(":memory:");
    try {
      const installed = definition("1.0.0", []);
      const absent = [{ capability_id: "io.molis.work.absent.v1", version: 1, reason: "nobody provides it" }];
      const next = definition("2.0.0", [], undefined, undefined, { requires: absent });
      const restart = await installThenRestart(db, installed, next, { bundled, storedRelease: true });
      assert.equal(restart.runtime.get(restart.installId).version, "1.0.0", "the record moves only when the build starts");
      if (bundled) {
        assert.deepEqual(restart.report.running, []);
        assert.equal(restart.report.blocked[0]?.code, "capability_missing", "the build is blocked by a requirement nobody provides");
        assert.deepEqual(restart.supervisor.upgradeCandidates(), [], "a bundled plugin follows the Host at start: the market has nothing to confirm for it");
      } else {
        assert.deepEqual(restart.supervisor.upgradeCandidates().map(candidate => [candidate.installed_version, candidate.target_version, candidate.mode]),
          [["1.0.0", "2.0.0", "unsupported"]], "any other plugin is offered the version, and can say yes");
      }
    } finally {
      db.close();
    }
  }
});

// The rules of everything that is not bundled did not change with decision A. Until a person confirms it in the market (or the
// Manifest declares the installed version as a source), a lower or a changed Manifest is not followed: the stored release of the
// recorded version keeps running, or, without it, the plugin does not start. These are the bodies of the two tests that used to
// pin the same behaviour for bundled entries, with the entries no longer marked bundled.
test("a Manifest below the installed version is not followed for a plugin that is not bundled: the stored release keeps running, or the plugin does not start", async () => {
  for (const storedRelease of [true, false]) {
    const db = new Database(":memory:");
    try {
      const started: string[] = [];
      const installedDefinition = definition("1.44.0", started);
      const firstRuntime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
      const first = new PluginSupervisor(firstRuntime, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db) });
      await first.start([{ definition: installedDefinition,
        releaseArtifact: { capture: () => "native-1.44", restore: () => installedDefinition } }]);
      const installId = first.state(PLUGIN_ID)?.install_id;
      assert.ok(installId);
      await firstRuntime.stop(installId);
      if (!storedRelease) db.exec("DELETE FROM plugin_runtime_release_artifacts");

      const lowerDefinition = definition("0.3.0", started);
      const restartedRuntime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
      const restarted = new PluginSupervisor(restartedRuntime, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db) });
      const report = await restarted.start([{ definition: lowerDefinition,
        releaseArtifact: { capture: () => "native-0.3", restore: source => source === "native-1.44" ? installedDefinition : lowerDefinition } }]);

      assert.equal(restartedRuntime.get(installId).version, "1.44.0", "the install record is never lowered");
      assert.deepEqual(restarted.upgradeCandidates(), [], "a lower target is not offered as an upgrade");
      assert.ok(!started.includes("0.3.0"), "the lower Manifest's code never runs");
      if (storedRelease) {
        assert.deepEqual(report.running, [PLUGIN_ID], "no error: the old code keeps running");
        assert.equal(restarted.manifest(PLUGIN_ID)?.version, "1.44.0");
        assert.equal(started.at(-1), "1.44.0");
      } else {
        assert.deepEqual(report.running, []);
        assert.equal(report.failed[0]?.code, "plugin_release_artifact_missing");
      }
    } finally {
      db.close();
    }
  }
});

test("a Manifest changed without a new version is not followed for a plugin that is not bundled: the stored build keeps running, or the plugin does not start", async () => {
  for (const storedRelease of [true, false]) {
    const db = new Database(":memory:");
    try {
      const started: string[] = [];
      const buildA = definition("0.3.0", started, undefined, undefined, { build: "A" });
      const buildB = definition("0.3.0", started, undefined, undefined, { build: "B" });
      assert.notEqual(pluginManifestDigest(buildA.manifest), pluginManifestDigest(buildB.manifest), "one field of the Manifest differs");
      const firstRuntime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
      const first = new PluginSupervisor(firstRuntime, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db) });
      await first.start([{ definition: buildA, releaseArtifact: { capture: () => "native-A", restore: () => buildA } }]);
      const installId = first.state(PLUGIN_ID)?.install_id;
      assert.ok(installId);
      await firstRuntime.stop(installId);
      if (!storedRelease) db.exec("DELETE FROM plugin_runtime_release_artifacts");

      const restartedRuntime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
      const restarted = new PluginSupervisor(restartedRuntime, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db) });
      const report = await restarted.start([{ definition: buildB,
        releaseArtifact: { capture: () => "native-B", restore: source => source === "native-A" ? buildA : buildB } }]);

      const record = restartedRuntime.get(installId);
      assert.equal(record.version, "0.3.0");
      assert.equal(record.manifest_digest, pluginManifestDigest(buildA.manifest), "the record keeps the digest of the build it was installed from");
      // docs/releases/CHECKLIST.md 4.5 finds this by comparing the record's version and digest with the build's.
      assert.deepEqual(installedRecordsAsChecked(db), [[PLUGIN_ID, "0.3.0", pluginManifestDigest(buildA.manifest)]]);
      assert.equal(new SqlitePluginRuntimeReleaseArtifactRepository(db).get(PLUGIN_ID, SIGNATURE, "0.3.0", pluginManifestDigest(buildB.manifest)), null,
        "the changed build was never directly usable, so its release was not stored");
      assert.deepEqual(restarted.upgradeCandidates(), [], "the same version is not offered as an upgrade");
      assert.ok(!started.includes("0.3.0 B"), "the changed build's code never runs");
      if (storedRelease) {
        assert.deepEqual(report.running, [PLUGIN_ID], "no error: the old build keeps running");
        assert.equal(restarted.manifest(PLUGIN_ID)?.name, "Release fixture A");
        assert.equal(started.at(-1), "0.3.0 A");
      } else {
        assert.deepEqual(report.running, []);
        assert.equal(report.failed[0]?.code, "plugin_release_artifact_missing");
      }
    } finally {
      db.close();
    }
  }
});

test("PluginRuntime.install without bundled refuses a lower version, a higher version without a declaration, and the same version with another Manifest", () => {
  const db = new Database(":memory:");
  try {
    const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
    const refusal = (candidate: PluginDefinition) => {
      try { runtime.install({ definition: candidate, deployment: "local" }); return undefined; }
      catch (error) { return (error as { code?: string }).code; }
    };
    runtime.install({ definition: definition("0.3.0", [], undefined, undefined, { build: "A" }), deployment: "local" });
    assert.equal(refusal(definition("0.2.0", [])), "plugin_upgrade_required", "a lower version is not an install over this one");
    assert.equal(refusal(definition("0.4.0", [])), "plugin_upgrade_required", "a higher one needs the declaration, or the person's confirmation in the market");
    assert.equal(refusal(definition("0.3.0", [], undefined, undefined, { build: "B" })), "plugin_definition_conflict");
    assert.equal(runtime.list()[0]?.version, "0.3.0", "nothing moved");
    assert.equal(runtime.list()[0]?.manifest_digest, pluginManifestDigest(definition("0.3.0", [], undefined, undefined, { build: "A" }).manifest));
  } finally {
    db.close();
  }
});

test("PluginRuntime.install refuses the same version with another Manifest, and only a same-version declaration lets it through", () => {
  const db = new Database(":memory:");
  try {
    const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
    const buildA = definition("0.3.0", [], undefined, undefined, { build: "A" });
    runtime.install({ definition: buildA, deployment: "local" });
    assert.throws(() => runtime.install({ definition: definition("0.3.0", [], undefined, undefined, { build: "B" }), deployment: "local" }),
      (error: unknown) => (error as { code?: string }).code === "plugin_definition_conflict" && /请递增版本/.test((error as Error).message));
    // The one way through is the Manifest naming its own version as a compatible source (the Manifest contract allows exactly that).
    const declared = definition("0.3.0", [], undefined, { compatible_from_versions: ["0.3.0"] }, { build: "B" });
    assert.doesNotThrow(() => runtime.install({ definition: declared, deployment: "local" }));
  } finally {
    db.close();
  }
});

test("a same-version declaration lets the changed build run without touching the record for a plugin that is not bundled, but only while the grants stay the same", async () => {
  const db = new Database(":memory:");
  try {
    const started: string[] = [];
    const permission = { permission: "artifact:read", required: true, reason: "读取绑定的文本快照" } as const;
    const buildA = definition("0.3.0", started, undefined, undefined, { build: "A", permissions: [permission] });
    const firstRuntime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
    const first = new PluginSupervisor(firstRuntime, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db) });
    await first.start([{ definition: buildA, releaseArtifact: { capture: () => "native-A", restore: () => buildA } }]);
    const installId = first.state(PLUGIN_ID)?.install_id;
    assert.ok(installId);
    await firstRuntime.stop(installId);

    const startWith = async (candidate: PluginDefinition, tag: string) => {
      const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
      const supervisor = new PluginSupervisor(runtime, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db) });
      const report = await supervisor.start([{ definition: candidate,
        releaseArtifact: { capture: () => tag, restore: source => source === "native-A" ? buildA : candidate } }]);
      const record = runtime.get(installId);
      await runtime.stop(installId).catch(() => undefined);
      return { report, record };
    };
    const declaration = { compatible_from_versions: ["0.3.0"] };

    const changedBuild = definition("0.3.0", started, undefined, declaration, { build: "B", permissions: [permission] });
    const changed = await startWith(changedBuild, "native-B");
    assert.deepEqual(changed.report.running, [PLUGIN_ID]);
    assert.equal(started.at(-1), "0.3.0 B", "the changed build's code runs");
    assert.equal(changed.record.manifest_digest, pluginManifestDigest(buildA.manifest), "the record keeps the digest of the first build");
    assert.ok(new SqlitePluginRuntimeReleaseArtifactRepository(db).get(PLUGIN_ID, SIGNATURE, "0.3.0", pluginManifestDigest(changedBuild.manifest)),
      "the release table has the build that runs, which is where to look when the record's digest is the first build's");

    const again = await startWith(definition("0.3.0", started, undefined, declaration, { build: "C", permissions: [permission] }), "native-C");
    assert.deepEqual(again.report.running, [PLUGIN_ID]);
    assert.equal(started.at(-1), "0.3.0 C");
    assert.equal(again.record.manifest_digest, pluginManifestDigest(buildA.manifest), "the stored digest is never updated, so it cannot say which build runs");

    const extraPermission = { permission: "artifact:write", required: true, reason: "写入结果" } as const;
    const widened = await startWith(definition("0.3.0", started, undefined, declaration, { build: "D", permissions: [permission, extraPermission] }), "native-D");
    assert.deepEqual(widened.report.running, [], "a Manifest that needs another grant does not start without a version bump");
    assert.equal(widened.report.failed[0]?.code, "plugin_state_invalid");
    assert.ok(!started.includes("0.3.0 D"));
  } finally {
    db.close();
  }
});

test("a Manifest cannot declare an upgrade source that is not older than itself, so a lower version cannot list the higher install", () => {
  assert.throws(() => parsePluginManifest(definition("0.3.0", [], undefined, { compatible_from_versions: ["1.44.0"] }).manifest),
    /升级来源版本必须早于当前 Manifest 版本/);
});

// The query docs/releases/CHECKLIST.md 4.5 tells the releaser to run on a project database, read out of the checklist itself.
function checklistInstalledRecordsQuery(): string {
  const checklist = readFileSync(new URL("../docs/releases/CHECKLIST.md", import.meta.url), "utf8");
  const query = checklist.match(/SELECT json_extract\(record_json,'\$\.plugin_id'\)[^`]*FROM plugin_runtime_installs;/)?.[0];
  assert.ok(query, "the checklist carries the installed-record query");
  return query;
}

/** What that query returns on a project database: plugin id, version, digest of each installation record. */
function installedRecordsAsChecked(db: Database.Database): unknown[][] {
  return db.prepare(checklistInstalledRecordsQuery()).all().map(row => Object.values(row as Record<string, unknown>).slice(0, 3));
}

function restartedRepositoryCount(repository: SqlitePluginRuntimeReleaseArtifactRepository): number {
  return repository.list(PLUGIN_ID, SIGNATURE).length;
}

/** What a build does on start: read the note an earlier build left in the install's private storage, then leave its own. */
function remember(owner: SqlitePluginPrivateStorage, seen: Array<string | null>) {
  return (context: PluginStartContext, manifest: PluginManifest, label: string) => {
    const storage = owner.forPlugin(context, manifest);
    seen.push(storage.get("note"));
    storage.set("note", `written by ${label}`);
  };
}

interface HostProcess {
  runtime: PluginRuntime;
  supervisor: PluginSupervisor;
  report: PluginSupervisorReport;
  /** The release sources this process's Supervisor was asked to restore. */
  restored: string[];
}

/**
 * One Host process over a project database: a fresh Runtime and Supervisor, the way a restart builds them, started with the
 * one entry the build carries. `archive` is every definition an earlier process stored a release of, which `restore` can return.
 */
async function startProcess(db: Database.Database, candidate: PluginDefinition,
  options: { bundled: boolean; archive: PluginDefinition[]; grants?: string[] }): Promise<HostProcess> {
  const restored: string[] = [];
  const label = (definition: PluginDefinition) => `native-${definition.manifest.version}-${pluginManifestDigest(definition.manifest).slice(0, 8)}`;
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
  const supervisor = new PluginSupervisor(runtime, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db) });
  const report = await supervisor.start([{
    definition: candidate,
    ...(options.bundled ? { bundled: true } : {}),
    ...(options.grants ? { grants: options.grants } : {}),
    releaseArtifact: {
      capture: () => label(candidate),
      restore: source => {
        restored.push(source);
        const found = [...options.archive, candidate].find(definition => label(definition) === source);
        if (!found) throw new Error(`no release stored as ${source}`);
        return found;
      },
    },
  }]);
  return { runtime, supervisor, report, restored };
}

interface Restart extends HostProcess {
  installId: string;
  /** The record as the first process left it. */
  before: PluginInstanceRecord;
}

/**
 * A Host process starts `installed` and shuts down normally; the next process starts `candidate` over the same database.
 * `storedRelease: false` is a database whose stored releases are gone, `grants` what the first install is given.
 */
async function installThenRestart(db: Database.Database, installed: PluginDefinition, candidate: PluginDefinition,
  options: { bundled: boolean; storedRelease: boolean; grants?: string[] }): Promise<Restart> {
  const first = await startProcess(db, installed, { bundled: options.bundled, archive: [], ...(options.grants ? { grants: options.grants } : {}) });
  const installId = first.supervisor.state(PLUGIN_ID)?.install_id;
  assert.ok(installId, "the first process installed and started the plugin");
  await first.runtime.stop(installId, { preserve_enabled: true });
  const before = first.runtime.get(installId);
  if (!options.storedRelease) db.exec("DELETE FROM plugin_runtime_release_artifacts");
  return { installId, before, ...await startProcess(db, candidate, { bundled: options.bundled, archive: [installed] }) };
}

// `variant` makes a second build of the same version: another name (so another Manifest digest), the build tag the start
// records, and optionally another permission list, publisher, entrypoints, requirements, or something to do on start.
function definition(
  version: string,
  started: string[],
  validateUpgrade?: PluginDefinition["validateUpgrade"],
  upgradeCompatibility?: PluginManifest["upgrade_compatibility"],
  variant?: {
    build?: string;
    permissions?: PluginManifest["permissions"];
    publisherId?: string;
    entrypoint?: string;
    entrypoints?: PluginManifest["entrypoints"];
    requires?: PluginManifest["requires"];
    onStart?: (context: PluginStartContext, manifest: PluginManifest, label: string) => void;
  },
): PluginDefinition {
  const label = variant?.build ? `${version} ${variant.build}` : version;
  const manifest: PluginManifest = {
    schema_version: 2,
    host_api_version: 2,
    plugin_id: PLUGIN_ID,
    version,
    name: variant?.build ? `Release fixture ${variant.build}` : "Release fixture",
    kind: "app",
    publisher: { publisher_id: variant?.publisherId ?? "fixture", signature: SIGNATURE },
    entrypoints: variant?.entrypoints ?? [{ deployment: "local", entrypoint: variant?.entrypoint ?? "./index.js" }],
    permissions: variant?.permissions ?? [],
    capabilities: { provides: [], consumes: variant?.requires?.map(requirement => requirement.capability_id) ?? [] },
    artifacts: { produces: [], consumes: [] },
    ui: { contributions: [] },
    ...(variant?.requires ? { requires: variant.requires } : {}),
    ...(upgradeCompatibility ? { upgrade_compatibility: upgradeCompatibility } : {}),
  };
  return {
    manifest,
    ...(validateUpgrade ? { validateUpgrade } : {}),
    async start(context) {
      started.push(label);
      variant?.onStart?.(context, manifest, label);
      return { kind: "app", views: [] };
    },
  };
}

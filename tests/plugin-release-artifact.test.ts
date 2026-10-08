import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import { parsePluginManifest, type PluginDefinition, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createFilesPlugin } from "@molis-ai/molis-work-plugin-files";
import {
  NativePluginExecutor,
  PluginRuntime,
  PluginSupervisor,
  SqlitePluginRuntimeReleaseArtifactRepository,
  SqlitePluginRuntimeRepository,
  pluginManifestDigest,
} from "@molis-ai/molis-work-plugin-runtime";
import { nativePluginReleaseArtifact } from "../apps/local-host/src/native-plugin-release-artifact.js";

const PLUGIN_ID = "io.molis.work.release-fixture";
const SIGNATURE = "release-fixture-publisher";

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

// docs/releases/POLICY.md section 7: the Manifest versions of the built-in plugins are to be reset to the product version (below
// what existing Homes have installed). The Runtime only follows the Host upward, so a lower bundled Manifest is neither
// followed nor refused: the stored release of the installed version keeps running, and without that release the plugin does
// not start. This pins that behaviour so the reset is a decision and not an accident. When the rule changes (W5-15), replace
// this test with the new rule's; do not just delete it.
test("a bundled Manifest below the installed version is not followed: the stored release keeps running, or the plugin does not start", async () => {
  for (const storedRelease of [true, false]) {
    const db = new Database(":memory:");
    try {
      const started: string[] = [];
      const installedDefinition = definition("1.44.0", started);
      const firstRuntime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
      const first = new PluginSupervisor(firstRuntime, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db) });
      await first.start([{ definition: installedDefinition, bundled: true,
        releaseArtifact: { capture: () => "native-1.44", restore: () => installedDefinition } }]);
      const installId = first.state(PLUGIN_ID)?.install_id;
      assert.ok(installId);
      await firstRuntime.stop(installId);
      if (!storedRelease) db.exec("DELETE FROM plugin_runtime_release_artifacts");

      const lowerDefinition = definition("0.3.0", started);
      const restartedRuntime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
      const restarted = new PluginSupervisor(restartedRuntime, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db) });
      const report = await restarted.start([{ definition: lowerDefinition, bundled: true,
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

test("a Manifest cannot declare an upgrade source that is not older than itself, so a lower version cannot list the higher install", () => {
  assert.throws(() => parsePluginManifest(definition("0.3.0", [], undefined, { compatible_from_versions: ["1.44.0"] }).manifest),
    /升级来源版本必须早于当前 Manifest 版本/);
});

function restartedRepositoryCount(repository: SqlitePluginRuntimeReleaseArtifactRepository): number {
  return repository.list(PLUGIN_ID, SIGNATURE).length;
}

function definition(
  version: string,
  started: string[],
  validateUpgrade?: PluginDefinition["validateUpgrade"],
  upgradeCompatibility?: PluginManifest["upgrade_compatibility"],
): PluginDefinition {
  const manifest: PluginManifest = {
    schema_version: 2,
    host_api_version: 2,
    plugin_id: PLUGIN_ID,
    version,
    name: "Release fixture",
    kind: "app",
    publisher: { publisher_id: "fixture", signature: SIGNATURE },
    entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [],
    capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] },
    ui: { contributions: [] },
    ...(upgradeCompatibility ? { upgrade_compatibility: upgradeCompatibility } : {}),
  };
  return {
    manifest,
    ...(validateUpgrade ? { validateUpgrade } : {}),
    async start() {
      started.push(version);
      return { kind: "app", views: [] };
    },
  };
}

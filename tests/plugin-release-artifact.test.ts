import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

// docs/releases/POLICY.md section 7.3, the second shape: the install record has the Manifest's version and another digest
// (`pluginManifestDigest` covers the whole Manifest, including the action tables it imports). It already happens on main
// whenever a built-in Manifest, or something it imports, changes without a version bump (at least 24 times between 2026-09-26 and 2026-10-08), and it
// becomes the normal state of every such change once the Manifest versions equal the product version and the version only
// changes in the release PR. That is not "directly usable": the stored build of the recorded digest keeps running, or,
// without it, the plugin does not start. When the rule changes (W5-15), replace these tests with the new rule's; do not just
// delete them.
test("a bundled Manifest changed without a new version is not followed: the stored build keeps running, or the plugin does not start", async () => {
  for (const storedRelease of [true, false]) {
    const db = new Database(":memory:");
    try {
      const started: string[] = [];
      const buildA = definition("0.3.0", started, undefined, undefined, { build: "A" });
      const buildB = definition("0.3.0", started, undefined, undefined, { build: "B" });
      assert.notEqual(pluginManifestDigest(buildA.manifest), pluginManifestDigest(buildB.manifest), "one field of the Manifest differs");
      const firstRuntime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
      const first = new PluginSupervisor(firstRuntime, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db) });
      await first.start([{ definition: buildA, bundled: true, releaseArtifact: { capture: () => "native-A", restore: () => buildA } }]);
      const installId = first.state(PLUGIN_ID)?.install_id;
      assert.ok(installId);
      await firstRuntime.stop(installId);
      if (!storedRelease) db.exec("DELETE FROM plugin_runtime_release_artifacts");

      const restartedRuntime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
      const restarted = new PluginSupervisor(restartedRuntime, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db) });
      const report = await restarted.start([{ definition: buildB, bundled: true,
        releaseArtifact: { capture: () => "native-B", restore: source => source === "native-A" ? buildA : buildB } }]);

      const record = restartedRuntime.get(installId);
      assert.equal(record.version, "0.3.0");
      assert.equal(record.manifest_digest, pluginManifestDigest(buildA.manifest), "the record keeps the digest of the build it was installed from");
      // docs/releases/CHECKLIST.md 4.5 finds this by comparing the record's version and digest with the build's.
      assert.deepEqual(db.prepare(checklistInstalledRecordsQuery()).all().map(row => Object.values(row as Record<string, unknown>).slice(0, 3)),
        [[PLUGIN_ID, "0.3.0", pluginManifestDigest(buildA.manifest)]]);
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

test("PluginRuntime.install refuses the same version with another Manifest, and only a same-version declaration lets it through", () => {
  const db = new Database(":memory:");
  try {
    const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
    const buildA = definition("0.3.0", [], undefined, undefined, { build: "A" });
    runtime.install({ definition: buildA, deployment: "local", bundled: true });
    assert.throws(() => runtime.install({ definition: definition("0.3.0", [], undefined, undefined, { build: "B" }), deployment: "local", bundled: true }),
      (error: unknown) => (error as { code?: string }).code === "plugin_definition_conflict" && /请递增版本/.test((error as Error).message));
    // The one way through is the Manifest naming its own version as a compatible source (the Manifest contract allows exactly that).
    const declared = definition("0.3.0", [], undefined, { compatible_from_versions: ["0.3.0"] }, { build: "B" });
    assert.doesNotThrow(() => runtime.install({ definition: declared, deployment: "local", bundled: true }));
  } finally {
    db.close();
  }
});

test("a same-version declaration lets the changed build run without touching the record, but only while the grants stay the same", async () => {
  const db = new Database(":memory:");
  try {
    const started: string[] = [];
    const permission = { permission: "artifact:read", required: true, reason: "读取绑定的文本快照" } as const;
    const buildA = definition("0.3.0", started, undefined, undefined, { build: "A", permissions: [permission] });
    const firstRuntime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
    const first = new PluginSupervisor(firstRuntime, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db) });
    await first.start([{ definition: buildA, bundled: true, releaseArtifact: { capture: () => "native-A", restore: () => buildA } }]);
    const installId = first.state(PLUGIN_ID)?.install_id;
    assert.ok(installId);
    await firstRuntime.stop(installId);

    const startWith = async (candidate: PluginDefinition, tag: string) => {
      const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), new NativePluginExecutor());
      const supervisor = new PluginSupervisor(runtime, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db) });
      const report = await supervisor.start([{ definition: candidate, bundled: true,
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

function restartedRepositoryCount(repository: SqlitePluginRuntimeReleaseArtifactRepository): number {
  return repository.list(PLUGIN_ID, SIGNATURE).length;
}

// `variant` makes a second build of the same version: another name (so another Manifest digest), the build tag the start
// records, and optionally another permission list.
function definition(
  version: string,
  started: string[],
  validateUpgrade?: PluginDefinition["validateUpgrade"],
  upgradeCompatibility?: PluginManifest["upgrade_compatibility"],
  variant?: { build?: string; permissions?: PluginManifest["permissions"] },
): PluginDefinition {
  const manifest: PluginManifest = {
    schema_version: 2,
    host_api_version: 2,
    plugin_id: PLUGIN_ID,
    version,
    name: variant?.build ? `Release fixture ${variant.build}` : "Release fixture",
    kind: "app",
    publisher: { publisher_id: "fixture", signature: SIGNATURE },
    entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: variant?.permissions ?? [],
    capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] },
    ui: { contributions: [] },
    ...(upgradeCompatibility ? { upgrade_compatibility: upgradeCompatibility } : {}),
  };
  return {
    manifest,
    ...(validateUpgrade ? { validateUpgrade } : {}),
    async start() {
      started.push(variant?.build ? `${version} ${variant.build}` : version);
      return { kind: "app", views: [] };
    },
  };
}

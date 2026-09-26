import { pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { IntegrationProviderPort, PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  MemoryPluginRuntimeRepository,
  PluginRuntime,
  PluginSupervisor,
  SqlitePluginRuntimeRepository,
} from "@molis-ai/molis-work-plugin-runtime";
import { createGithubIntegrationPlugin } from "@molis-ai/molis-work-integration-github";
import { CODING_PLUGIN_ID, createCodingPlugin } from "@molis-ai/molis-work-plugin-coding";
import { DEMO_BOARD_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { handleCodingPluginHttp, releaseCodingSurface } from "../apps/local-host/src/coding-surface.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const provider: IntegrationProviderPort = {
  type: "upgrade-fixture",
  async health() { return { ok: true, status: "connected", message: "ready" }; },
  async sync() { return { ok: true, mode: "fixture", items: [], cursor: null }; },
};

test("compatible code can restore an older install without changing its version until manual upgrade", async () => {
  const original = createGithubIntegrationPlugin({ provider });
  const repository = new MemoryPluginRuntimeRepository();
  let v1Starts = 0, v2Starts = 0;
  const old: PluginDefinition = {
    ...original,
    manifest: { ...original.manifest, version: "1.0.0" },
    async start(context) { v1Starts += 1; return original.start(context); },
  };
  const next: PluginDefinition = {
    ...original,
    manifest: { ...original.manifest, version: "2.0.0", upgrade_compatibility: { compatible_from_versions: ["1.0.0"] } },
    async start(context) { v2Starts += 1; return original.start(context); },
  };

  const firstRuntime = new PluginRuntime(repository);
  const firstSupervisor = new PluginSupervisor(firstRuntime);
  const first = await firstSupervisor.start([{ definition: old }]);
  assert.deepEqual(first.running, [old.manifest.plugin_id]);
  const installId = firstRuntime.list()[0]!.install_id;
  assert.equal(v1Starts, 1);

  const reopenedRuntime = new PluginRuntime(repository);
  const reopenedSupervisor = new PluginSupervisor(reopenedRuntime);
  const reopened = await reopenedSupervisor.start([{ definition: next }]);
  assert.deepEqual(reopened.running, [next.manifest.plugin_id]);
  assert.equal(v2Starts, 1, "the declared compatible implementation can serve the existing installation");
  assert.equal(reopenedRuntime.get(installId).version, "1.0.0", "opening a project does not replace its install record");
  assert.deepEqual(reopenedRuntime.get(installId).grants, firstRuntime.get(installId).grants);
  assert.deepEqual(reopenedSupervisor.upgradeCandidates(), [{
    plugin_id: next.manifest.plugin_id,
    install_id: installId,
    installed_version: "1.0.0",
    target_version: "2.0.0",
    mode: "compatible",
    can_upgrade: true,
  }]);

  const upgraded = await reopenedSupervisor.upgrade(next.manifest.plugin_id);
  assert.equal(upgraded.status, "running");
  assert.equal(reopenedRuntime.get(installId).version, "2.0.0");
  assert.deepEqual(reopenedSupervisor.upgradeCandidates(), []);
  await reopenedRuntime.stop(installId);
});

test("an undeclared newer Manifest cannot start or alter the older installation", async () => {
  const original = createGithubIntegrationPlugin({ provider });
  const repository = new MemoryPluginRuntimeRepository();
  const old: PluginDefinition = { ...original, manifest: { ...original.manifest, version: "1.0.0" } };
  const next: PluginDefinition = { ...original, manifest: { ...original.manifest, version: "2.0.0" } };
  const first = new PluginRuntime(repository);
  const installed = first.install({ definition: old, deployment: "local", grants: ["network:github.com", "secret:github"] });
  await first.start(installed.install.install_id);

  const reopened = new PluginRuntime(repository);
  const supervisor = new PluginSupervisor(reopened);
  const report = await supervisor.start([{ definition: next }]);
  assert.deepEqual(report.running, []);
  assert.equal(report.failed[0]?.code, "plugin_upgrade_required");
  assert.equal(reopened.get(installed.install.install_id).version, "1.0.0");
  assert.equal(reopened.get(installed.install.install_id).state, "running");
  assert.equal(supervisor.upgradeCandidates()[0]?.mode, "unsupported");
  assert.equal(supervisor.upgradeCandidates()[0]?.can_upgrade, false);
});

test("a same-version Manifest change is usable only with an exact compatibility declaration and never becomes an upgrade candidate", async () => {
  const original = createGithubIntegrationPlugin({ provider });
  const repository = new MemoryPluginRuntimeRepository();
  const old: PluginDefinition = { ...original, manifest: { ...original.manifest, version: "1.0.0" } };
  const initialRuntime = new PluginRuntime(repository);
  const installed = initialRuntime.install({ definition: old, deployment: "local", grants: ["network:github.com", "secret:github"] });
  await initialRuntime.start(installed.install.install_id);

  const changed: PluginDefinition = {
    ...original,
    manifest: {
      ...original.manifest,
      version: "1.0.0",
      name: "Updated same-release instructions",
      upgrade_compatibility: { compatible_from_versions: ["1.0.0"] },
    },
  };
  const runtime = new PluginRuntime(repository);
  const supervisor = new PluginSupervisor(runtime);
  const report = await supervisor.start([{ definition: changed }]);
  assert.deepEqual(report.running, [changed.manifest.plugin_id]);
  assert.equal(runtime.get(installed.install.install_id).version, "1.0.0");
  assert.equal(runtime.get(installed.install.install_id).manifest_digest, installed.install.manifest_digest);
  assert.deepEqual(supervisor.upgradeCandidates(), []);

  const deniedRuntime = new PluginRuntime(repository);
  const denied = new PluginSupervisor(deniedRuntime);
  const undeclared = { ...changed, manifest: { ...changed.manifest, upgrade_compatibility: undefined } };
  const rejected = await denied.start([{ definition: undeclared }]);
  assert.equal(rejected.failed[0]?.code, "plugin_definition_conflict");
  assert.equal(deniedRuntime.get(installed.install.install_id).manifest_digest, installed.install.manifest_digest);
});

test("project market update API reports the installed and target versions without changing the install", async () => {
  const directory = mkdtempSync(join(tmpdir(), "plugin-market-upgrade-"));
  const databasePath = join(directory, "project.db");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  try {
    const currentDefinition = createCodingPlugin();
    const olderDefinition: PluginDefinition = {
      ...currentDefinition,
      manifest: { ...currentDefinition.manifest, version: "0.9.0", upgrade_compatibility: undefined },
    };
    const oldRuntime = new PluginRuntime(new SqlitePluginRuntimeRepository(store.db));
    const oldInstall = oldRuntime.install({
      definition: olderDefinition,
      deployment: "local",
      grants: currentDefinition.manifest.permissions.filter(item => item.required).map(item => item.permission),
    });
    const ports = {
      store,
      boardId: DEMO_BOARD_ID, actions: pluginActions(store, DEMO_BOARD_ID),
      actorId: "market-test",
      goalTitle: () => undefined,
      escapeHtml: String,
      translate: String,
      workspaces: [],
    };
    const request = { method: "GET" } as IncomingMessage;
    const response = {
      statusCode: 0,
      body: "",
      writeHead(status: number) { this.statusCode = status; return this; },
      end(body: string) { this.body = body; },
    } as unknown as ServerResponse & { statusCode: number; body: string };
    const handled = await handleCodingPluginHttp(request, response, new URL("http://localhost/api/plugins/runtime/updates"), ports);
    assert.equal(handled, true);
    assert.equal(response.statusCode, 200);
    const updates = JSON.parse(response.body).updates as Array<{ plugin_id: string; installed_version: string; target_version: string; mode: string; can_upgrade: boolean; project_plugin_id: string }>;
    const candidate = updates.find(item => item.plugin_id === CODING_PLUGIN_ID);
    assert.deepEqual(candidate, {
      plugin_id: CODING_PLUGIN_ID,
      install_id: oldInstall.install.install_id,
      installed_version: "0.9.0",
      target_version: currentDefinition.manifest.version,
      mode: "unsupported",
      can_upgrade: false,
      project_plugin_id: "coding",
    });
    assert.equal(new PluginRuntime(new SqlitePluginRuntimeRepository(store.db)).get(oldInstall.install.install_id).version, "0.9.0");
  } finally {
    await releaseCodingSurface(store, DEMO_BOARD_ID);
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

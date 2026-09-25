import { pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { PluginHostExecutor } from "@molis-ai/molis-work-app-local-host";
import { PluginRuntime, PluginRuntimeError, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost, PluginUiAccessError } from "@molis-ai/molis-work-ui-host";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import { createGithubIntegrationPlugin } from "@molis-ai/molis-work-integration-github";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { seedDemoBoard, DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { LocalHost } from "../apps/local-host/src/local-host.js";

test("an unknown Runtime plugin cannot turn a Host-only adapter into user authority through consumes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-host-only-plugin-"));
  const file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const protectedEntry = { capability_id: "unfamiliar.user-approval", version: 1, operation: "command" as const, host_only: true };
  let calls = 0;
  host.register(protectedEntry, () => ++calls);
  const port = host.client({ project_id: "plugin-test", board_id: DEMO_BOARD_ID, storage_key: file });
  const runtime = new PluginRuntime(undefined, new PluginHostExecutor({ actions: pluginActions(store, DEMO_BOARD_ID),
    board_id: DEMO_BOARD_ID, actor_id: "user", capabilities: port,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event) }), ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
  }));
  const base = createGithubIntegrationPlugin({ provider: {
    type: "fixture", async health() { return { ok: true, status: "connected", message: "ready" }; },
    async sync() { return { ok: true, mode: "fixture", items: [], cursor: null }; },
  } });
  const definition: PluginDefinition = { ...base,
    manifest: { ...base.manifest, plugin_id: "io.molis.work.example.protected-adapter",
      capabilities: { ...base.manifest.capabilities, consumes: [protectedEntry.capability_id] } },
    async start(context) {
      const sdk = context.services!.capabilities!;
      const availability = sdk.availability(protectedEntry);
      assert.equal(availability.available, false); assert.equal(!availability.available && availability.code, "actions.host_only");
      await assert.rejects(sdk.invoke({ ...protectedEntry, host_only: false }, { authority: { actor_kind: "user" } }, { consumer: undefined }), { code: "actions.host_only" });
      return base.start(context);
    },
  };
  let installId: string | undefined;
  try {
    installId = runtime.install({ definition, deployment: "local", grants: definition.manifest.permissions.map(p => p.permission) }).install.install_id;
    await runtime.start(installId);
    assert.equal(calls, 0);
    assert.equal(await port.invoke(protectedEntry, {}), 1);
  } finally {
    if (installId) await runtime.stop(installId);
    await host.close(); store.close(); rmSync(directory, { recursive: true, force: true });
  }
});

test("Host gives a real Plugin private storage, Artifact exchange and revocable UI across restart and failed stop", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-host-"));
  const file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const privateDb = new Database(join(directory, "plugin-private.db"));
  const privateOwner = new SqlitePluginPrivateStorage(privateDb);
  const artifacts = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event) });
  const ui = new UiHost();
  const runtime = new PluginRuntime(undefined, new PluginHostExecutor({ actions: pluginActions(store, DEMO_BOARD_ID), board_id: DEMO_BOARD_ID, actor_id: "author",
    artifacts, ui, privateStorageFor: (context, manifest) => privateOwner.forPlugin(context, manifest) }));
  let failStart = false;
  let failStop = false;
  const contexts: PluginStartContext[] = [];
  const base = createGithubIntegrationPlugin({ provider: {
    type: "fixture", async health() { return { ok: true, status: "connected", message: "ready" }; },
    async sync() { return { ok: true, mode: "fixture", items: [], cursor: null }; },
  } });
  const id = "io.molis.work.example.hosted";
  const definition: PluginDefinition = { manifest: { ...base.manifest, plugin_id: id,
    permissions: [...base.manifest.permissions, ...["storage:private", "artifact:write", "artifact:read", "ui:register"]
      .map(permission => ({ permission, required: true, reason: "Hosted sample" }))],
    artifacts: { produces: [{ artifact_type_id: "example.note", schema_version: 1 }],
      consumes: [{ artifact_type_id: "example.note", schema_version: 1 }] }, ui: { contributions: ["example.notes"] } },
    async start(context) {
      contexts.push(context);
      const services = context.services!;
      const count = Number(services.storage!.get("visits") ?? "0") + 1;
      const descriptor = { contribution_id: "example.notes", plugin_id: id, kind: "primary-page" as const,
        label: "Notes", slots: [], surfaces: [{ surface_id: "main", target_slot_id: "main", format: "html" }] };
      services.ui.register({ descriptor, render: () => `<p>Visit ${count}</p>` });
      descriptor.plugin_id = "changed-after-registration";
      if (failStart) throw new Error("start failed after UI registration");
      services.storage!.set("visits", String(count));
      services.artifacts.publish({ artifact_id: "hosted-note", version: count, artifact_type_id: "example.note",
        schema_version: 1, content: { kind: "inline", payload: { visits: count } } });
      return base.start(context);
    }, async stop(context) { assert.ok(context.services); if (failStop) throw new Error("stop failed"); } };
  try {
    const installation = runtime.install({ definition, deployment: "local",
      grants: definition.manifest.permissions.map(permission => permission.permission) });
    const installId = installation.install.install_id;
    await runtime.start(installId);
    const old = contexts[0]!.services!;
    assert.equal(ui.list()[0]!.plugin_id, id);
    assert.equal(ui.mount({ slot: { slot_id: "main", version: 1, accepts: ["html"] },
      contribution: { contribution_id: "example.notes", surface: "main", model: null } }).html, "<p>Visit 1</p>");
    assert.deepEqual(old.artifacts.read({ artifact_id: "hosted-note", version: 1 })!.payload, { visits: 1 });
    assert.throws(() => old.ui.unregister("another-plugin"), PluginUiAccessError);
    assert.throws(() => old.ui.register({ descriptor: { contribution_id: "undeclared", plugin_id: id,
      kind: "primary-page", label: "No", slots: [] }, render: () => "bad" }), PluginUiAccessError);
    assert.equal(ui.list().length, 1);
    await runtime.reportCrash(installId);
    assert.deepEqual(ui.list(), []);
    assert.deepEqual(pluginActions(store, DEMO_BOARD_ID).registry.registry.descriptors(), [], "crash must release SDK actions");
    assert.throws(() => old.storage!.get("visits"), PluginRuntimeError);
    await runtime.recover(installId);
    assert.equal(contexts[1]!.services!.storage!.get("visits"), "2");
    assert.deepEqual(contexts[1]!.services!.artifacts.read({ artifact_id: "hosted-note", version: 1 })!.payload, { visits: 1 });
    assert.throws(() => old.artifacts.read({ artifact_id: "hosted-note", version: 1 }), PluginRuntimeError);

    failStop = true;
    await assert.rejects(runtime.uninstall(installId), PluginRuntimeError);
    assert.equal(runtime.get(installId).state, "crashed");
    assert.equal(runtime.contribution(installId), null);
    assert.deepEqual(ui.list(), []);
    assert.deepEqual(pluginActions(store, DEMO_BOARD_ID).registry.registry.descriptors(), [], "failed stop must release SDK actions");
    assert.throws(() => contexts[1]!.services!.storage!.set("visits", "bad"), PluginRuntimeError);
    await runtime.uninstall(installId);
    assert.equal(runtime.get(installId).state, "uninstalled");
    assert.equal(artifacts.query.listArtifactVersions(DEMO_BOARD_ID, "hosted-note").length, 2);

    failStart = true;
    failStop = false;
    runtime.install({ definition, deployment: "local", grants: definition.manifest.permissions.map(permission => permission.permission) });
    await assert.rejects(runtime.start(installId), PluginRuntimeError);
    assert.deepEqual(ui.list(), []);
    assert.deepEqual(pluginActions(store, DEMO_BOARD_ID).registry.registry.descriptors(), [], "failed startup must release SDK actions");
    assert.equal(runtime.get(installId).state, "crashed");
    assert.equal(artifacts.query.listArtifactVersions(DEMO_BOARD_ID, "hosted-note").length, 2);
  } finally { store.close(); privateDb.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("compatible Host execution and crash recovery use the implementation version without upgrading the installation", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-compatible-host-"));
  const file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const privateOwner = new SqlitePluginPrivateStorage(store.db);
  const artifacts = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event) });
  const ui = new UiHost();
  const { MemoryPluginRuntimeRepository } = await import("@molis-ai/molis-work-plugin-runtime");
  const repository = new MemoryPluginRuntimeRepository();
  const executor = () => new PluginHostExecutor({ actions: pluginActions(store, DEMO_BOARD_ID), board_id: DEMO_BOARD_ID, actor_id: "author",
    artifacts, ui, privateStorageFor: (context, manifest) => privateOwner.forPlugin(context, manifest) });
  const contexts: PluginStartContext[] = [];
  let failStart = false;
  const base = createGithubIntegrationPlugin({ provider: { type: "fixture", async health() { return { ok: true, status: "connected", message: "ready" }; }, async sync() { return { ok: true, mode: "fixture", items: [], cursor: null }; } } });
  const make = (version: string): PluginDefinition => ({
    ...base,
    manifest: { ...base.manifest, version,
      ...(version === "2.0.0" ? { upgrade_compatibility: { compatible_from_versions: ["1.0.0"] } } : {}),
      permissions: [...base.manifest.permissions, ...["storage:private", "artifact:write", "artifact:read", "ui:register"]
        .map(permission => ({ permission, required: true, reason: "Compatible Host fixture" }))],
      artifacts: { produces: [{ artifact_type_id: "example.note", schema_version: 1 }],
        consumes: [{ artifact_type_id: "example.note", schema_version: 1 }] },
      ui: { contributions: ["example.compatible"] } },
    async start(context) {
      contexts.push(context);
      assert.equal(context.version, version);
      if (failStart) throw new Error("fixture still broken");
      const count = Number(context.services!.storage!.get("visits") ?? "0") + 1;
      context.services!.storage!.set("visits", String(count));
      context.services!.ui.register({ descriptor: { contribution_id: "example.compatible", plugin_id: base.manifest.plugin_id,
        kind: "primary-page", label: "Compatible", slots: [], surfaces: [{ surface_id: "main", target_slot_id: "main", format: "html" }] },
        render: () => `<p>${version}</p>` });
      context.services!.artifacts.publish({ artifact_id: "compatible-note", version: count,
        artifact_type_id: "example.note", schema_version: 1, content: { kind: "inline", payload: { count } } });
      return base.start(context);
    },
  });
  try {
    const first = new PluginRuntime(repository, executor());
    const old = make("1.0.0");
    const installed = first.install({ definition: old, deployment: "local", grants: old.manifest.permissions.map(p => p.permission) }).install;
    await first.start(installed.install_id);
    await first.stop(installed.install_id);
    const runtime = new PluginRuntime(repository, executor());
    const next = make("2.0.0");
    runtime.install({ definition: next, deployment: "local", grants: installed.grants });
    await runtime.start(installed.install_id);
    assert.equal(contexts.at(-1)!.services!.storage!.get("visits"), "2");
    assert.deepEqual(contexts.at(-1)!.services!.artifacts.read({ artifact_id: "compatible-note", version: 1 })!.payload, { count: 1 });
    assert.equal(ui.mount({ slot: { slot_id: "main", version: 1, accepts: ["html"] },
      contribution: { contribution_id: "example.compatible", surface: "main", model: null } }).html, "<p>2.0.0</p>");
    const previous = contexts.at(-1)!;
    await runtime.reportCrash(installed.install_id);
    assert.throws(() => previous.services!.storage!.get("visits"), PluginRuntimeError);
    await runtime.recover(installed.install_id);
    assert.equal(contexts.at(-1)!.version, "2.0.0");
    assert.equal(contexts.at(-1)!.services!.storage!.get("visits"), "3");
    assert.equal(runtime.get(installed.install_id).version, "1.0.0");
    assert.equal(runtime.get(installed.install_id).manifest_digest, installed.manifest_digest);
    assert.deepEqual(runtime.get(installed.install_id).grants, installed.grants);
    failStart = true;
    await runtime.reportCrash(installed.install_id);
    await assert.rejects(runtime.recover(installed.install_id));
    await assert.rejects(runtime.recover(installed.install_id));
    assert.equal(runtime.get(installed.install_id).state, "quarantined");
    await assert.rejects(runtime.recover(installed.install_id), /只有 crashed/);
    await assert.rejects(runtime.recover(installed.install_id, { release_quarantine: true }), /已隔离/);
    assert.equal(runtime.get(installed.install_id).state, "quarantined");
    assert.throws(() => contexts.at(-1)!.requireGrant("storage:private"), PluginRuntimeError);
    failStart = false;
    await runtime.recover(installed.install_id, { release_quarantine: true });
    assert.equal(runtime.get(installed.install_id).state, "running");
    assert.equal(runtime.get(installed.install_id).version, "1.0.0");
    assert.equal(runtime.get(installed.install_id).recovery_count, 0);
    assert.deepEqual(runtime.get(installed.install_id).grants, installed.grants);
    assert.equal(contexts.at(-1)!.services!.storage!.get("visits"), "4");
    await runtime.reportCrash(installed.install_id);
    await runtime.recover(installed.install_id);
    assert.equal(runtime.get(installed.install_id).recovery_count, 1);
    await runtime.stop(installed.install_id);
    assert.deepEqual(ui.list(), []);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

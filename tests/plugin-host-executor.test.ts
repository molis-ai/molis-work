import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { captureHostLog, PluginHostExecutor, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";
import { PluginRuntime, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { createGithubIntegrationPlugin } from "@molis-ai/molis-work-integration-github";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { seedDemoBoard, DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import { artifactPreview } from "./fixtures/artifact-preview.js";

test("W3-07-6-02: an unknown Runtime plugin cannot revive the removed developer protocol through consumes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-host-only-plugin-"));
  const file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const host = new MolisWorkLocalHost();
  const protectedEntry = { capability_id: "io.molis.work.local-host.plugin.development", version: 1, operation: "command" as const,
    action: { title: "Development", description: "Removed", kind: "operation" as const, scope: "project" as const, audiences: ["plugin" as const], permissions: [], subject_kinds: [], input_schema: { type: "object" } } };
  const port = host.client({ project_id: DEMO_PROJECT_ID, storage_key: file });
  const runtime = new PluginRuntime(undefined, new PluginHostExecutor({ actions: pluginActions(store, port.project.project_id),
    project_id: DEMO_PROJECT_ID, actor_id: "user", dependencyCheck: reference => port.availability(reference, { consumer: "plugin" }),
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }), processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }), ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
  }), { hostIds: ISOLATED_HOST_IDS });
  const base = createGithubIntegrationPlugin({ provider: {
    type: "fixture", async health() { return { ok: true, status: "connected", message: "ready" }; },
    async sync() { return { ok: true, mode: "fixture", items: [], cursor: null }; },
  } });
  const definition: PluginDefinition = { ...base,
    manifest: { ...base.manifest, plugin_id: "io.molis.work.example.protected-adapter",
      capabilities: { ...base.manifest.capabilities, consumes: [protectedEntry.capability_id] } },
    async start(context) {
      const sdk = context.services!.actions!;
      const availability = sdk.availability(protectedEntry);
      assert.equal(availability.available, false); assert.equal(!availability.available && availability.code, "actions.dependency_missing");
      const forged = { ...protectedEntry, host_only: false };
      await assert.rejects(sdk.invoke(forged, { authority: { actor_kind: "user" } }), { code: "actions.dependency_missing" });
      return base.start(context);
    },
  };
  let installId: string | undefined;
  try {
    installId = runtime.install({ trust: { level: "unsigned" }, definition, deployment: "local", grants: definition.manifest.permissions.map(p => p.permission) }).install.install_id;
    await runtime.start(installId);
    await assert.rejects(port.invoke(protectedEntry, {}), { code: "actions.missing" }, "the normal Host client cannot restore the removed protocol");
  } finally {
    if (installId && runtime.get(installId).state === "running") await runtime.stop(installId);
    await host.close(); store.close(); rmSync(directory, { recursive: true, force: true });
  }
});

test("Host gives a real Plugin private storage, Artifact exchange and revocable UI across restart and failed stop", async t => {
  const entries: HostLogEntry[] = [];
  t.after(captureHostLog(entries));
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-host-"));
  const file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const privateDb = new Database(join(directory, "plugin-private.db"));
  const privateOwner = new SqlitePluginPrivateStorage(privateDb);
  const artifacts = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }), processItems = new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) });
  const ui = new UiHost();
  const runtime = new PluginRuntime(undefined, new PluginHostExecutor({ actions: pluginActions(store, DEMO_PROJECT_ID), project_id: DEMO_PROJECT_ID, actor_id: "author",
    artifacts, processItems, ui, privateStorageFor: (context, manifest) => privateOwner.forPlugin(context, manifest) }), { hostIds: ISOLATED_HOST_IDS, actions: pluginActions(store, DEMO_PROJECT_ID) });
  let failStart = false;
  let failStop = false;
  const contexts: PluginStartContext[] = [];
  const base = createGithubIntegrationPlugin({ provider: {
    type: "fixture", async health() { return { ok: true, status: "connected", message: "ready" }; },
    async sync() { return { ok: true, mode: "fixture", items: [], cursor: null }; },
  } });
  const id = "io.molis.work.example.hosted";
  // The 成果 type the plugin pins is named and has a preview of its own (specs/artifact-positioning A1/A7).
  const preview = artifactPreview(id);
  const definition: PluginDefinition = { manifest: { ...base.manifest, plugin_id: id,
    permissions: [...base.manifest.permissions, ...["storage:private", "artifact:write", "artifact:read", "ui:register"]
      .map(permission => ({ permission, required: true, reason: "Hosted sample" }))],
    actions: [...(base.manifest.actions ?? []), preview.definition],
    artifacts: { produces: [preview.type],
      consumes: [{ artifact_type_id: "example.note", schema_version: 1 }] }, ui: { contributions: ["example.notes"] } },
    async start(context) {
      contexts.push(context);
      const services = context.services!;
      const count = Number(services.storage!.get("visits") ?? "0") + 1;
      const descriptor = { contribution_id: "example.notes", kind: "primary-page" as const,
        label: "Notes", slots: [], surfaces: [{ surface_id: "main", target_slot_id: "main", format: "html" }] };
      services.ui.register({ descriptor, render: () => `<p>Visit ${count}</p>` });
      (descriptor as { label: string }).label = "changed-after-registration";
      if (failStart) throw new Error("start failed after UI registration");
      services.storage!.set("visits", String(count));
      services.artifacts.publish({ artifact_id: "hosted-note", version: count, artifact_type_id: "example.note",
        schema_version: 1, content: { kind: "inline", payload: { visits: count } }, ...pinnedArtifact("Visits", { kind: "counter", id: "visits" }, String(count)) });
      const contribution = await base.start(context);
      return { ...contribution, actions: [...(contribution.actions ?? []), preview.handler] };
    }, async stop(context) { assert.ok(context.services); if (failStop) throw new Error("stop failed"); } };
  try {
    const installation = runtime.install({ trust: { level: "unsigned" }, definition, deployment: "local",
      grants: definition.manifest.permissions.map(permission => permission.permission) });
    const installId = installation.install.install_id;
    await runtime.start(installId);
    const old = contexts[0]!.services!;
    assert.equal(ui.list()[0]!.plugin_id, id, "RAC-635 the owner is the one the installation's Manifest names");
    assert.equal(ui.list()[0]!.label, "Notes", "what the plugin changes after registering is not what the registry holds");
    assert.equal(ui.mount({ slot: { slot_id: "main", version: 1, accepts: ["html"] },
      contribution: { contribution_id: "example.notes", surface: "main", model: null } }).html, "<p>Visit 1</p>");
    assert.deepEqual(old.artifacts.read({ artifact_id: "hosted-note", version: 1 })!.payload, { visits: 1 });
    // UIERR-01: an actual Plugin client cannot remove another owner or register undeclared content.
    assert.throws(() => old.ui.unregister("another-plugin"), (error: unknown) => error instanceof ActionError && error.code === "ui_host.plugin_denied" && error.kind === "forbidden");
    assert.throws(() => old.ui.register({ descriptor: { contribution_id: "undeclared",
      kind: "primary-page", label: "No", slots: [] }, render: () => "bad" }), (error: unknown) => error instanceof ActionError && error.code === "ui_host.plugin_denied" && error.kind === "forbidden");
    // RAC-636: a declaration that names an owner is refused, another plugin's and its own alike; the Host fills it, so there is nothing to compare.
    for (const claimed of ["another-plugin", id]) {
      assert.throws(() => old.ui.register({ descriptor: { contribution_id: "example.notes", plugin_id: claimed, kind: "primary-page", label: "Claimed", slots: [] }, render: () => "bad" } as never),
        (error: unknown) => error instanceof ActionError && error.code === "ui_host.plugin_denied" && error.kind === "forbidden", claimed);
    }
    assert.equal(ui.list().length, 1);
    await runtime.reportCrash(installId);
    assert.deepEqual(ui.list(), []);
    assert.deepEqual(pluginActions(store, DEMO_PROJECT_ID).registry.registry.descriptors(), [], "crash must release SDK actions");
    assert.equal(old.storage!.get("visits"), undefined, "BL-411: outside every call a crashed activation's handle is refused and answers nothing");
    await runtime.recover(installId);
    assert.equal(contexts[1]!.services!.storage!.get("visits"), "2");
    assert.deepEqual(contexts[1]!.services!.artifacts.read({ artifact_id: "hosted-note", version: 1 })!.payload, { visits: 1 });
    assert.equal(old.artifacts.read({ artifact_id: "hosted-note", version: 1 }), undefined, "nor after the recovery started another activation");

    failStop = true;
    await assert.rejects(runtime.uninstall(installId), (error: unknown) => (error instanceof ActionError && ["plugin.manifest_invalid","plugin.definition_missing","plugin.definition_conflict","plugin.entrypoint_missing","plugin.grant_denied","plugin.state_invalid","plugin.install_replaced","plugin.executor_failed","plugin.contribution_kind_invalid","plugin.contribution_unredeemed","plugin.quarantined","plugin.upgrade_required","plugin.kept_data_incompatible","plugin.upgrade_validation_missing","plugin.upgrade_validation_failed","plugin.upgrade_rollback_failed"].includes(error.code) && error.kind === "invalid"));
    assert.equal(runtime.get(installId).state, "crashed");
    assert.equal(runtime.contribution(installId), null);
    assert.deepEqual(ui.list(), []);
    assert.deepEqual(pluginActions(store, DEMO_PROJECT_ID).registry.registry.descriptors(), [], "failed stop must release SDK actions");
    // BL-411: the activation whose stop failed is over too: outside every call its write is refused and throws nothing.
    assert.equal(contexts[1]!.services!.storage!.set("visits", "bad"), undefined);
    assert.deepEqual(entries.filter(entry => entry.event === "stopped_service_call" && entry.fields?.method === "set").map(entry => entry.fields?.service), ["storage"],
      "the Host noted the refused write");
    await runtime.uninstall(installId);
    assert.equal(runtime.get(installId).state, "uninstalled");
    assert.equal(artifacts.query.listArtifactVersions(DEMO_PROJECT_ID, "hosted-note").length, 2);

    failStart = true;
    failStop = false;
    runtime.install({ trust: { level: "unsigned" }, definition, deployment: "local", grants: definition.manifest.permissions.map(permission => permission.permission) });
    await assert.rejects(runtime.start(installId), (error: unknown) => (error instanceof ActionError && ["plugin.manifest_invalid","plugin.definition_missing","plugin.definition_conflict","plugin.entrypoint_missing","plugin.grant_denied","plugin.state_invalid","plugin.install_replaced","plugin.executor_failed","plugin.contribution_kind_invalid","plugin.contribution_unredeemed","plugin.quarantined","plugin.upgrade_required","plugin.kept_data_incompatible","plugin.upgrade_validation_missing","plugin.upgrade_validation_failed","plugin.upgrade_rollback_failed"].includes(error.code) && error.kind === "invalid"));
    assert.deepEqual(ui.list(), []);
    assert.deepEqual(pluginActions(store, DEMO_PROJECT_ID).registry.registry.descriptors(), [], "failed startup must release SDK actions");
    assert.equal(runtime.get(installId).state, "crashed");
    assert.equal(artifacts.query.listArtifactVersions(DEMO_PROJECT_ID, "hosted-note").length, 2);
  } finally { store.close(); privateDb.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("compatible Host execution and crash recovery use the implementation version without upgrading the installation", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-compatible-host-"));
  const file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const privateOwner = new SqlitePluginPrivateStorage(store.db);
  const artifacts = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }), processItems = new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) });
  const ui = new UiHost();
  const { MemoryPluginRuntimeRepository } = await import("@molis-ai/molis-work-plugin-runtime");
  const repository = new MemoryPluginRuntimeRepository();
  const executor = () => new PluginHostExecutor({ actions: pluginActions(store, DEMO_PROJECT_ID), project_id: DEMO_PROJECT_ID, actor_id: "author",
    artifacts, processItems, ui, privateStorageFor: (context, manifest) => privateOwner.forPlugin(context, manifest) });
  const contexts: PluginStartContext[] = [];
  let failStart = false;
  const base = createGithubIntegrationPlugin({ provider: { type: "fixture", async health() { return { ok: true, status: "connected", message: "ready" }; }, async sync() { return { ok: true, mode: "fixture", items: [], cursor: null }; } } });
  const preview = artifactPreview(base.manifest.plugin_id);
  const make = (version: string): PluginDefinition => ({
    ...base,
    manifest: { ...base.manifest, version,
      ...(version === "2.0.0" ? { upgrade_compatibility: { compatible_from_versions: ["1.0.0"] } } : {}),
      permissions: [...base.manifest.permissions, ...["storage:private", "artifact:write", "artifact:read", "ui:register"]
        .map(permission => ({ permission, required: true, reason: "Compatible Host fixture" }))],
      actions: [...(base.manifest.actions ?? []), preview.definition],
      artifacts: { produces: [preview.type],
        consumes: [{ artifact_type_id: "example.note", schema_version: 1 }] },
      ui: { contributions: ["example.compatible"] } },
    async start(context) {
      contexts.push(context);
      assert.equal(context.version, version);
      if (failStart) throw new Error("fixture still broken");
      const count = Number(context.services!.storage!.get("visits") ?? "0") + 1;
      context.services!.storage!.set("visits", String(count));
      context.services!.ui.register({ descriptor: { contribution_id: "example.compatible",
        kind: "primary-page", label: "Compatible", slots: [], surfaces: [{ surface_id: "main", target_slot_id: "main", format: "html" }] },
        render: () => `<p>${version}</p>` });
      context.services!.artifacts.publish({ artifact_id: "compatible-note", version: count,
        artifact_type_id: "example.note", schema_version: 1, content: { kind: "inline", payload: { count } }, ...pinnedArtifact("Count", { kind: "counter", id: "count" }, String(count)) });
      const contribution = await base.start(context);
      return { ...contribution, actions: [...(contribution.actions ?? []), preview.handler] };
    },
  });
  try {
    const first = new PluginRuntime(repository, executor(), { hostIds: ISOLATED_HOST_IDS, actions: pluginActions(store, DEMO_PROJECT_ID) });
    const old = make("1.0.0");
    const installed = first.install({ trust: { level: "unsigned" }, definition: old, deployment: "local", grants: old.manifest.permissions.map(p => p.permission) }).install;
    await first.start(installed.install_id);
    await first.stop(installed.install_id);
    const runtime = new PluginRuntime(repository, executor(), { hostIds: ISOLATED_HOST_IDS, actions: pluginActions(store, DEMO_PROJECT_ID) });
    const next = make("2.0.0");
    runtime.install({ trust: { level: "unsigned" }, definition: next, deployment: "local", grants: installed.grants });
    await runtime.start(installed.install_id);
    assert.equal(contexts.at(-1)!.services!.storage!.get("visits"), "2");
    assert.deepEqual(contexts.at(-1)!.services!.artifacts.read({ artifact_id: "compatible-note", version: 1 })!.payload, { count: 1 });
    assert.equal(ui.mount({ slot: { slot_id: "main", version: 1, accepts: ["html"] },
      contribution: { contribution_id: "example.compatible", surface: "main", model: null } }).html, "<p>2.0.0</p>");
    const previous = contexts.at(-1)!;
    await runtime.reportCrash(installed.install_id);
    assert.equal(previous.services!.storage!.get("visits"), undefined, "BL-411: outside every call a crashed activation's handle is refused and answers nothing");
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
    assert.throws(() => contexts.at(-1)!.requireGrant("storage:private"), (error: unknown) => (error instanceof ActionError && ["plugin.manifest_invalid","plugin.definition_missing","plugin.definition_conflict","plugin.entrypoint_missing","plugin.grant_denied","plugin.state_invalid","plugin.install_replaced","plugin.executor_failed","plugin.contribution_kind_invalid","plugin.contribution_unredeemed","plugin.quarantined","plugin.upgrade_required","plugin.kept_data_incompatible","plugin.upgrade_validation_missing","plugin.upgrade_validation_failed","plugin.upgrade_rollback_failed"].includes(error.code) && error.kind === "invalid"));
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

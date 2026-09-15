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

test("Host gives a real Plugin private storage, Artifact exchange and revocable UI across restart and failed stop", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-host-"));
  const file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const privateDb = new Database(join(directory, "plugin-private.db"));
  const privateOwner = new SqlitePluginPrivateStorage(privateDb);
  const artifacts = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event) });
  const ui = new UiHost();
  const runtime = new PluginRuntime(undefined, new PluginHostExecutor({ board_id: DEMO_BOARD_ID, actor_id: "author",
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
    assert.throws(() => contexts[1]!.services!.storage!.set("visits", "bad"), PluginRuntimeError);
    await runtime.uninstall(installId);
    assert.equal(runtime.get(installId).state, "uninstalled");
    assert.equal(artifacts.query.listArtifactVersions(DEMO_BOARD_ID, "hosted-note").length, 2);

    failStart = true;
    failStop = false;
    runtime.install({ definition, deployment: "local", grants: definition.manifest.permissions.map(permission => permission.permission) });
    await assert.rejects(runtime.start(installId), PluginRuntimeError);
    assert.deepEqual(ui.list(), []);
    assert.equal(runtime.get(installId).state, "crashed");
    assert.equal(artifacts.query.listArtifactVersions(DEMO_BOARD_ID, "hosted-note").length, 2);
  } finally { store.close(); privateDb.close(); rmSync(directory, { recursive: true, force: true }); }
});

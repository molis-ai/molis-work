import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import { createPluginArtifactClient, PluginArtifactAccessError } from "@molis-ai/molis-work-plugin-artifacts";
import { PluginRuntime, PluginRuntimeError } from "@molis-ai/molis-work-plugin-runtime";
import { createGithubIntegrationPlugin } from "@molis-ai/molis-work-integration-github";
import type { PluginArtifactClient, PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { seedDemoBoard, DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";

test("installed Plugins exchange exact Artifact versions by type, with bound authority and real denied side effects", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-artifacts-"));
  const databasePath = join(directory, "board.db");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  const api = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event) });
  const runtime = new PluginRuntime();
  try {
    const base = createGithubIntegrationPlugin({ provider: {
      type: "fixture", async health() { return { ok: true, status: "connected", message: "ready" }; },
      async sync() { return { ok: true, mode: "fixture", items: [], cursor: null }; },
    } });
    async function author(name: string, options: { read?: boolean; schema?: number; actor?: string } = {}) {
      let client!: PluginArtifactClient;
      const manifest: PluginManifest = { ...base.manifest, plugin_id: `io.molis.work.example.${name}`,
        permissions: [...base.manifest.permissions,
          { permission: "artifact:write", required: false, reason: "Publish notes" },
          { permission: "artifact:read", required: false, reason: "Read notes" }],
        artifacts: { produces: [{ artifact_type_id: "example.note", schema_version: 1 }],
          consumes: [{ artifact_type_id: "example.note", schema_version: options.schema ?? 1 }] } };
      const definition: PluginDefinition = { manifest, async start(context) {
        client = createPluginArtifactClient({ api, context, manifest, board_id: DEMO_BOARD_ID,
          actor_id: options.actor ?? "author" });
        return base.start(context);
      } };
      const installed = runtime.install({ definition, deployment: "local", grants: [
        "network:github.com", "secret:github", "artifact:write", ...(options.read === false ? [] : ["artifact:read"]),
      ] });
      await runtime.start(installed.install.install_id);
      return { get client() { return client; }, installId: installed.install.install_id };
    }
    const producer = await author("producer");
    const consumer = await author("consumer");
    const value = { artifact_id: "plugin-note", version: 1, artifact_type_id: "example.note", schema_version: 1,
      content: { kind: "inline" as const, payload: { title: "First", custom: [1, "opaque", null] } },
      board_id: "forged-board", actor_id: "forged-user", scope: "team_project", team_share_authorized: true,
      producer: { plugin_id: "forged", plugin_version: "9.0.0", binding_signature: "forged" } };
    const first = producer.client.publish(value);
    assert.equal(first.artifact.board_id, DEMO_BOARD_ID);
    assert.equal(first.artifact.owner_actor_id, "author");
    assert.equal(first.artifact.producer_plugin_id, "io.molis.work.example.producer");
    assert.equal(first.artifact.scope, "personal");
    assert.deepEqual(consumer.client.read({ artifact_id: value.artifact_id, version: 1 }), first.artifact);
    assert.equal(producer.client.publish(value).replayed, true);
    producer.client.publish({ ...value, version: 2, content: { kind: "inline", payload: { title: "Second" } } });
    assert.deepEqual(consumer.client.read({ artifact_id: value.artifact_id, version: 1 })!.payload, value.content.payload);
    assert.deepEqual(consumer.client.read({ artifact_id: value.artifact_id, version: 2 })!.payload, { title: "Second" });

    const oldConsumerClient = consumer.client;
    await runtime.reportCrash(consumer.installId);
    assert.throws(() => oldConsumerClient.read(value), (error: unknown) => error instanceof PluginRuntimeError
      && error.code === "plugin_grant_denied");
    await runtime.recover(consumer.installId);
    assert.deepEqual(consumer.client.read(value), first.artifact);
    assert.throws(() => oldConsumerClient.read(value), PluginRuntimeError,
      "recovery must not restore authority to stale pre-crash clients");

    const noRead = await author("denied", { read: false });
    const wrongSchema = await author("wrong-schema", { schema: 2 });
    const otherUser = await author("other-user", { actor: "other" });
    const before = store.snapshot(DEMO_BOARD_ID);
    const versions = api.query.listArtifactVersions(DEMO_BOARD_ID, value.artifact_id);
    assert.throws(() => noRead.client.read(value), (error: unknown) => error instanceof PluginRuntimeError
      && error.code === "plugin_grant_denied");
    assert.throws(() => wrongSchema.client.read(value), (error: unknown) => error instanceof PluginArtifactAccessError
      && error.code === "plugin_artifact_incompatible");
    assert.throws(() => otherUser.client.read(value), (error: unknown) => error instanceof PluginArtifactAccessError
      && error.code === "plugin_artifact_denied");
    assert.throws(() => producer.client.publish({ ...value, artifact_id: "not-created", schema_version: 2 }),
      PluginArtifactAccessError);
    assert.deepEqual(store.snapshot(DEMO_BOARD_ID), before);
    assert.deepEqual(api.query.listArtifactVersions(DEMO_BOARD_ID, value.artifact_id), versions);
    assert.equal(api.query.getArtifactVersion(DEMO_BOARD_ID, { artifact_id: "not-created", version: 1 }), null);
    await runtime.uninstall(producer.installId);
    assert.deepEqual(consumer.client.read(value), first.artifact, "uninstall preserves exchanged content");
    assert.throws(() => producer.client.publish({ ...value, version: 3 }),
      (error: unknown) => error instanceof PluginRuntimeError && error.code === "plugin_grant_denied");
    assert.deepEqual(api.query.listArtifactVersions(DEMO_BOARD_ID, value.artifact_id), versions,
      "a retained client cannot keep writing after uninstall");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

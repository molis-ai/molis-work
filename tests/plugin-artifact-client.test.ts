import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ArtifactsModule, ProcessItemsModule, createPluginArtifactClient } from "@molis-ai/molis-work-module-artifacts";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { assertPluginActionCurrent, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { createGithubIntegrationPlugin } from "@molis-ai/molis-work-integration-github";
import type { PluginArtifactClient, PluginDefinition, PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import { seedDemoBoard, DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import { artifactPreview } from "./fixtures/artifact-preview.js";

/** A bare kernel has no action gateway; the client still runs under the caller its Host would issue the session. */
const sessionCaller = (manifest: PluginManifest, context: PluginStartContext, actor: string): HostPluginCaller =>
  ({ plugin_id: manifest.plugin_id, install_id: context.install_id, actor_id: actor, project_id: DEMO_PROJECT_ID, declaration: { manifest }, assertActive: () => {} });

test("W5-01-D1-01: installed Plugins exchange exact Artifact versions by type, with bound authority and real denied side effects", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-artifacts-"));
  const databasePath = join(directory, "board.db");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  const api = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) });
  const processItems = new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) });
  // A plugin that declares actions (the preview of its 成果 type) is installed against the Kernel that holds them.
  const runtime = new PluginRuntime(undefined, undefined, { actions: pluginActions(store, DEMO_PROJECT_ID) });
  try {
    // W5-08-MOD-03/04: process-item publication stays behind the same business services.
    for (const entry of [processItems, processItems.service, processItems.query, processItems.commands]) {
      assert.equal("repository" in entry, false);
    }
    const base = createGithubIntegrationPlugin({ provider: {
      type: "fixture", async health() { return { ok: true, status: "connected", message: "ready" }; },
      async sync() { return { ok: true, mode: "fixture", items: [], cursor: null }; },
    } });
    async function author(name: string, options: { read?: boolean; schema?: number; actor?: string } = {}) {
      let client!: PluginArtifactClient;
      let dispose = () => {};
      // A produced 成果 type is named and has a preview of its own (specs/artifact-positioning A1/A7).
      const preview = artifactPreview(`io.molis.work.example.${name}`);
      const manifest: PluginManifest = { ...base.manifest, plugin_id: `io.molis.work.example.${name}`,
        permissions: [...base.manifest.permissions,
          { permission: "artifact:write", required: false, reason: "Publish notes" },
          { permission: "artifact:read", required: false, reason: "Read notes" }],
        actions: [...(base.manifest.actions ?? []), preview.definition],
        artifacts: { produces: [preview.type],
          consumes: [{ artifact_type_id: "example.note", schema_version: options.schema ?? 1 }] } };
      const definition: PluginDefinition = { manifest, async start(context) {
        const hosted = createPluginArtifactClient({ assertInput: assertActionInput, api, process: processItems, context, manifest, actions: pluginActions(store, DEMO_PROJECT_ID), project_id: DEMO_PROJECT_ID,
          actor_id: options.actor ?? "author", plugin_caller: sessionCaller(manifest, context, options.actor ?? "author"), assertCallerCurrent: () => assertPluginActionCurrent(context) });
        client = hosted.client; dispose = hosted.dispose;
        const contribution = await base.start(context);
        return { ...contribution, actions: [...(contribution.actions ?? []), preview.handler] };
      }, stop() { dispose(); } };
      const installed = runtime.install({ definition, deployment: "local", grants: [
        "network:github.com", "secret:github", "artifact:write", ...(options.read === false ? [] : ["artifact:read"]),
      ] });
      await runtime.start(installed.install.install_id);
      return { get client() { return client; }, installId: installed.install.install_id };
    }
    const producer = await author("producer");
    const consumer = await author("consumer");
    const value = { ...pinnedArtifact("First", { kind: "note", id: "plugin-note" }), artifact_id: "plugin-note", version: 1, artifact_type_id: "example.note", schema_version: 1,
      content: { kind: "inline" as const, payload: { title: "First", custom: [1, "opaque", null] } },
      project_id: "forged-board", actor_id: "forged-user", scope: "team_project", team_share_authorized: true,
      producer: { plugin_id: "forged", plugin_version: "9.0.0", binding_signature: "forged" } };
    const first = producer.client.publish(value);
    assert.equal(first.artifact.project_id, DEMO_PROJECT_ID);
    assert.equal(first.artifact.owner_actor_id, "author");
    assert.equal(first.artifact.producer_plugin_id, "io.molis.work.example.producer");
    assert.equal(first.artifact.scope, "personal");
    assert.deepEqual(consumer.client.read({ artifact_id: value.artifact_id, version: 1 }), first.artifact);
    const actions = pluginActions(store, DEMO_PROJECT_ID);
    const caller = { actor_id: "author", project_id: DEMO_PROJECT_ID, audience: "plugin" as const,
      plugin_install_id: consumer.installId, permissions: ["artifact:read", "artifact:write"] };
    const read = actions.registry.discover(caller).find(action => action.capability_id === `sdk.artifacts.${consumer.installId}.read`)!;
    assert.ok(read, "the SDK operation must exist in the same Kernel directory");
    assert.deepEqual(await actions.client.invoke(caller, { ...read, provider_id: read.provider.provider_id }, { artifact_id: value.artifact_id, version: 1 }), first.artifact);
    assert.deepEqual(actions.registry.discover({ ...caller, audience: "mcp" }), [], "producer-bound SDK calls are not public MCP tools");
    // ARTACC-01/ARTACC-02: the real Kernel carries the declared forbidden kind through provider availability.
    const wrongInstall = actions.registry.discover({ ...caller, plugin_install_id: producer.installId }).find(action => action.capability_id === read.capability_id)?.availability;
    assert.ok(wrongInstall && !wrongInstall.available);
    assert.equal(wrongInstall.code, "artifacts.plugin_denied");
    assert.equal(wrongInstall.kind, "forbidden");
    await assert.rejects(actions.client.invoke({ ...caller, plugin_install_id: producer.installId }, read, { artifact_id: value.artifact_id, version: 1 }),
      (error: unknown) => error instanceof ActionError && error.code === "artifacts.plugin_denied" && error.kind === "forbidden" && actionHttpStatus(error) === 403);
    await assert.rejects(actions.client.invoke(caller, read, { artifact_id: value.artifact_id, version: 1, actor_id: "forged" }));
    assert.equal(producer.client.publish(value).replayed, true);
    producer.client.publish({ ...value, version: 2, content: { kind: "inline", payload: { title: "Second" } } });
    assert.deepEqual(consumer.client.read({ artifact_id: value.artifact_id, version: 1 })!.payload, value.content.payload);
    assert.deepEqual(consumer.client.read({ artifact_id: value.artifact_id, version: 2 })!.payload, { title: "Second" });

    const oldConsumerClient = consumer.client;
    await runtime.reportCrash(consumer.installId);
    assert.throws(() => oldConsumerClient.read(value), (error: unknown) => (error instanceof ActionError && error.kind === "invalid")
      && error.code === "plugin.grant_denied");
    await runtime.recover(consumer.installId);
    assert.deepEqual(consumer.client.read(value), first.artifact);
    assert.throws(() => oldConsumerClient.read(value), (error: unknown) => (error instanceof ActionError && ["plugin.manifest_invalid","plugin.definition_missing","plugin.definition_conflict","plugin.entrypoint_missing","plugin.grant_denied","plugin.state_invalid","plugin.install_replaced","plugin.executor_failed","plugin.contribution_kind_invalid","plugin.contribution_unredeemed","plugin.quarantined","plugin.upgrade_required","plugin.kept_data_incompatible","plugin.upgrade_validation_missing","plugin.upgrade_validation_failed","plugin.upgrade_rollback_failed"].includes(error.code) && error.kind === "invalid"),
      "recovery must not restore authority to stale pre-crash clients");

    const noRead = await author("denied", { read: false });
    const denied = actions.registry.discover({ ...caller, plugin_install_id: noRead.installId })
      .find(action => action.capability_id === `sdk.artifacts.${noRead.installId}.read`);
    assert.equal(denied?.availability.available, false, "directory reflects the actual Runtime grant");
    assert.ok(denied && !denied.availability.available);
    assert.equal(denied.availability.code, "artifacts.plugin_denied");
    assert.equal(denied.availability.kind, "forbidden");
    const wrongSchema = await author("wrong-schema", { schema: 2 });
    const otherUser = await author("other-user", { actor: "other" });
    const before = store.snapshot(DEMO_PROJECT_ID);
    const versions = api.query.listArtifactVersions(DEMO_PROJECT_ID, value.artifact_id);
    assert.throws(() => noRead.client.read(value), (error: unknown) => (error instanceof ActionError && error.kind === "invalid")
      && error.code === "plugin.grant_denied");
    assert.throws(() => wrongSchema.client.read(value), (error: unknown) => error instanceof ActionError
      && error.code === "artifacts.plugin_incompatible" && error.kind === "invalid");
    // ARTACC-01/ARTACC-03: A personal 成果 belongs to the Home's person whoever produced it: another actor's installation reads it by type, not by being its producer.
    assert.deepEqual(otherUser.client.read(value), first.artifact);
    assert.throws(() => producer.client.publish({ ...value, artifact_id: "not-created", schema_version: 2 }),
      { code: "artifacts.plugin_incompatible", kind: "invalid", message: "Manifest 未声明生产此成果 type/schema" });
    assert.deepEqual(store.snapshot(DEMO_PROJECT_ID), before);
    assert.deepEqual(api.query.listArtifactVersions(DEMO_PROJECT_ID, value.artifact_id), versions);
    assert.equal(api.query.getArtifactVersion(DEMO_PROJECT_ID, { artifact_id: "not-created", version: 1 }), null);
    await runtime.uninstall(producer.installId);
    assert.deepEqual(consumer.client.read(value), first.artifact, "uninstall preserves exchanged content");
    assert.throws(() => producer.client.publish({ ...value, version: 3 }),
      (error: unknown) => (error instanceof ActionError && error.kind === "invalid") && error.code === "plugin.grant_denied");
    assert.deepEqual(api.query.listArtifactVersions(DEMO_PROJECT_ID, value.artifact_id), versions,
      "a retained client cannot keep writing after uninstall");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("W5-01-D1-01 W5-01-D1-04 W5-01-D1-05: SDK queries expose fixed contracts and preserve real installation authority", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-process-read-"));
  const databasePath = join(directory, "board.db");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  const api = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) });
  const processItems = new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) });
  // A plugin that declares actions (the preview of its 成果 type) is installed against the Kernel that holds them.
  const runtime = new PluginRuntime(undefined, undefined, { actions: pluginActions(store, DEMO_PROJECT_ID) });
  try {
    const base = createGithubIntegrationPlugin({ provider: {
      type: "fixture", async health() { return { ok: true, status: "connected", message: "ready" }; },
      async sync() { return { ok: true, mode: "fixture", items: [], cursor: null }; },
    } });
    async function install(name: string, actor: string, read = true) {
      let hosted!: ReturnType<typeof createPluginArtifactClient>;
      const preview = artifactPreview(`io.molis.work.example.${name}`);
      const manifest: PluginManifest = { ...base.manifest, plugin_id: `io.molis.work.example.${name}`,
        permissions: [...base.manifest.permissions,
          { permission: "artifact:write", required: false, reason: "Publish notes" },
          { permission: "artifact:read", required: false, reason: "Read notes" }],
        actions: [...(base.manifest.actions ?? []), preview.definition],
        artifacts: { produces: [preview.type], consumes: [{ artifact_type_id: "example.note", schema_version: 1 }] },
        process_items: { produces: [{ artifact_type_id: "example.item", schema_version: 1 }], consumes: [{ artifact_type_id: "example.item", schema_version: 1 }] } };
      const definition: PluginDefinition = { manifest, async start(context) {
        hosted = createPluginArtifactClient({ assertInput: assertActionInput, api, process: processItems, context, manifest, actions: pluginActions(store, DEMO_PROJECT_ID), project_id: DEMO_PROJECT_ID, actor_id: actor,
          plugin_caller: sessionCaller(manifest, context, actor), assertCallerCurrent: () => assertPluginActionCurrent(context) });
        const contribution = await base.start(context);
        return { ...contribution, actions: [...(contribution.actions ?? []), preview.handler] };
      }, stop() { hosted.dispose(); } };
      const installed = runtime.install({ definition, deployment: "local", grants: ["network:github.com", "secret:github", "artifact:write", ...(read ? ["artifact:read"] : [])] });
      await runtime.start(installed.install.install_id);
      return { ...hosted, installId: installed.install.install_id };
    }
    const producer = await install("producer", "author"), sameActor = await install("same-actor", "author"), otherActor = await install("other-actor", "other");

    // ARTACC-01/ARTACC-02: A process item belongs to the actor whose installation recorded it: the ownership decision (2026-10-07) is about personal 成果 only.
    const item = { artifact_id: "item-1", version: 1, artifact_type_id: "example.item", schema_version: 1,
      content: { kind: "inline" as const, payload: { step: "draft" } } };
    const recorded = producer.process.record({ ...item, project_id: "forged-project", actor_id: "forged-actor", owner_actor_id: "forged-owner",
      producer: { plugin_id: "forged", plugin_version: "999", binding_signature: "forged" }, scope: "team_project" });
    assert.equal(recorded.artifact.owner_actor_id, "author");
    assert.deepEqual(sameActor.client.read(item), recorded.artifact);
    assert.throws(() => otherActor.client.read(item), (error: unknown) => error instanceof ActionError && error.code === "artifacts.plugin_denied" && error.kind === "forbidden");

    // A personal 成果 is the person's whoever produced it, so any installation of the Home reads it by type.
    const note = { ...pinnedArtifact("Note", { kind: "note", id: "n-1" }), artifact_id: "note-1", version: 1, artifact_type_id: "example.note", schema_version: 1,
      content: { kind: "inline" as const, payload: { title: "Note" } } };
    const published = producer.client.publish(note);
    assert.deepEqual(otherActor.client.read(note), published.artifact);
    assert.deepEqual(producer.process.head(item.artifact_id), { version: 1 });
    assert.deepEqual(producer.process.readOwn(item), recorded.artifact);
    assert.deepEqual(producer.client.head(note.artifact_id), { version: 1, source_revision: 1 });
    assert.deepEqual(producer.client.readOwn(note), published.artifact);
    assert.deepEqual(producer.client.listConsumable().map(row => row.kind), ["artifact", "process_item"]);
    assert.deepEqual(otherActor.client.listConsumable().map(row => row.kind), ["artifact"]);

    const actions = pluginActions(store, DEMO_PROJECT_ID);
    const caller = { actor_id: "author", project_id: DEMO_PROJECT_ID, audience: "plugin" as const,
      plugin_install_id: producer.installId, permissions: ["artifact:read", "artifact:write"] };
    const prefix = `sdk.artifacts.${producer.installId}`;
    const sdk = actions.registry.discover(caller).filter(row => row.provider.provider_id === prefix);
    assert.equal(sdk.length, 8, "all operations live in the existing single installation provider");
    const expected = sdkContracts();
    for (const operation of Object.keys(expected) as (keyof typeof expected)[]) {
      const row = sdk.find(value => value.capability_id === `${prefix}.${operation}`);
      assert.ok(row);
      assert.equal(row.version, 1);
      assert.equal(row.operation, operation === "publish" || operation === "record" ? "command" : "query");
      assert.equal(row.action.scope, "project");
      assert.deepEqual(row.action.audiences, ["plugin"]);
      assert.deepEqual(row.action.subject_kinds, ["artifact"]);
      assert.deepEqual(row.action.permissions, [operation === "publish" || operation === "record" ? "artifact:write" : "artifact:read"]);
      assert.deepEqual(row.action.input_schema, expected[operation].input);
      assert.deepEqual(row.action.output_schema, expected[operation].output);
    }
    const noGrant = await install("no-grant", "author", false);
    for (const operation of ["process-head", "process-own", "list"]) {
      const row = sdk.find(value => value.capability_id === `${prefix}.${operation}`)!;
      const input = operation === "list" ? {} : operation === "process-head" ? { artifact_id: item.artifact_id } : { artifact_id: item.artifact_id, version: 1 };
      assert.doesNotThrow(() => actions.client.invokeSync(caller, row, input), "new queries really execute synchronously");
      assert.equal(row.action.kind, "query");
      assert.throws(() => actions.client.invokeSync({ ...caller, plugin_install_id: sameActor.installId }, row, input), { code: "artifacts.plugin_denied" });
      assert.throws(() => actions.client.invokeSync({ ...caller, actor_id: "other" }, row, input), { code: "artifacts.plugin_denied" });
      for (const audience of ["user", "mcp"] as const) {
        assert.equal(actions.registry.discover({ ...caller, audience }).some(value => value.capability_id === row.capability_id), false);
        assert.throws(() => actions.client.invokeSync({ ...caller, audience }, row, input), { code: "actions.forbidden" });
      }
      const noRead = { ...caller, plugin_install_id: noGrant.installId };
      const unavailable = actions.registry.discover(noRead).find(value => value.capability_id === `sdk.artifacts.${noGrant.installId}.${operation}`)!;
      assert.deepEqual(unavailable.availability.available, false);
      assert.throws(() => actions.client.invokeSync(noRead, unavailable, input), { code: "artifacts.plugin_denied" });
    }
    const before = { artifacts: api.query.listArtifacts(DEMO_PROJECT_ID), process: processItems.query.listArtifacts(DEMO_PROJECT_ID), cursor: store.eventCursor(DEMO_PROJECT_ID) };
    for (const invalid of [
      () => producer.client.publish({ ...note, version: 0 }),
      () => producer.process.record({ ...item, version: 0 }),
      () => Reflect.apply(producer.process.record, null, [{ ...item, content: { kind: "inline" } }]),
      () => producer.process.head(" "),
      () => producer.process.readOwn({ artifact_id: item.artifact_id, version: 0 }),
    ]) assert.throws(invalid, { code: "actions.input_invalid" });
    assert.deepEqual({ artifacts: api.query.listArtifacts(DEMO_PROJECT_ID), process: processItems.query.listArtifacts(DEMO_PROJECT_ID), cursor: store.eventCursor(DEMO_PROJECT_ID) }, before);
    await runtime.stop(producer.installId);
    assert.deepEqual(sameActor.client.read(item), recorded.artifact, "producer stop keeps fixed process versions consumable");
    assert.deepEqual(sameActor.client.read(note), published.artifact);
    assert.deepEqual(sameActor.client.listConsumable().map(row => row.kind), ["artifact", "process_item"]);
    for (const retained of [() => producer.process.head(item.artifact_id), () => producer.process.readOwn(item), () => producer.client.listConsumable()]) {
      assert.throws(retained, { code: "plugin.grant_denied" });
    }
    assert.equal(actions.registry.discover(caller).some(row => row.provider.provider_id === prefix), false, "stop disposes the SDK provider");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

/** W5-01-D1-05: independent expected contracts keep the old five @1 shapes intact and fix the new queries' full schemas. */
function sdkContracts() {
  const id = { type: "string", minLength: 1, pattern: "\\S" }, version = { type: "integer", minimum: 1 }, text = { type: "string" };
  const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
  const nullable = (schema: unknown) => ({ anyOf: [schema, { type: "null" }] });
  const array = (items: unknown) => ({ type: "array", items });
  const reference = object({ artifact_id: id, version });
  const fields = { artifact_id: id, version, project_id: id, artifact_type_id: id, schema_version: version,
    producer_plugin_id: id, producer_plugin_version: id, producer_binding_signature: id, owner_actor_id: id,
    content_kind: { enum: ["inline", "reference"] }, payload: {}, content_ref: nullable(text), content_digest: text,
    size_bytes: { type: "integer", minimum: 0 }, metadata: { type: "object" }, scope: { enum: ["personal", "team_project"] },
    availability: { enum: ["available", "unavailable"] }, unavailable_reason: nullable(text), lifecycle_state: { enum: ["active", "archived"] },
    supersedes_version: nullable(version), created_by: id, created_at: text, archived_at: nullable(text), archived_by: nullable(text) };
  const origin = { oneOf: [object({ kind: { const: "pinned" }, subject: object({ kind: id, id }), revision: id }), object({ kind: { const: "imported" }, file_name: id })] };
  const processRecord = object(fields), record = object({ ...fields, origin, title: id, media_type: id, trace: array(reference) });
  const versionProperties = { artifact_id: id, version, artifact_type_id: id, schema_version: version,
    content: { oneOf: [object({ kind: { const: "inline" }, payload: {} }), object({ kind: { const: "reference" }, content_ref: id,
      digest: id, size_bytes: { type: "integer", minimum: 0 }, observed_digest: nullable(text), available: { type: "boolean" } }, ["kind", "content_ref", "digest", "size_bytes"])] },
    metadata: { type: "object" }, supersedes_version: nullable(version) };
  const required = ["artifact_id", "version", "artifact_type_id", "schema_version", "content"];
  const result = (artifact: unknown) => object({ artifact, observed_event_cursor: { type: "integer", minimum: 0 }, replayed: { type: "boolean" } });
  return {
    read: { input: reference, output: nullable({ anyOf: [record, processRecord] }) },
    head: { input: object({ artifact_id: id }), output: nullable(object({ version, source_revision: nullable({ type: "integer", minimum: 0 }) })) },
    own: { input: reference, output: nullable(record) },
    publish: { input: object({ ...versionProperties, origin, title: id, media_type: id, trace: array(reference) }, [...required, "origin", "title", "media_type"]), output: result(record) },
    record: { input: object(versionProperties, required), output: result(processRecord) },
    "process-head": { input: object({ artifact_id: id }), output: nullable(object({ version })) },
    "process-own": { input: reference, output: nullable(processRecord) },
    list: { input: object({}), output: array(object({ artifact_id: id, version, kind: { enum: ["artifact", "process_item"] }, artifact_type_id: id, schema_version: version, title: nullable(text) })) },
  };
}

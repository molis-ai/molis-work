import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionService } from "@molis-ai/molis-work-kernel";
import type { ActionDefinition, ActionProviderRegistration, ActionRegistryPort } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindOwnerPluginAction } from "@molis-ai/molis-work-plugin-sdk";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { PluginRuntime, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { PluginHostExecutor, LocalProjectDatabase, seedDemoBoard, DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";

test("W3-09-AUTH-03 the SDK owner binder retains the real old invocation instead of adopting a replacement directory entry", { timeout: 15_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "sdk-owner-effect-")), file = join(home, "project.sqlite");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), service = new ActionService();
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const contexts: PluginStartContext[] = [];
  let registration: ActionProviderRegistration | undefined, withdraw: (() => void) | undefined, replacement: (() => void) | undefined, held = true;
  let stop: (() => Promise<unknown>) | undefined;
  t.signal.addEventListener("abort", () => release.resolve(), { once: true });
  t.after(async () => {
    release.resolve(); replacement?.();
    try { await stop?.(); }
    finally { try { store.close(); } finally { await rm(home, { recursive: true, force: true }); } }
  });
  // Capture only this fixture's real Runtime registration/disposer, delegating all registration and execution to the Kernel.
  const registry: ActionRegistryPort = { registerProvider(value) { registration = value; withdraw = service.registerProvider(value); return withdraw; } };
  const actions = { registry, client: service, project_id: DEMO_PROJECT_ID };
  const artifacts = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: id => store.eventCursor(id) });
  const processItems = new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: id => store.eventCursor(id) });
  const storage = new SqlitePluginPrivateStorage(store.db);
  const action: ActionDefinition<Record<string, never>, boolean> = { capability_id: "fixture.owner.save", version: 1, operation: "command", action: {
    title: "Save own fact", description: "One installation's real SQLite fact", kind: "operation", scope: "project", scheduling: "concurrent",
    audiences: ["user"], permissions: ["storage:private"], subject_kinds: [],
    input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "boolean" },
  } };
  const definition: PluginDefinition = { manifest: {
    schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.owner-fence", version: "1.0.0", name: "Owner fence", kind: "app",
    publisher: { publisher_id: "example", signature: "example-owner-fence" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "storage:private", required: true, reason: "Keep this installation's own fact" }], capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [action],
  }, async start(context) {
    contexts.push(context);
    return { kind: "app", actions: [bindOwnerPluginAction(context, action, async (_input, beforeWrite) => {
      if (held) { entered.resolve(); await release.promise; }
      await beforeWrite();
      assert.ok(context.services?.storage);
      context.services.storage.set("saved", "one committed fact");
      return true;
    })] };
  } };
  const runtime = new PluginRuntime(undefined, new PluginHostExecutor({ actions, project_id: DEMO_PROJECT_ID, actor_id: "owner", artifacts, processItems,
    ui: new UiHost(), privateStorageFor: (context, manifest) => storage.forPlugin(context, manifest) }), { actions });
  const installed = runtime.install({ trust: { level: "unsigned" }, definition, deployment: "local", grants: ["storage:private"] }).install;
  stop = () => runtime.stop(installed.install_id);
  await runtime.start(installed.install_id);
  const context = contexts[0];
  assert.ok(context?.services?.actions); assert.ok(context.services.storage);
  const pending = context.services.actions.invoke(action, {});
  const rejected = assert.rejects(pending, { code: "actions.provider_changed" });
  await Promise.race([entered.promise, pending.then(() => { throw new Error("Owner write settled before its wait"); })]);
  assert.ok(registration); assert.ok(withdraw);
  withdraw(); replacement = service.registerProvider(registration);
  held = false; release.resolve(); await rejected;
  assert.equal(context.services.storage.get("saved"), null, "the active installation cannot write through an expired registration");
  assert.equal(await context.services.actions.invoke(action, {}), true);
  assert.equal(context.services.storage.get("saved"), "one committed fact");
});

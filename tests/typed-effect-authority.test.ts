import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginCapabilityClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { LocalHost, LocalProjectDatabase, PluginHostExecutor, readMcpToolPreference } from "@molis-ai/molis-work-app-local-host";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import type { HostCapabilityDefinition, HostCapabilityInvocation } from "@molis-ai/molis-work-contracts/platform/app-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { recordedCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { openTestHome } from "./fixtures/test-home.js";
import { managementGoals } from "./goal-management-caller.js";

const origin: ActionDefinition = { capability_id: "fixture.typed.progress", version: 1, operation: "command", action: {
  title: "Record through the declared Host capability", description: "A real installed consumer of the existing Goal note action",
  kind: "operation", scope: "project", scheduling: "concurrent", audiences: ["mcp"], permissions: ["goals:write"], subject_kinds: [],
  input_schema: { type: "object", additionalProperties: false }, output_schema: goalsActions.note.action.output_schema,
} };
const peer: ActionDefinition = { ...origin, capability_id: "fixture.typed.peer", operation: "query", action: {
  ...origin.action, title: "Independently granted peer", kind: "query", output_schema: { type: "boolean" },
} };

test("W2-18-CODING-EFFECT-01 / W3-09-AUTH-03: a real MCP origin cannot borrow its peer's grant across the bound SDK action client to a formal Goal note action", { timeout: 30_000 }, async t => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let originChecked = false, held = true;
  const home = await openTestHome(t, { catalogPolicy: false, host: { actionAvailability: async (caller, view) => {
    // Hold the downstream Goals policy only after the actual originating execution's async check completed.
    // SDK discovery pins the consumed action too, but only the actual invoke has a dispatcher-issued call_id.
    if (held && originChecked && caller.call_id && view.capability_id === "goals.note"
      && caller.audience === "plugin" && caller.host_plugin?.plugin_id === "io.molis.work.example.typed-authority") {
      entered.resolve(); await release.promise;
    }
    return { available: true };
  } } });
  t.signal.addEventListener("abort", () => release.resolve(), { once: true });
  const project = await home.createProject("Typed origin authority");
  const goals = managementGoals(home.host.actionClient(project.reference), project.project_id);
  const goal_id = "TYPED-EFFECT";
  await goals.invoke(goalsActions.create, { goal_id, title: "Only currently authorized progress", idempotency_key: "create" });
  const beforeState = await goals.invoke(goalsActions.state, { goal_id });
  const progress = { goal_id, body: "One genuinely authorized note", idempotency_key: "typed-note" };
  const definition: PluginDefinition = { manifest: {
    schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.typed-authority", version: "1.0.0", name: "Typed consumer", kind: "app",
    publisher: { publisher_id: "example", signature: "typed-authority-fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "goals:write", required: true, reason: "Record authorized progress" }],
    capabilities: { provides: [], consumes: [goalsActions.note.capability_id] },
    artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [origin, peer],
  }, async start(context) {
    assert.ok(context.services?.actions);
    const actions = context.services.actions;
    return { kind: "app", actions: [{ ...origin, handle: async caller => {
      await caller.beforeEffect(); originChecked = true;
      return actions.invoke(goalsActions.note, progress, { signal: caller.signal, beforeEffect: caller.beforeEffect,
        assert_authority_current: () => { caller.assert_authority_current(); } });
    } }, { ...peer, handle: () => true }] };
  } };
  const actions = { registry: home.host.actionRegistry(project.reference), client: home.host.actionClient(project.reference, false), project_id: project.project_id };
  const runtime = await home.host.withProject(project.reference, owner => new PluginRuntime(undefined, new PluginHostExecutor({
    actions, project_id: project.project_id, actor_id: "typed-owner", artifacts: owner.artifacts, processItems: owner.processItems,
    ui: new UiHost(), capabilities: home.host.client(project.reference),
    privateStorageFor: () => { throw new Error("This consumer declares no private storage"); },
  }), { actions }));
  const installed = runtime.install({ definition, deployment: "local", grants: ["goals:write"] }).install;
  t.after(async () => { held = false; release.resolve(); await runtime.stop(installed.install_id); });
  await runtime.start(installed.install_id);
  const clientId = "runtime:typed-authority";
  await home.grant(clientId, project.project_id, [origin, peer]);
  const grants = (await readMcpToolPreference(home.home)).action_grants.filter(row => row.client_id === clientId && row.project_id === project.project_id);
  const originalGrant = grants.find(row => row.capability_id === origin.capability_id), peerGrant = grants.find(row => row.capability_id === peer.capability_id);
  assert.ok(originalGrant?.enabled); assert.ok(peerGrant?.enabled);
  assert.deepEqual(originalGrant.permissions, ["goals:write"]); assert.deepEqual(peerGrant.permissions, originalGrant.permissions);
  const mcp = await home.mcp(clientId, project.project_id), callId = randomUUID();
  const before = await goals.invoke(goalsActions.snapshot, {});
  const pending = withCallId(callId, async () => {
    try { return { result: await mcp.client.invoke(mcp.caller, origin, {}), error: undefined, recorded: recordedCallId() }; }
    catch (error) { return { result: undefined, error, recorded: recordedCallId() }; }
  });
  await Promise.race([entered.promise, pending.then(outcome => { throw new Error("SDK progress settled before the downstream policy barrier", { cause: outcome.error ?? outcome.result }); })]);
  await home.revoke(clientId, project.project_id, [origin]);
  const current = (await readMcpToolPreference(home.home)).action_grants.filter(row => row.client_id === clientId && row.project_id === project.project_id);
  assert.equal(current.find(row => row.capability_id === origin.capability_id)?.enabled, false);
  assert.equal(current.find(row => row.capability_id === peer.capability_id)?.enabled, true);
  assert.equal(await mcp.client.invoke(mcp.caller, peer, {}), true, "the equally permissioned peer remains genuinely usable");
  held = false; release.resolve(); const outcome = await pending;
  assert.ok(outcome.error instanceof ActionError); assert.equal(outcome.error.code, "mcp.action_revoked");
  assert.deepEqual(await goals.invoke(goalsActions.snapshot, {}), before, "no progress, receipt, audit or failure business record was written");
  assert.equal(outcome.recorded, callId);
  const rows = home.host.callLog!.find(callId);
  assert.deepEqual(rows.map(row => [row.capability_id, row.code, row.ok]).sort(([a], [b]) => String(a).localeCompare(String(b))),
    [[origin.capability_id, "mcp.action_revoked", false], [goalsActions.note.capability_id, "mcp.action_revoked", false]]
      .sort(([a], [b]) => String(a).localeCompare(String(b))), "each real nested call is settled once under the original operation number");
  await home.grant(clientId, project.project_id, [origin]);
  const recovered = await mcp.client.invoke(mcp.caller, origin, {});
  assert.ok(recovered && typeof recovered === "object" && "event_id" in recovered);
  const after = await goals.invoke(goalsActions.state, { goal_id });
  assert.equal(after.goal_event_cursor, beforeState.goal_event_cursor + 1);
  assert.equal((await goals.invoke(goalsActions.event, { goal_id, event_id: String(recovered.event_id) })).payload.body, progress.body);
  const replayed = await mcp.client.invoke(mcp.caller, origin, {});
  assert.ok(replayed && typeof replayed === "object" && "event_id" in replayed);
  assert.equal(replayed.event_id, recovered.event_id);
  assert.deepEqual(await goals.invoke(goalsActions.state, { goal_id }), after, "retry leaves the one original note fact");
});

for (const publishedAction of [false, true]) {
  for (const change of ["origin", "cancel", "provider", "closing", "async-checker"] as const) {
    test(`W3-09-AUTH-03 / W2-18-CODING-EFFECT-01: SDK ${publishedAction ? "action" : "typed"} tail refuses ${change} after its async check`, { timeout: 10_000 }, async t => {
      const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
      const controller = new AbortController();
      const project = { project_id: randomUUID(), storage_key: "memory:typed-effect-tail" };
      const descriptor: HostCapabilityDefinition<Record<string, never>, number> = {
        capability_id: "fixture.typed.effect-tail", version: 1, operation: "command",
        ...(publishedAction ? { action: { title: "Tail", description: "Actual Host owner effect", kind: "operation" as const,
          scope: "project" as const, audiences: ["plugin" as const], scheduling: "concurrent" as const,
          permissions: [], subject_kinds: [], input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "integer" } } } : {}),
      };
      let held = true, allowed = true, returnsPromise = false, effects = 0;
      let captured: HostCapabilityInvocation | undefined;
      const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
      const handler = async (_runtime: object, _input: Record<string, never>, invocation: HostCapabilityInvocation) => {
        captured = invocation;
        await invocation.beforeEffect();
        if (held) { entered.resolve(); await release.promise; }
        invocation.assertAuthorityCurrent();
        return ++effects;
      };
      const add = () => descriptor.action ? host.registerAction(descriptor as typeof descriptor & ActionDefinition, handler) : host.register(descriptor, handler);
      let remove = add();
      const store = new LocalProjectDatabase(":memory:");
      const persistence = { db: store.db, appendEvent: (event: Parameters<typeof store.appendEvent>[0]) => store.appendEvent(event), eventCursor: (id: string) => store.eventCursor(id) };
      const artifacts = new ArtifactsModule(persistence), processItems = new ProcessItemsModule(persistence);
      const actions = { registry: host.actionRegistry(project), client: { ...host.actionClient(project), ...host.syncActionClient(project) }, project_id: project.project_id };
      const runtime = new PluginRuntime(undefined, new PluginHostExecutor({ actions, project_id: project.project_id, actor_id: "tail-fixture-actor",
        artifacts, processItems, ui: new UiHost(), capabilities: host.client(project),
        privateStorageFor: () => { throw new Error("This consumer declares no private storage"); } }), { actions });
      let capturedSdk: PluginCapabilityClient | undefined;
      const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.fixture.tail-consumer", version: "1.0.0", name: "Tail consumer", kind: "app",
        publisher: { publisher_id: "fixture", signature: "tail" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }], permissions: [],
        capabilities: { provides: [], consumes: [descriptor.capability_id] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [] },
        async start(context) { capturedSdk = context.services?.capabilities; return { kind: "app" }; } };
      const install = runtime.install({ definition, deployment: "local", grants: [] }).install;
      t.after(async () => { await runtime.stop(install.install_id); store.close(); });
      await runtime.start(install.install_id);
      assert.ok(capturedSdk, "the production executor bound the capability port");
      const sdk = capturedSdk;
      // A promise fits TypeScript's void callback convention; the production tail must reject it at runtime.
      const current = () => {
        if (!allowed) throw new ActionError("fixture.origin_revoked", "The original authority is gone");
        if (returnsPromise) return Promise.resolve();
      };
      t.signal.addEventListener("abort", () => release.resolve(), { once: true });
      let closing: Promise<void> | undefined;
      t.after(async () => { held = false; release.resolve(); remove(); await (closing ?? host.close()); });
      const pending = sdk.invoke(descriptor, {}, { signal: controller.signal, assert_authority_current: current });
      const expected = {
        cancel: { name: "AbortError" }, origin: { code: "fixture.origin_revoked" },
        provider: { code: publishedAction ? "actions.provider_changed" : "actions.provider_replaced" },
        closing: { code: "actions.host_closed" }, "async-checker": { code: "actions.async_required" },
      }[change];
      const rejected = assert.rejects(pending, expected);
      await Promise.race([entered.promise, pending.then(() => { throw new Error("The owner did not reach its tail barrier"); })]);
      if (change === "origin") allowed = false;
      else if (change === "cancel") controller.abort();
      else if (change === "provider") { remove(); remove = add(); }
      else if (change === "closing") closing = host.close();
      else returnsPromise = true;
      held = false; release.resolve(); await rejected;
      assert.equal(effects, 0, "the real registered owner did not perform a late effect");
      if (closing) { await closing; return; }
      allowed = true; returnsPromise = false;
      assert.equal(await sdk.invoke(descriptor, {}, { assert_authority_current: current }), 1, "a new authorized call remains usable");
      assert.ok(captured);
      assert.throws(() => captured.assertAuthorityCurrent(), { code: "actions.expired" }, "an ended invocation cannot be revived");
      assert.equal(effects, 1);
    });
  }
}

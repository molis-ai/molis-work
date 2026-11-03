import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ActionCallContext, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SandboxOperationContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { DEMO_PROJECT_ID, LocalProjectDatabase, createPluginPlatform, homeStores, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { DEFAULT_SANDBOX_LIMITS, SandboxBroker, SandboxError, createBackgroundLane, sandboxServicesFor, type SandboxBackgroundLane } from "@molis-ai/molis-work-plugin-sandbox";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { backgroundProbe } from "./fixtures/plugin-background.js";

// S-67 RAC-236: the broker and sandboxServicesFor reach the actual PluginBackgroundClient created by the project platform for a
// sandboxed definition. Only the lane's work is observed here; real Seatbelt processes are covered by sandbox-background.test.ts.
test("S-67 RAC-236 the sandbox path reaches the real Host client which refuses outside, undeclared and non-concurrent actions before accepting a legal command", { timeout: 60_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "sandbox-background-host-")), file = join(directory, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), shared = pluginActions(store, DEMO_PROJECT_ID);
  const values = new Map<string, string>(), probe = backgroundProbe("sbxbackground", "project");
  const platform = createPluginPlatform({ actions: shared, project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    ui: new UiHost(), privateStorageFor: () => ({ get: key => values.get(key) ?? null, set: (key, value) => { values.set(key, value); }, delete: key => values.delete(key), compareAndSet: () => true }),
    home: { directory, completeText: () => null, stores: homeStores() } });
  const target: SandboxOperationContract = { id: "work", kind: "command", effects: {}, input: { type: "string" }, output: { type: "string" }, errors: [], examples: [] };
  const launch: SandboxOperationContract = { ...target, id: "launch", effects: { background: ["work"] } };
  const checks = createBackgroundLane({ contract: { version: 1, pluginId: probe.id, revision: "one", entities: [], pages: [], acceptance: [], operations: [launch, target] },
    create: async () => { throw new Error("this test observes the lane's work without a process"); } });
  const ran: Array<{ target: string; input: unknown }> = [], completed = Promise.withResolvers<void>();
  const lane: SandboxBackgroundLane = { check: (id, input) => checks.check(id, input), stop: () => checks.stop(), async run(id, input, control) {
    await control.beforeEffect?.();
    control.signal?.throwIfAborted();
    ran.push({ target: id, input }); completed.resolve();
    return input;
  } };
  let broker: SandboxBroker | undefined;
  probe.definition.execution = "sandbox";
  delete probe.definition.stop; // This fixture supplies private storage in memory; lifecycle/storage refusal is covered over the real Home stores.
  const original = probe.definition.start;
  probe.definition.start = async context => {
    const contribution = await original(context);
    assert.equal(contribution.kind, "app");
    broker = new SandboxBroker({ projectId: DEMO_PROJECT_ID, installationId: context.install_id, pluginId: context.plugin_id, namespace: "installed" },
      { background: ["work"] }, sandboxServicesFor(context.services, { backgroundLane: lane }), DEFAULT_SANDBOX_LIMITS);
    const starts = new Set([probe.start, probe.serial, probe.undeclared, probe.query].map(action => action.capability_id));
    return { ...contribution, actions: contribution.actions!.map(action => starts.has(action.capability_id) ? { ...action, handle: async (caller: ActionExecutionContext, input: unknown) => {
      const id = await broker!.invoke(launch, caller.signal ?? new AbortController().signal, "background.start", ["work", (input as { id: string }).id], () => caller.beforeEffect());
      return { id, state: "running" };
    } } : action) };
  };
  t.after(async () => {
    broker?.stop(new SandboxError("sandbox.stopped", "test finished"));
    await lane.stop();
    try {
      await platform.closeCoordination();
      const install = platform.supervisor.installation(probe.id);
      if (install?.state === "running") await platform.runtime.stop(install.install_id);
    } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
  });
  assert.deepEqual((await platform.start([{ definition: probe.definition, grants: probe.permissions }])).running, [probe.id]);
  assert.ok(broker, "the sandboxed definition received the actual Host services");
  await assert.rejects(broker.invoke(launch, new AbortController().signal, "background.start", ["work", "outside"]), { code: "plugin.background_action_required" });
  const caller: ActionCallContext = { actor_id: "tester", project_id: DEMO_PROJECT_ID, audience: "user", permissions: probe.permissions };
  for (const action of [probe.undeclared, probe.serial, probe.query]) {
    await assert.rejects(shared.client.invoke(caller, action, { id: "refused" }), { code: "plugin.background_undeclared" });
    assert.deepEqual(ran, [], "the real Host refused before any lane work was accepted");
  }
  const answer = await shared.client.invoke(caller, probe.start, { id: "accepted" });
  assert.equal(typeof answer.id, "string");
  assert.equal(answer.state, "running");
  await completed.promise;
  assert.deepEqual(ran, [{ target: "work", input: "accepted" }], "the legal action reached the lane exactly once");
});

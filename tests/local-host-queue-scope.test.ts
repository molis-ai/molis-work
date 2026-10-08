import assert from "node:assert/strict";
import test from "node:test";

import { LocalHost } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * A call nested in one that holds the project's (or the Home's) line runs on it, because queueing behind its own
 * parent would deadlock. A concurrent action runs beside the line and does not hold it: whatever serial action it calls
 * waits its turn like any other, instead of overtaking the operation that does hold the line.
 */
const definition = (id: string, scope: "project" | "home", concurrent = false): ActionDefinition => ({ capability_id: id, version: 1, operation: "command",
  action: { title: id, description: id, kind: "operation", scope, ...(concurrent ? { scheduling: "concurrent" as const } : {}),
    audiences: ["user"], permissions: [], subject_kinds: [], input_schema: { type: "object" } } });
const settle = (milliseconds = 40) => new Promise(resolve => setTimeout(resolve, milliseconds));

test("a serial action a concurrent action calls waits behind the operation that holds the project line", async () => {
  const host = new LocalHost<{}>({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const reference = { project_id: "p1", storage_key: "memory:p1" };
  const edit = definition("fixture.edit", "project"), save = definition("fixture.save", "project"), draft = definition("fixture.draft", "project", true);
  const gate = Promise.withResolvers<void>(), editEntered = Promise.withResolvers<void>();
  const log: string[] = [];
  let value = 0;
  const client = host.actionClient(reference);
  const caller: ActionCallContext = { actor_id: "u", project_id: "p1", audience: "user", permissions: [] };
  host.actionRegistry(reference).registerProvider({ provider: { provider_id: "fixture", title: "Fixture", kind: "system" }, definitions: [edit, save, draft],
    handlers: [
      // A serial read-modify-write that awaits between its read and its write, relying on the project line for exclusivity.
      { capability_id: edit.capability_id, version: 1, handle: async context => { const read = value; log.push(`edit read ${read}`); editEntered.resolve(); await gate.promise; await context.beforeEffect(); value = read + 1; log.push(`edit wrote ${value}`); return {}; } },
      { capability_id: save.capability_id, version: 1, handle: async context => { const read = value; log.push(`save read ${read}`); await context.beforeEffect(); value = read + 10; log.push(`save wrote ${value}`); return {}; } },
      // A concurrent action (it waits for a model) that then saves through the same project client.
      { capability_id: draft.capability_id, version: 1, handle: async () => { await editEntered.promise; log.push("draft returned from the model");
        await client.invoke(caller, save, {}); log.push("draft saved"); return {}; } },
    ] });
  try {
    const editing = client.invoke(caller, edit, {});
    const drafting = client.invoke(caller, draft, {});
    await editEntered.promise;
    await settle();
    assert.ok(log.includes("draft returned from the model"));
    assert.ok(!log.some(line => line.startsWith("save")), `the nested save must wait for the held line, saw ${JSON.stringify(log)}`);
    gate.resolve();
    await Promise.all([editing, drafting]);
    assert.deepEqual(log, ["edit read 0", "draft returned from the model", "edit wrote 1", "save read 1", "save wrote 11", "draft saved"]);
    assert.equal(value, 11, "both writes survive");
  } finally { gate.resolve(); await host.close(); }
});

test("nested calls under an operation that holds the line still run on it: serial in serial, and serial through a concurrent step", async () => {
  const host = new LocalHost<{}>({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const reference = { project_id: "p1", storage_key: "memory:p1" };
  const outer = definition("fixture.outer", "project"), middle = definition("fixture.middle", "project", true), inner = definition("fixture.inner", "project");
  const client = host.actionClient(reference);
  const caller: ActionCallContext = { actor_id: "u", project_id: "p1", audience: "user", permissions: [] };
  const log: string[] = [];
  host.actionRegistry(reference).registerProvider({ provider: { provider_id: "fixture", title: "Fixture", kind: "system" }, definitions: [outer, middle, inner],
    handlers: [
      { capability_id: outer.capability_id, version: 1, handle: async () => { log.push("outer"); await client.invoke(caller, middle, {}); log.push("outer done"); return {}; } },
      { capability_id: middle.capability_id, version: 1, handle: async () => { log.push("middle"); await client.invoke(caller, inner, {}); return {}; } },
      { capability_id: inner.capability_id, version: 1, handle: () => { log.push("inner"); return {}; } },
    ] });
  try {
    await Promise.race([client.invoke(caller, outer, {}), settle(2_000).then(() => { throw new Error("queued behind itself"); })]);
    assert.deepEqual(log, ["outer", "middle", "inner", "outer done"]);
    // Standing alone, the concurrent step queues its serial call and still finishes.
    await Promise.race([client.invoke(caller, middle, {}), settle(2_000).then(() => { throw new Error("queued behind itself"); })]);
    assert.deepEqual(log.slice(4), ["middle", "inner"]);
  } finally { await host.close(); }
});

test("the Home line is held the same way: a concurrent Home action cannot overtake a serial one", async () => {
  const host = new LocalHost<{}>({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const edit = definition("fixture.home.edit", "home"), save = definition("fixture.home.save", "home"), draft = definition("fixture.home.draft", "home", true);
  const gate = Promise.withResolvers<void>(), editEntered = Promise.withResolvers<void>();
  const log: string[] = [];
  const home = host.homeActionClient();
  const caller: ActionCallContext = { actor_id: "u", project_id: null, audience: "user", permissions: [] };
  host.actionRegistry().registerProvider({ provider: { provider_id: "fixture.home", title: "Fixture", kind: "system" }, definitions: [edit, save, draft],
    handlers: [
      { capability_id: edit.capability_id, version: 1, handle: async () => { log.push("edit"); editEntered.resolve(); await gate.promise; log.push("edit done"); return {}; } },
      { capability_id: save.capability_id, version: 1, handle: () => { log.push("save"); return {}; } },
      { capability_id: draft.capability_id, version: 1, handle: async () => { await editEntered.promise; await home.invoke(caller, save, {}); return {}; } },
    ] });
  try {
    const editing = home.invoke(caller, edit, {});
    const drafting = home.invoke(caller, draft, {});
    await editEntered.promise;
    await settle();
    assert.deepEqual(log, ["edit"], "the nested Home save waits for the held Home line");
    gate.resolve();
    await Promise.all([editing, drafting]);
    assert.deepEqual(log, ["edit", "edit done", "save"]);
  } finally { gate.resolve(); await host.close(); }
});

/** A scene run is a step of the action that triggered it: it takes that action's place, so a model judgment that a
 * concurrent action asked for does not hold the project's (or the Home's) line while it waits. */
for (const [place, judgeIsConcurrent] of [["project", true], ["home", true], ["project", false], ["home", false]] as const) {
  test(`a judgment scene run from a concurrent ${place} action waits for the model beside the line, not on it (${judgeIsConcurrent ? "a concurrent" : "a serial"} judgment)`, async () => {
    const host = new LocalHost<{}>({ runtimeFactory: { open: () => ({}), close: () => {} } });
    const reference = { project_id: "p1", storage_key: "memory:p1" };
    const caller: ActionCallContext = { actor_id: "u", project_id: place === "project" ? "p1" : null, audience: "user", permissions: [] };
    const base = definition("fixture.judge", place, judgeIsConcurrent);
    const judge = { ...base, action: { ...base.action, kind: "judgment" as const, output_schema: { type: "integer" } } } as ActionDefinition;
    const ping = definition("fixture.ping", place), trigger = definition("fixture.trigger", place, true);
    const scene = { scene_id: "fixture.scene", version: 1, title: "Consumer", description: "consumer", trigger: "event", scope: place, subject_kinds: [],
      input_schema: { type: "object" }, result_schema: { type: "integer" }, permissions: [] } as const;
    const gate = Promise.withResolvers<void>(), asked = Promise.withResolvers<void>();
    let consumed = 0, saved: unknown;
    const registry = place === "project" ? host.actionRegistry(reference) : host.actionRegistry();
    const scenes = place === "project" ? host.sceneClient(reference) : host.sceneClient();
    const client = place === "project" ? host.actionClient(reference) : host.homeActionClient();
    registry.registerProvider({ provider: { provider_id: "fixture", title: "Fixture", kind: "plugin" }, definitions: [judge, ping, trigger],
      handlers: [
        { capability_id: judge.capability_id, version: 1, handle: async () => { asked.resolve(); await gate.promise; return 3; } },
        { capability_id: ping.capability_id, version: 1, handle: () => ({ pong: true }) },
        { capability_id: trigger.capability_id, version: 1, handle: async () => { await scenes.runScene(caller, scene, "binding", {}); return {}; } },
      ],
      scenes: [scene as never], scene_handlers: [{ ...scene, bindings: () => saved ? [saved as never] : [], bind: (_caller: unknown, binding: unknown) => { saved = binding; },
        consume: () => { consumed++; return "applied"; } } as never] });
    try {
      await scenes.bind(caller, { binding_id: "binding", scene_id: scene.scene_id, scene_version: 1, project_id: place === "project" ? "p1" : null,
        title: "saved", function: judge, enabled: true } as never);
      const running = client.invoke(caller, trigger, {});
      await asked.promise;
      const answered = await Promise.race([client.invoke(caller, ping, {}).then(() => true), settle(500).then(() => false)]);
      assert.equal(answered, true, "a serial action of the same line is not stuck behind the pending judgment");
      gate.resolve();
      await running;
      assert.equal(consumed, 1);
    } finally { gate.resolve(); await host.close(); }
  });
}

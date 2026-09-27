import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { actionEffect, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

const input = { type: "object", properties: {}, additionalProperties: false };
const action = (capability_id: string, kind: "query" | "operation", extra: Partial<ActionDefinition["action"]> = {}, audiences: ActionDefinition["action"]["audiences"] = ["user", "agent", "mcp"]): ActionDefinition => ({
  capability_id, version: 1, operation: kind === "query" ? "query" : "command",
  action: { title: capability_id, description: capability_id, kind, scope: "project", audiences, permissions: [], subject_kinds: [], input_schema: input, ...extra },
});
const definitions = [
  action("goals.list", "query"),
  action("goals.note", "operation"),
  action("goals.trash", "operation"),
  action("projects.delete", "operation"),
  action("goals.archive", "operation", { effect: "irreversible" }),
  action("goals.secret", "query", { plugin: false }),
  action("goals.user-only", "query", {}, ["user"]),
  action("lingguang.capture", "operation", {}, ["plugin"]),
];
const user: ActionCallContext = { actor_id: "alice", project_id: "p", audience: "user", permissions: [] };
const plugin: ActionCallContext = { actor_id: "plugin:io.molis.work.generated.x", project_id: "p", audience: "plugin", permissions: [] };

test("generated plugins reach what agents reach, except what cannot be undone or opts out; others see no change", async () => {
  const service = new ActionService();
  service.registerProvider({ provider: { provider_id: "goals", title: "Goals", kind: "plugin", plugin_id: "goals" }, definitions,
    handlers: definitions.map(definition => ({ capability_id: definition.capability_id, version: 1, handle: () => ({ ok: definition.capability_id }) })) });
  assert.deepEqual(service.discover(plugin).map(view => view.capability_id).sort(), ["goals.list", "goals.note", "lingguang.capture"],
    "reads and reversible writes offered to agents, plus what is offered to plugins directly");
  assert.deepEqual(service.discover(user).map(view => view.capability_id).sort(),
    ["goals.archive", "goals.list", "goals.note", "goals.secret", "goals.trash", "goals.user-only", "projects.delete"], "the user sees exactly what they saw before");
  assert.deepEqual(await service.invoke(plugin, { capability_id: "goals.note", version: 1 }, {}), { ok: "goals.note" });
  await assert.rejects(service.invoke(plugin, { capability_id: "goals.trash", version: 1 }, {}), "a plugin can never delete");
  // The install grant still decides: with exact grants, only what the person approved can be called.
  const granted = { ...plugin, allowed_actions: [{ capability_id: "goals.list", version: 1 }] };
  assert.deepEqual(service.discover(granted).map(view => view.capability_id), ["goals.list"]);
  await assert.rejects(service.invoke(granted, { capability_id: "goals.note", version: 1 }, {}));
});

test("an action's effect is declared, or inferred from its kind and id", () => {
  assert.equal(actionEffect({ kind: "query" }, "goals.list"), "read");
  assert.equal(actionEffect({ kind: "operation" }, "goals.note"), "write");
  assert.equal(actionEffect({ kind: "operation" }, "goals.trash"), "irreversible");
  assert.equal(actionEffect({ kind: "operation" }, "shelf.items.remove"), "irreversible");
  assert.equal(actionEffect({ kind: "operation" }, "planning.removals-report"), "write", "a word inside another word is not the verb");
  assert.equal(actionEffect({ kind: "operation", effect: "write" }, "tags.remove"), "write", "a provider can say removing a tag is reversible");
});

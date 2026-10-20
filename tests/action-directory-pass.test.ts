import assert from "node:assert/strict";
import test from "node:test";
import { ActionService, rememberInDirectoryPass } from "@molis-ai/molis-work-kernel";
import { ActionError, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

const context: ActionCallContext = { actor_id: "alice", project_id: "project-one", audience: "user", permissions: [] };
const provider = { provider_id: "notes", title: "笔记", kind: "system" as const, project_id: "project-one" };
const action = (n: number): ActionDefinition => ({
  capability_id: `notes.read-${n}`, version: 1, operation: "query",
  action: { title: `读取 ${n}`, description: "读取笔记", kind: "query", scope: "project", audiences: ["user"], permissions: [],
    subject_kinds: [], input_schema: { type: "object", additionalProperties: false } },
});

// VUX-35 VUX-36 VUX-37: a project page asks the directory many times; each directory asked every action's provider its own state,
// so a provider with many actions opened its store once per action (Pages: once per action, per directory, per request).
test("VUX-37 a directory asks a provider for its own state once for all its actions, and the next directory asks again", async () => {
  const service = new ActionService();
  let asked = 0, open = true, settings = 0;
  const definitions = [1, 2, 3, 4, 5].map(action);
  service.registerProvider({ provider, definitions,
    availability: () => { asked++; return open ? { available: true } : { available: false, code: "notes.closed", reason: "笔记库已关闭" }; },
    handlers: definitions.map(definition => ({ capability_id: definition.capability_id, version: 1, handle: () => ({ ok: true }),
      // What an action's own check reads (the model settings, say) is shared the same way, by whoever reads it.
      availability: () => rememberInDirectoryPass(context, "settings", () => { settings++; return { available: true as const }; }) })) });

  assert.ok(service.discover(context).every(view => view.availability.available));
  assert.equal(asked, 1, "one directory, one question");
  assert.equal(settings, 1, "a read shared within the directory happens once");

  open = false;
  const after = service.discover(context);
  assert.equal(asked, 2, "the next directory reads afresh");
  assert.ok(after.every(view => !view.availability.available && view.availability.code === "notes.closed"), "what changed in between is seen");

  // Outside a directory nothing is kept: a call asks the provider itself, and a closed provider refuses.
  await assert.rejects(service.invoke(context, definitions[0]!, {}), (error: ActionError) => error.code === "notes.closed");
  assert.equal(asked, 3);
  const read = () => rememberInDirectoryPass(context, "settings", () => { settings++; return { available: true as const }; });
  const before = settings;
  read(); read();
  assert.equal(settings, before + 2, "a read outside a directory is not kept");
});

test("VUX-37 a read that fails inside a directory is not kept for the actions after it", () => {
  const service = new ActionService();
  let reads = 0;
  const definitions = [1, 2].map(action);
  service.registerProvider({ provider, definitions,
    handlers: definitions.map(definition => ({ capability_id: definition.capability_id, version: 1, handle: () => ({ ok: true }),
      availability: () => {
        try { return rememberInDirectoryPass(service, "flaky", () => { reads++; if (reads === 1) throw new Error("busy"); return { available: true as const }; }); }
        catch { return { available: false as const, code: "notes.busy", reason: "稍后再试" }; }
      } })) });
  const views = service.discover(context);
  assert.deepEqual(views.map(view => view.availability.available), [false, true]);
  assert.equal(reads, 2);
});

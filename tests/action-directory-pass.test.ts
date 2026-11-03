import assert from "node:assert/strict";
import test from "node:test";
import { ActionService, forgetInDirectoryPass, inDirectoryPass, rememberInDirectoryPass } from "@molis-ai/molis-work-kernel";
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

test("VUX-37 a write within a directory makes the next read in it fresh, and the reads before it stay shared", () => {
  const scope = {};
  let reads = 0;
  const read = () => rememberInDirectoryPass(scope, "install", () => ++reads);
  const seen = inDirectoryPass(() => {
    const first = [read(), read()];
    forgetInDirectoryPass(scope, "install");
    return [...first, read(), read()];
  });
  assert.deepEqual(seen, [1, 1, 2, 2]);
  forgetInDirectoryPass(scope, "install");
  assert.equal(read(), 3, "outside a pass there is nothing to forget, and a read reads");
});

// RAC-1130 – RAC-1134 (BL-814): every plugin action's availability asks the caller's own authority check, and a delegated caller's check
// walks its whole chain of original callers (each one's grant included). A directory asks it once; it keeps only a pass, and only for itself.
const authority = { asked: 0, named: 0, refuse: 0 };
const asking: ActionCallContext = { ...context, assert_authority_current: reference => {
  if (reference) authority.named++; else authority.asked++;
  if (authority.refuse > 0) { authority.refuse--; throw new ActionError("actions.forbidden", "授权已撤销"); }
} };
const askingService = (rows: number, naming = false) => {
  const service = new ActionService(), definitions = Array.from({ length: rows }, (_, n) => action(n + 1));
  Object.assign(authority, { asked: 0, named: 0, refuse: 0 });
  service.registerProvider({ provider, definitions, handlers: definitions.map(definition => ({ capability_id: definition.capability_id, version: 1, handle: () => ({ ok: true }), execution: "sync" as const,
    // As `pluginActionAvailability` does: the plugin's own read runs only while the caller's authority holds.
    availability: (caller: ActionCallContext) => {
      try { caller.assert_authority_current?.(naming ? { capability_id: definition.capability_id, version: 1 } : undefined); }
      catch (error) { return { available: false as const, code: (error as ActionError).code, reason: (error as ActionError).message }; }
      return { available: true as const };
    } })) });
  return { service, definitions };
};

test("RAC-1130 a directory asks the caller's own authority once for all its rows, and the next directory asks again", () => {
  const { service } = askingService(5);
  assert.ok(service.discover(asking).every(view => view.availability.available));
  assert.equal(authority.asked, 1, "five rows, one question");
  service.discover(asking);
  assert.equal(authority.asked, 2, "nothing is kept between directories");
});

test("RAC-1131 a refusal is not kept: the next row asks again, and only a pass is shared", () => {
  const { service } = askingService(5);
  authority.refuse = 1;
  assert.deepEqual(service.discover(asking).map(view => view.availability.available), [false, true, true, true, true]);
  assert.equal(authority.asked, 2, "the refused row's answer was thrown away; the pass after it is shared");
  authority.refuse = Infinity;
  const refused = service.discover(asking);
  assert.ok(refused.every(view => !view.availability.available && view.availability.code === "actions.forbidden"));
  assert.equal(authority.asked, 2 + 5, "a caller refused every time is asked on every row");
});

test("RAC-1132 a check that names an action asks the caller itself on every row", () => {
  const { service } = askingService(5, true);
  service.discover(asking);
  assert.deepEqual([authority.named, authority.asked], [5, 0]);
});

test("RAC-1133 authority taken away in the same round refuses the call after the directory, and the next directory sees it", () => {
  const { service, definitions } = askingService(3);
  inDirectoryPass(() => {
    assert.ok(service.discover(asking).every(view => view.availability.available));
    // A call asks the caller itself (its last check and its own availability), never the directory's answer, even inside the pass.
    assert.deepEqual(service.invokeSync(asking, definitions[0]!, {}), { ok: true });
    assert.deepEqual([authority.named, authority.asked], [1, 2]);
    authority.refuse = Infinity;
    assert.throws(() => service.invokeSync(asking, definitions[0]!, {}), (error: ActionError) => error.code === "actions.forbidden");
    const asked = authority.asked;
    // A directory nested in the round keeps its own answers, not the one before it.
    assert.ok(service.discover(asking).every(view => !view.availability.available));
    assert.equal(authority.asked, asked + 3);
  });
  assert.ok(service.discover(asking).every(view => view.availability.code === "actions.forbidden"));
});

test("RAC-1134 a list of allowed actions answers the same in a directory as one by one", async () => {
  const { service, definitions } = askingService(5);
  const allowed: ActionCallContext = { ...context, allowed_actions: [
    { capability_id: "notes.read-1", version: 1 }, { capability_id: "notes.read-2", version: 1, provider_id: "notes" },
    { capability_id: "notes.read-3", version: 1, provider_id: "other" }, { capability_id: "notes.read-4", version: 2 },
  ] };
  assert.deepEqual(service.discover(allowed).map(view => view.capability_id), ["notes.read-1", "notes.read-2"]);
  const calls = await Promise.allSettled(definitions.map(definition => service.invoke(allowed, definition, {})));
  assert.deepEqual(calls.map(call => call.status), ["fulfilled", "fulfilled", "rejected", "rejected", "rejected"], "a call outside a directory checks the list itself");
});

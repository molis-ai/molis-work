import assert from "node:assert/strict";
import test from "node:test";
import { ActionService, forgetInDirectoryPass, inDirectoryPass, rememberInDirectoryPass } from "@molis-ai/molis-work-kernel";
import { ActionError, defineSubjectContextAction, resolveActionSubject, subjectContext, type ActionCallContext, type ActionDefinition, type ActionReference, type ActionSceneDefinition, type ActionSceneBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalHost } from "@molis-ai/molis-work-app-local-host";

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

test("DIRECTORY-MEM-01 initial permission matching preserves exact references, visibility intersections and fresh callers", () => {
  const service = new ActionService();
  const first = action(1), secondVersion = { ...first, version: 2 };
  const permission = { ...action(2), action: { ...action(2).action, permissions: ["notes.read"] } };
  const command: ActionDefinition = { ...action(3), operation: "command", action: { ...action(3).action, kind: "operation" } };
  const metered: ActionDefinition = { ...action(4), action: { ...action(4).action, execution: { cost: "metered" } } };
  const workflow: ActionDefinition = { ...action(5), action: { ...action(5).action, audiences: ["workflow"] } };
  const definitions = [first, secondVersion, permission, command, metered, workflow];
  const register = (source: typeof provider, items: ActionDefinition[]) => service.registerProvider({ provider: source, definitions: items,
    handlers: items.map(definition => ({ ...definition, handle: () => ({ ok: true }) })) });
  register(provider, definitions);
  const otherAction = action(6);
  register({ ...provider, provider_id: "other" }, [otherAction]);
  register({ ...provider, provider_id: "foreign", project_id: "project-two" }, [first]);
  const visible = (caller: ActionCallContext) => service.discover(caller).map(view => [view.capability_id, view.version, view.provider.provider_id]);
  const base = { ...context, allowed_capability_ids: [first.capability_id, otherAction.capability_id] };
  const notes = [first.capability_id, 1, "notes"], other = [otherAction.capability_id, 1, "other"];
  assert.deepEqual(visible(base), [notes, [first.capability_id, 2, "notes"], other], "undefined adds no restriction");
  assert.deepEqual(visible({ ...base, allowed_actions: [] }), [], "empty grants deny all");
  assert.deepEqual(visible({ ...base, allowed_actions: [first, otherAction] }), [notes, other], "omitted providers match, exact versions only");
  assert.deepEqual(visible({ ...base, allowed_actions: [first, otherAction].map(reference => ({ ...reference, provider_id: "" })) }), [notes, other], "empty provider retains wildcard meaning");
  assert.deepEqual(visible({ ...base, allowed_actions: [{ ...first, provider_id: "*" }] }), [], "a literal star is not a wildcard");
  assert.deepEqual(visible({ ...base, allowed_actions: [{ ...first, provider_id: "notes" }, { ...first, provider_id: "notes" }] }), [notes]);
  const grants: ActionReference[] = [{ ...first, provider_id: "notes" }];
  const caller = { ...base, allowed_actions: grants };
  assert.deepEqual(visible(caller), [notes]);
  grants.splice(0, 1, { ...secondVersion, provider_id: "notes" });
  assert.deepEqual(visible(caller), [[first.capability_id, 2, "notes"]], "the next directory sees same-length replacement");

  const restricted = { ...context, query_only: true, allowed_actions: definitions,
    allowed_capability_ids: [first.capability_id, permission.capability_id, command.capability_id, metered.capability_id, workflow.capability_id] };
  assert.deepEqual(visible(restricted), [notes, [first.capability_id, 2, "notes"]], "permissions, query cost, audience and project still intersect");
  assert.deepEqual(visible({ ...restricted, allowed_capability_ids: [permission.capability_id], permissions: ["notes.read"] }), [[permission.capability_id, 1, "notes"]]);
  assert.deepEqual(visible({ ...restricted, actor_id: "" }), []);

  const dynamicGrants: ActionReference[] = [permission];
  const dynamic: ActionCallContext = { ...base, allowed_actions: dynamicGrants, allowed_capability_ids: [permission.capability_id],
    get permissions() { dynamicGrants.length = 0; return ["notes.read"]; } };
  assert.deepEqual(visible(dynamic), [], "a caller getter that withdraws grants must use the live matcher");
  dynamicGrants.push(permission);
  assert.deepEqual(service.discover(dynamic, { provider_id: "notes" }), [], "metadata filtering preserves the selected caller's getter/live-matcher fallback");
  assert.deepEqual(service.discover({ ...restricted, permissions: [] }, { input_type: "missing" }), []);
  assert.deepEqual(service.discover({ ...restricted, allowed_capability_ids: [permission.capability_id] }, { provider_id: "notes" }), [], "selected metadata cannot supply a missing permission");
  assert.deepEqual(service.discover({ ...context, audience: "agent" }, { provider_id: "notes" }), [], "selected roots retain audience checks");
  assert.deepEqual(service.discover(context, { provider_id: "foreign" }), [], "metadata filtering cannot expose a different project");
});

test("DIRECTORY-MEM-02 availability can revoke or replace grants after initial filtering; invoke never writes", async () => {
  for (const filter of [undefined, { provider_id: "notes" }]) for (const replacement of [[], [action(2)]] satisfies ActionReference[][]) {
    const service = new ActionService();
    const definition: ActionDefinition = { ...action(1), operation: "command", action: { ...action(1).action, kind: "operation" } };
    const grants: ActionReference[] = [definition];
    const caller = { ...context, allowed_actions: grants };
    const writes: string[] = [];
    let checks = 0;
    service.registerProvider({ provider, definitions: [definition],
      availability: () => { checks++; grants.splice(0, grants.length, ...replacement); return { available: true }; },
      handlers: [{ ...definition, handle: () => { writes.push("written"); return { ok: true }; } }] });
    const views = service.discover(caller, filter);
    assert.equal(views.length, 1, "the initial grant admitted metadata before the callback");
    assert.equal(views[0]!.availability.available, false);
    assert.equal(views[0]!.availability.code, "actions.forbidden");
    assert.deepEqual(grants, replacement, "the callback's revocation or replacement remains in effect");
    assert.equal(checks, 1);
    grants.splice(0, grants.length, definition);
    await assert.rejects(service.invoke(caller, definition, {}), (error: ActionError) => error.code === "actions.forbidden");
    assert.equal(checks, 2, "invoke performs its own live provider check");
    assert.deepEqual(writes, [], "neither directory nor denied dispatch reached the business handler");
    const inspected = service.inspect(caller);
    assert.equal(inspected.length, 1, "inspect still includes metadata outside the caller's grants");
    assert.equal(inspected[0]!.availability.code, "actions.forbidden");
  }
});

// MEM-DIRECTORY-FILTER-01: exact root selection skips unrelated checks without widening authority.
test("source discovery filters select exact metadata before authorizing the selected roots", () => {
  const service = new ActionService(), checked: string[] = [];
  const first = { ...action(1), action: { ...action(1).action, input_type: "note.request", output_type: "note.result", subject_kinds: ["note", "page"] } };
  const second = { ...action(2), action: { ...first.action, output_type: "note.other" } };
  for (const [source, definitions] of [[provider, [first, second]], [{ ...provider, provider_id: "other" }, [action(3)]]] as const) {
    service.registerProvider({ provider: source, definitions,
      handlers: definitions.map(definition => ({ ...definition, availability: () => { checked.push(definition.capability_id); return { available: true }; }, handle: () => null })) });
  }
  const filter = { provider_id: "notes", input_type: "note.request", output_type: "note.result", subject_kind: "note" };
  const refs = (value: Parameters<typeof service.discover>[1], caller = context) => service.discover(caller, value).map(view => view.capability_id);
  assert.deepEqual(refs(filter), [first.capability_id]);
  assert.deepEqual(checked, [first.capability_id], "only the selected root's handler availability is evaluated");
  checked.length = 0;
  service.discover(context);
  assert.deepEqual(checked.sort(), [first.capability_id, second.capability_id, action(3).capability_id], "unfiltered discovery retains the original complete pass");
  checked.length = 0;
  service.inspect(context);
  assert.deepEqual(checked.sort(), [first.capability_id, second.capability_id, action(3).capability_id], "inspect retains its original complete availability pass");
  assert.deepEqual(refs({ ...filter, subject_kind: "page" }), [first.capability_id]);
  for (const key of ["provider_id", "input_type", "output_type", "subject_kind"] as const) {
    for (const value of ["", "*", "missing"]) assert.deepEqual(refs({ ...filter, [key]: value }), [], `${key} is exact, not a wildcard`);
  }
  assert.deepEqual(refs({ provider_id: "notes" }), [first.capability_id, second.capability_id]);
  assert.deepEqual(refs(filter, { ...context, allowed_actions: [second] }), [], "a filter cannot widen allowed_actions");
  assert.deepEqual(refs(filter, { ...context, allowed_actions: [{ ...first, provider_id: "other" }] }), []);
  assert.deepEqual(refs(filter, { ...context, allowed_actions: [{ ...first, provider_id: "notes" }] }), [first.capability_id]);
});

test("Host filtered roots without dependencies never call unrelated provider, handler or Host availability", async t => {
  const seen = { provider: [] as string[], handler: [] as string[], host: [] as string[] };
  const reference = { project_id: context.project_id!, storage_key: "memory:filtered-roots" };
  let selectedOpen = true, writes = 0;
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} },
    actionAvailability: (_caller, view) => { seen.host.push(view.provider.provider_id); return { available: true }; } });
  t.after(() => host.close());
  const selected = action(71), unrelated = action(72);
  for (const [id, definition] of [["selected", selected], ["unrelated", unrelated]] as const) {
    host.actionRegistry(reference).registerProvider({ provider: { ...provider, provider_id: id }, definitions: [definition],
      availability: () => { seen.provider.push(id); return id === "selected" && !selectedOpen
        ? { available: false, code: "fixture.closed", reason: "Selected owner closed" } : { available: true }; },
      handlers: [{ ...definition, availability: () => { seen.handler.push(id); return { available: true }; }, handle: () => { writes++; return null; } }] });
  }
  const client = host.actionClient(reference), filter = { provider_id: "selected" };
  const first = await client.discover(context, filter);
  assert.deepEqual(first.map(view => view.capability_id), [selected.capability_id]);
  assert.equal(first[0]!.availability.available, true);
  for (const phase of Object.values(seen)) {
    assert.ok(phase.includes("selected"), "the actual selected root still passes each layer");
    assert.ok(!phase.includes("unrelated"), "unrelated roots are never evaluated");
  }
  selectedOpen = false;
  assert.equal((await client.discover(context, filter))[0]!.availability.code, "fixture.closed", "the next directory reads current state again");
  await assert.rejects(client.invoke(context, { ...selected, provider_id: "selected" }, {}), { code: "fixture.closed" });
  assert.equal(writes, 0);
});

// MEM-DIRECTORY-FILTER-02: outside dependencies, scenes and awaited authority changes retain their original refusals.
test("Host source projection keeps dependencies outside the filter and rechecks current policy and grants", async t => {
  const projected: string[] = [], reference = { project_id: context.project_id!, storage_key: "memory:source-projection" };
  let dependencyOpen = true, opened = 0, invoked = 0;
  const host = new LocalHost({ runtimeFactory: { open: () => { opened++; return {}; }, close: () => {} },
    actionAvailability: async (_caller, view) => {
      projected.push(view.capability_id);
      return view.provider.provider_id === "dependency" && !dependencyOpen
        ? { available: false, code: "actions.unavailable", reason: "Dependency withdrawn" } : { available: true };
    } });
  t.after(() => host.close());
  const dependency = action(20), unrelated = action(30), root = { ...action(10), action: { ...action(10).action,
    required_actions: [{ capability_id: dependency.capability_id, version: dependency.version, provider_id: "dependency" }] } };
  let stopDependency!: () => void;
  for (const [providerId, definition] of [["selected", root], ["dependency", dependency], ["unrelated", unrelated]] as const) {
    const stop = host.actionRegistry(reference).registerProvider({ provider: { ...provider, provider_id: providerId }, definitions: [definition],
      handlers: [{ ...definition, handle: () => { invoked++; return null; } }] });
    if (providerId === "dependency") stopDependency = stop;
  }
  const client = host.actionClient(reference), filter = { provider_id: "selected" };
  const first = await client.discover(context, filter);
  assert.equal(opened, 1, "discovery still prepares the project Runtime");
  assert.deepEqual(first.map(view => view.capability_id), [root.capability_id]);
  assert.equal(first[0]!.availability.available, true);
  assert.deepEqual(projected.sort(), [root.capability_id, dependency.capability_id].sort(), "only roots and their dependencies receive Host projection");
  projected.length = 0; dependencyOpen = false;
  const after = await client.discover(context, filter);
  assert.equal(after[0]!.availability.code, "actions.unavailable");
  await assert.rejects(client.invoke(context, root, {}), { code: "actions.unavailable" });
  assert.equal(invoked, 0);
  dependencyOpen = true;
  const restricted = { ...context, allowed_actions: [{ ...root, provider_id: "selected" }] };
  const fullRestricted = await client.discover(restricted), projectedRestricted = await client.discover(restricted, filter);
  assert.equal(projectedRestricted[0]!.availability.code, "actions.forbidden", "Kernel rejects the registered dependency outside allowed_actions");
  assert.deepEqual(projectedRestricted, fullRestricted, "projection preserves the complete directory's denial for the same caller");
  assert.deepEqual(await client.discover({ ...context, allowed_actions: [dependency] }, filter), []);
  stopDependency();
  const stopReplacement = host.actionRegistry(reference).registerProvider({ provider: { ...provider, provider_id: "replacement" }, definitions: [dependency],
    handlers: [{ ...dependency, handle: () => { invoked++; return null; } }] });
  assert.equal((await client.discover(context, filter))[0]!.availability.code, "actions.provider_changed", "an outside dependency cannot borrow a different provider's registration");
  await assert.rejects(client.invoke(context, root, {}), { code: "actions.provider_changed" });
  stopReplacement();
  const nextVersion = { ...dependency, version: 2 };
  host.actionRegistry(reference).registerProvider({ provider: { ...provider, provider_id: "dependency" }, definitions: [nextVersion],
    handlers: [{ ...nextVersion, handle: () => { invoked++; return null; } }] });
  assert.equal((await client.discover(context, filter))[0]!.availability.code, "actions.dependency_missing", "an outside dependency still needs the exact version");
  await assert.rejects(client.invoke(context, root, {}), { code: "actions.dependency_missing" });
  assert.equal(invoked, 0);
  const home = { ...action(40), action: { ...action(40).action, scope: "home" as const } };
  host.actionRegistry().registerProvider({ provider: { provider_id: "home", title: "Home", kind: "system" }, definitions: [home], handlers: [{ ...home, handle: () => null }] });
  assert.deepEqual((await host.homeActionClient().discover({ ...context, project_id: null }, { provider_id: "home" })).map(view => view.capability_id), [home.capability_id]);
});

test("Host filtered roots still resolve an outside scene, its saved binding and current judgment policy", async t => {
  const reference = { project_id: context.project_id!, storage_key: "memory:filtered-scene" };
  let sceneOpen = true, judgmentOpen = true, writes = 0;
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} },
    actionAvailability: (_caller, view) => view.provider.provider_id === "judgment" && !judgmentOpen
      ? { available: false, code: "fixture.judgment_revoked", reason: "Judgment revoked" } : { available: true },
    sceneAvailability: () => sceneOpen ? { available: true } : { available: false, code: "fixture.scene_revoked", reason: "Scene revoked" },
  });
  t.after(() => host.close());
  const judgment: ActionDefinition = { ...action(80), operation: "command", action: { ...action(80).action, kind: "judgment", output_schema: { type: "number" } } };
  const scene: ActionSceneDefinition = { scene_id: "outside.scene", version: 1, title: "Consumer", description: "Outside the root filter",
    trigger: "requested", scope: "project", subject_kinds: [], permissions: [],
    input_schema: judgment.action.input_schema, result_schema: judgment.action.output_schema! };
  const root: ActionDefinition = { ...action(81), action: { ...action(81).action, required_scene: { scene_id: scene.scene_id, version: scene.version } } };
  let binding: ActionSceneBinding | undefined;
  host.actionRegistry(reference).registerProvider({ provider: { ...provider, provider_id: "selected" }, definitions: [root],
    handlers: [{ ...root, handle: () => { writes++; return null; } }] });
  host.actionRegistry(reference).registerProvider({ provider: { ...provider, provider_id: "judgment" }, definitions: [judgment],
    handlers: [{ ...judgment, handle: () => 3 }] });
  host.actionRegistry(reference).registerProvider({ provider: { ...provider, provider_id: "consumer" }, definitions: [], handlers: [], scenes: [scene],
    scene_handlers: [{ ...scene, bindings: () => binding ? [binding] : [], bind: (_caller, value) => { binding = value; }, consume: () => null }] });
  const client = host.actionClient(reference), filter = { provider_id: "selected" };
  assert.equal((await client.discover(context, filter))[0]!.availability.code, "actions.binding_required");
  await host.sceneClient(reference).bind(context, { binding_id: "real-binding", title: "Selected judgment", scene_id: scene.scene_id, scene_version: scene.version,
    project_id: reference.project_id, function: { capability_id: judgment.capability_id, version: judgment.version, provider_id: "judgment" }, enabled: true });
  const available = await client.discover(context, filter);
  assert.deepEqual(available.map(view => view.capability_id), [root.capability_id]);
  assert.equal(available[0]!.availability.available, true);
  sceneOpen = false;
  assert.equal((await client.discover(context, filter))[0]!.availability.code, "fixture.scene_revoked");
  await assert.rejects(client.invoke(context, { ...root, provider_id: "selected" }, {}), { code: "fixture.scene_revoked" });
  sceneOpen = true; judgmentOpen = false;
  assert.equal((await client.discover(context, filter))[0]!.availability.code, "fixture.judgment_revoked");
  await assert.rejects(client.invoke(context, { ...root, provider_id: "selected" }, {}), { code: "fixture.judgment_revoked" });
  assert.equal(writes, 0);
});

test("Host filtered roots retain cycles through dependencies outside the result", async t => {
  const reference = { project_id: context.project_id!, storage_key: "memory:filtered-cycle" };
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  t.after(() => host.close());
  let writes = 0;
  const first = action(91), second = action(92);
  const root = { ...first, action: { ...first.action, required_actions: [{ ...second, provider_id: "outside" }] } };
  const outside = { ...second, action: { ...second.action, required_actions: [{ ...first, provider_id: "selected" }] } };
  for (const [id, definition] of [["selected", root], ["outside", outside]] as const) {
    host.actionRegistry(reference).registerProvider({ provider: { ...provider, provider_id: id }, definitions: [definition],
      handlers: [{ ...definition, handle: () => { writes++; return null; } }] });
  }
  const client = host.actionClient(reference);
  assert.equal((await client.discover(context, { provider_id: "selected" }))[0]!.availability.code, "actions.dependency_cycle");
  await assert.rejects(client.invoke(context, { ...root, provider_id: "selected" }, {}), { code: "actions.dependency_cycle" });
  assert.equal(writes, 0);
});

for (const change of ["revoke", "replace"] as const) {
  test(`Host filtered discovery does not preserve permission or registration across an awaited ${change}`, async t => {
    const reference = { project_id: context.project_id!, storage_key: `memory:filtered-${change}` };
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    let open = true, writes = 0;
    const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} },
      actionAvailability: () => open ? { available: true } : { available: false, code: "fixture.revoked", reason: "Current authority revoked" } });
    t.after(async () => { release.resolve(); await host.close(); });
    const definition: ActionDefinition = { ...action(90), operation: "command", action: { ...action(90).action, kind: "operation" } };
    const register = () => host.actionRegistry(reference).registerProvider({ provider: { ...provider, provider_id: "selected" }, definitions: [definition],
      handlers: [{ ...definition, handle: async caller => { entered.resolve(); await release.promise; await caller.beforeEffect(); writes++; return null; } }] });
    let stop = register();
    try {
      const client = host.actionClient(reference), filter = { provider_id: "selected" };
      assert.equal((await client.discover(context, filter))[0]!.availability.available, true);
      const pending = client.invoke(context, { ...definition, provider_id: "selected" }, {});
      const rejected = assert.rejects(pending, { code: change === "revoke" ? "fixture.revoked" : "actions.provider_changed" });
      await Promise.race([entered.promise, pending.then(() => { throw new Error("The operation returned before its real effect boundary"); })]);
      if (change === "revoke") open = false;
      else { stop(); stop = register(); }
      release.resolve();
      await rejected;
      assert.equal(writes, 0, "the previously discovered root cannot write with stale authority or a replacement registration");
      const fresh = await client.discover(context, filter);
      assert.equal(fresh[0]!.availability.available, change === "replace", "a fresh query observes the current registration and current permission");
    } finally { release.resolve(); stop(); }
  });
}

test("subject protocol projection checks all matching owners and keeps ambiguity and caller restrictions", async t => {
  const projected: string[] = [], calls: string[] = [];
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} },
    actionAvailability: async (_caller, view) => { projected.push(view.capability_id); return { available: true }; } });
  t.after(() => host.close());
  const reference = { project_id: context.project_id!, storage_key: "memory:subject-projection" };
  const first = defineSubjectContextAction("first.note.read", "note", "Note", []), second = defineSubjectContextAction("second.note.read", "note", "Note", []);
  const page = defineSubjectContextAction("other.page.read", "page", "Page", []);
  for (const [providerId, definition] of [["first", first], ["second", second], ["other", page]] as const) {
    host.actionRegistry(reference).registerProvider({ provider: { ...provider, provider_id: providerId }, definitions: [definition], handlers: [{ ...definition,
      handle: (_caller, input) => { calls.push(providerId); return subjectContext({ subject: { kind: "note", id: (input as { subject_id: string }).subject_id }, revision: "v1", title: "Note", content: "owner words", goal_ids: [] }); } }] });
  }
  const client = host.actionClient(reference), subject = { kind: "note", id: "n1" };
  await assert.rejects(resolveActionSubject(client, context, subject), { code: "actions.subject_ambiguous" });
  assert.deepEqual(calls, []);
  assert.deepEqual(projected.sort(), [first.capability_id, second.capability_id].sort(), "the page reader is not projected, but neither note owner is hidden");
  const result = await resolveActionSubject(client, { ...context, allowed_actions: [{ ...first, provider_id: "first" }] }, subject);
  assert.equal(result.reader.provider_id, "first"); assert.equal(result.context.content, "owner words");
  assert.deepEqual(calls, ["first"]);
});

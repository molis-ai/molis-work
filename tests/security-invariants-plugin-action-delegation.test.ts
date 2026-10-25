import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionAudience, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import { currentPluginAction } from "@molis-ai/molis-work-plugin-runtime";
import { openTestHome } from "./fixtures/test-home.js";

/**
 * S-43: a plugin that declares and holds `actions:delegate` reaches the Host's action directory from inside its own running action, as
 * that action's original caller under the workflow audience (user decision 2026-10-20). Each test asserts a refusal: the target's handler
 * never runs, and nothing the plugin was meant to store after the call is stored.
 */

const DELEGATE = "actions:delegate";
const GRANTED = ["storage:private", DELEGATE];
const WITHOUT_GRANT = ["storage:private"];
const PAGE_PERMISSIONS = ["storage:private", "delegate:read"];

interface Directive { op: "discover" | "invoke" | "query"; reference?: ActionReference; input?: unknown }

/** A Home plugin whose one action does what the directive says through `services.actions.directory`, then stores what it got. */
function delegateProbe(name: string, options: { declare?: boolean; consumes?: readonly string[]; permissions?: readonly string[] } = {}) {
  const id = `io.molis.work.example.${name}`, contexts: PluginStartContext[] = [], seen: ActionExecutionContext[] = [];
  const action: ActionDefinition<Directive, unknown> = { capability_id: `${name}.run`, version: 1, operation: "command", action: {
    title: "Use the action directory", description: "Reach another action as the original caller", kind: "operation", scope: "home", scheduling: "concurrent",
    audiences: ["user", "agent", "mcp", "workflow"], permissions: ["storage:private"], subject_kinds: [],
    input_schema: { type: "object", properties: { op: { type: "string" }, reference: { type: "object" }, input: { type: "object" } }, additionalProperties: false },
  } };
  const behavior: { handle?(context: PluginStartContext, caller: ActionExecutionContext): Promise<unknown> } = {};
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: `delegate-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: "storage:private", required: true, reason: "Keep what the delegated call returned" },
      ...(options.declare === false ? [] : [{ permission: DELEGATE, required: false, reason: "Call other actions as the person who asked" }]),
      ...(options.permissions ?? []).map(permission => ({ permission, required: false, reason: "Use what the target needs" }))],
    capabilities: { provides: [], consumes: [...(options.consumes ?? [])] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [action],
  }, async start(context) {
    contexts.push(context);
    return { kind: "app", actions: [{ ...action, async handle(caller, raw) {
      seen.push(caller);
      if (behavior.handle) return behavior.handle(context, caller);
      const directive = raw as Directive, directory = context.services!.actions!.directory!;
      const result = directive.op === "discover" ? (await directory.discover()).map(view => view.capability_id).sort()
        : await directory.invoke(directive.reference!, directive.input ?? {});
      await caller.beforeEffect();
      context.services!.storage!.set("delivered", JSON.stringify(result));
      return result;
    } }] };
  } };
  return { id, action, behavior, definition, contexts, seen, delivered: () => contexts.at(-1)!.services!.storage!.get("delivered") };
}
type Probe = ReturnType<typeof delegateProbe>;

const target = (capability_id: string, audiences: ActionAudience[], permissions: string[]): ActionDefinition => ({ capability_id, version: 1, operation: "command",
  action: { title: capability_id, description: "A delegation target", kind: "operation", scope: "project", audiences, permissions, subject_kinds: [],
    input_schema: { type: "object" }, output_schema: { type: "string" } } });
const OPEN = target("delegate.open", ["user", "agent", "mcp", "workflow"], ["delegate:read"]);
const NO_WORKFLOW = target("delegate.no_workflow", ["user", "agent", "mcp"], ["delegate:read"]);
const NO_AGENT = target("delegate.workflow_but_not_agent", ["user", "workflow"], ["delegate:read"]);
const NEEDS_MORE = target("delegate.needs_more", ["user", "agent", "mcp", "workflow"], ["delegate:read", "delegate:admin"]);
/** A target in no project, so a caller with no project reaches it as well: what refuses it is then the caller's own action list or its authority check. */
const HOME_OPEN: ActionDefinition = { ...OPEN, capability_id: "delegate.home_open", action: { ...OPEN.action, title: "delegate.home_open", scope: "home" } };
const ref = (definition: ActionDefinition): ActionReference => ({ capability_id: definition.capability_id, version: definition.version });

async function setup(t: TestContext, probes: readonly Probe[] = [delegateProbe("delegator")], grants: readonly string[] = GRANTED) {
  const served = await openTestHome(t, { catalogPolicy: false, host: { pluginFixtures: { home: probes.map(probe => probe.definition) } } });
  const project = await served.createProject("Delegation", []);
  const platform = await served.host.homePlugins!.ready(), probe = probes[0]!;
  /** A grant can only be what the Manifest declares, so a probe that does not declare `actions:delegate` is given the rest. */
  const regrant = async (target: Probe, permissions: readonly string[]) => {
    const install = served.host.homePlugins!.installation(target.id)!, declared = target.definition.manifest.permissions.map(row => row.permission);
    await platform.runtime.stop(install.install_id); platform.runtime.grant(install.install_id, permissions.filter(permission => declared.includes(permission))); await platform.supervisor.restart(target.id);
  };
  for (const each of probes) await regrant(each, each === probe ? grants : GRANTED);
  const client = served.host.actionClient(project.reference), ran: string[] = [], targetsSeen: ActionExecutionContext[] = [];
  const hold: { wait?: () => Promise<void> } = {};
  const offer = (definitions: readonly ActionDefinition[]) => served.host.actionRegistry(project.reference).registerProvider({
    provider: { provider_id: "delegation-targets", title: "Delegation targets", kind: "system" }, definitions: [...definitions],
    handlers: definitions.map(definition => ({ ...definition, handle: async (caller: ActionExecutionContext) => { ran.push(definition.capability_id); targetsSeen.push(caller); await hold.wait?.(); return "done"; } })) });
  const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: PAGE_PERMISSIONS };
  const run = (directive: Directive, current: ActionCallContext = caller, which: Probe = probe) => client.invoke(current, which.action, directive);
  return { ...served, project, platform, probe, regrant, client, ran, targetsSeen, hold, offer, caller, run,
    log: () => readFileSync(join(served.home, "logs/action-calls.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line) as Record<string, unknown>) };
}

test("W5-01-DELEGATE-01 S-43 only a plugin whose Manifest declares actions:delegate gets services.actions.directory", async t => {
  const undeclared = delegateProbe("undeclared", { declare: false }), declared = delegateProbe("declared");
  await setup(t, [undeclared, declared]);
  assert.equal(undeclared.contexts.at(-1)!.services!.actions!.directory, undefined);
  assert.equal(typeof declared.contexts.at(-1)!.services!.actions!.directory!.invoke, "function");
  assert.equal(typeof declared.contexts.at(-1)!.services!.actions!.directory!.discover, "function");
  assert.equal(typeof declared.contexts.at(-1)!.services!.actions!.directory!.check, "function");
});

test("W5-01-DELEGATE-01 S-43 a declared but not granted permission refuses discover and invoke, and the target never runs", async t => {
  const s = await setup(t, [delegateProbe("ungranted")], WITHOUT_GRANT);
  s.offer([OPEN]);
  // A Home installation says a grant it does not hold as `actions.forbidden` (its executor checks its own record first).
  await assert.rejects(s.run({ op: "discover" }), { code: "actions.forbidden" });
  await assert.rejects(s.run({ op: "invoke", reference: ref(OPEN) }), { code: "actions.forbidden" });
  assert.deepEqual(s.ran, []); assert.equal(s.probe.delivered(), null);
  await s.regrant(s.probe, GRANTED);
  assert.equal(await s.run({ op: "invoke", reference: ref(OPEN) }), "done");
  assert.deepEqual(s.ran, [OPEN.capability_id]);
});

test("W5-01-DELEGATE-01 S-43 without actions:delegate a guard retained as workflow reaches nothing: the plugin's own call to a workflow-only target is refused and the target never runs", async t => {
  // The plugin holds the target's own permission, so what refuses it is the audience alone.
  const plain = delegateProbe("plain", { declare: false, consumes: [NO_AGENT.capability_id], permissions: ["delegate:read"] });
  const s = await setup(t, [plain], ["storage:private", "delegate:read"]); s.offer([NO_AGENT]);
  plain.behavior.handle = async (context, caller) => {
    // The kernel admits the target into a guard as workflow sees it; a guard checks and grants nothing.
    const guard = caller.retainAuthority!([{ ...ref(NO_AGENT), provider_id: "delegation-targets" }], { audience: "workflow" });
    await guard();
    assert.equal(context.services!.actions!.directory, undefined);
    return context.services!.actions!.invoke(NO_AGENT, {}, caller);
  };
  await assert.rejects(s.run({ op: "invoke" }), { code: "actions.dependency_missing" });
  assert.deepEqual(s.ran, []); assert.equal(plain.delivered(), null);
});

test("W5-01-DELEGATE-02 S-43 outside a running action, from another installation's action, and after the action ended, the directory refuses", async t => {
  const first = delegateProbe("scopeone"), second = delegateProbe("scopetwo");
  const s = await setup(t, [first, second]);
  s.offer([OPEN]);
  const outside = first.contexts.at(-1)!.services!.actions!.directory!;
  await assert.rejects(outside.invoke(ref(OPEN), {}), { code: "actions.forbidden" });
  await assert.rejects(outside.discover(), { code: "actions.forbidden" });
  first.behavior.handle = async () => second.contexts.at(-1)!.services!.actions!.directory!.invoke(ref(OPEN), {});
  await assert.rejects(s.run({ op: "discover" }), { code: "actions.forbidden" });
  first.behavior.handle = undefined;
  const release = Promise.withResolvers<void>(); let late: Promise<unknown> | undefined, lateDiscover: Promise<unknown> | undefined;
  first.behavior.handle = async context => {
    const directory = context.services!.actions!.directory!;
    late = release.promise.then(() => directory.invoke(ref(OPEN), {})); lateDiscover = release.promise.then(() => directory.discover());
    return "done";
  };
  assert.equal(await s.run({ op: "discover" }), "done");
  release.resolve();
  await assert.rejects(late!, { code: "actions.expired" }); await assert.rejects(lateDiscover!, { code: "actions.expired" });
  assert.deepEqual(s.ran, []);
});

test("W5-01-DELEGATE-02 S-43 a malformed reference is refused before any directory is asked", async t => {
  const s = await setup(t); s.offer([OPEN]);
  for (const bad of [{ capability_id: "../x", version: 1 }, { capability_id: OPEN.capability_id, version: 0 }, { capability_id: OPEN.capability_id, version: 1, provider_id: "bad\nid" },
    { capability_id: OPEN.capability_id, version: 1, provider_id: " " }, { capability_id: OPEN.capability_id, version: 1, provider_id: "x".repeat(513) }]) {
    await assert.rejects(s.run({ op: "invoke", reference: bad }), { code: "actions.reference_invalid" });
  }
  assert.deepEqual(s.ran, []);
});

/** The provider ids the platform makes for external MCP servers: a connection in 服务连接, and a server a plugin's own MCP settings name. */
const MCP_PROVIDERS = ["system.connectors#mcp:3b2f0c1e-6a0d-4c55-9a8e-2f1d7c9e4b10", "io.molis.work.coding#mcp:notes"] as const;

test("W5-01-DELEGATE-02 S-43 a provider id the platform makes for an external MCP server (#mcp:) passes the reference check: check, invoke and a query delegation reach the target pinned to it", async t => {
  const command = target("delegate.mcp_tool", ["user", "workflow"], ["delegate:read"]), held = target("delegate.mcp_read", ["user", "workflow"], ["delegate:read"]);
  const query: ActionDefinition = { ...held, operation: "query", action: { ...held.action, kind: "query" } };
  const probe = delegateProbe("mcpshaped", { consumes: [query.capability_id], permissions: ["delegate:read"] });
  const s = await setup(t, [probe], [...GRANTED, "delegate:read"]);
  // Only the provider's id is under test: each target is offered under one of the two shapes, by a provider of its own.
  for (const [provider_id, definition] of [[MCP_PROVIDERS[0], command], [MCP_PROVIDERS[1], query]] as const) {
    t.after(s.host.actionRegistry(s.project.reference).registerProvider({ provider: { provider_id, title: provider_id, kind: "system" }, definitions: [definition],
      handlers: [{ ...definition, handle: async () => { s.ran.push(definition.capability_id); return "done"; } }] }));
  }
  probe.behavior.handle = async context => {
    const actions = context.services!.actions!, tool = { ...ref(command), provider_id: MCP_PROVIDERS[0] };
    await actions.directory!.check(tool, {});
    return [await actions.directory!.invoke(tool, {}), await actions.invokeQuery({ ...ref(query), provider_id: MCP_PROVIDERS[1] }, {})];
  };
  assert.deepEqual(await s.run({ op: "invoke" }), ["done", "done"]);
  assert.deepEqual(s.ran, [command.capability_id, query.capability_id]);
});

test("W5-01-DELEGATE-03 S-43 a call the plugin made with its own grants (plugin audience) is not widened to the workflow audience", async t => {
  const delegator = delegateProbe("widened"), caller = delegateProbe("widener", { consumes: ["widened.run"] });
  const s = await setup(t, [delegator, caller]);
  s.offer([OPEN]);
  caller.behavior.handle = (context, execution) => context.services!.actions!.invoke(delegator.action, { op: "invoke", reference: ref(OPEN) }, execution);
  await assert.rejects(s.run({ op: "invoke", reference: ref(OPEN) }, s.caller, caller), { code: "actions.forbidden" });
  assert.equal(delegator.seen.at(-1)!.audience, "plugin");
  assert.deepEqual(s.ran, []); assert.equal(delegator.delivered(), null);
  // The same action, called by the person, may delegate: the refusal is the audience, nothing else.
  assert.equal(await s.run({ op: "invoke", reference: ref(OPEN) }, s.caller, delegator), "done");
});

for (const audience of ["user", "agent", "mcp", "workflow"] as const) {
  test(`W5-01-DELEGATE-03 S-43 an original caller of the ${audience} audience may delegate, and the target is reached as workflow`, async t => {
    const s = await setup(t); s.offer([OPEN]);
    assert.equal(await s.run({ op: "invoke", reference: ref(OPEN) }, { ...s.caller, audience, actor_id: `runtime:${audience}` }), "done");
    assert.equal(s.targetsSeen.at(-1)!.audience, "workflow"); assert.equal(s.targetsSeen.at(-1)!.actor_id, `runtime:${audience}`);
  });
}

test("W5-01-DELEGATE-04 S-43 the nested caller is the original under the workflow audience with delegated_by, the same permissions and no plugin identity", async t => {
  const s = await setup(t); s.offer([OPEN]);
  const forged = { plugin_id: "forged.plugin", install_id: "forged-install", actor_id: "runtime:shape", project_id: s.project.project_id, declaration: s.probe.definition, assertActive: () => undefined };
  const original: ActionCallContext = { ...s.caller, actor_id: "runtime:shape", audience: "agent", actor_kind: "runtime", audit_actor_id: "runtime:shape:session", runtime_session_id: "session-1",
    plugin_install_id: "forged-install" };
  // A caller that names a plugin the Host never issued is refused at the gateway (S-15) before the plugin's action starts, so only the install id can ride along.
  const started = s.probe.seen.length, ranBefore = s.ran.length;
  await assert.rejects(s.run({ op: "invoke", reference: ref(OPEN) }, { ...original, host_plugin: forged }), { code: "host.plugin_caller_invalid" });
  assert.equal(s.probe.seen.length, started, "the plugin's action never started"); assert.equal(s.ran.length, ranBefore, "the target never ran");
  assert.equal(await s.run({ op: "invoke", reference: ref(OPEN) }, original), "done");
  const nested = s.targetsSeen.at(-1)!;
  assert.equal(nested.audience, "workflow"); assert.equal(nested.delegated_by, s.probe.id);
  assert.equal(nested.actor_id, "runtime:shape"); assert.equal(nested.actor_kind, "runtime"); assert.equal(nested.audit_actor_id, "runtime:shape:session");
  assert.equal(nested.runtime_session_id, "session-1"); assert.equal(nested.project_id, s.project.project_id);
  assert.deepEqual(nested.permissions, original.permissions);
  assert.equal(Object.hasOwn(nested, "plugin_install_id"), false); assert.equal(Object.hasOwn(nested, "host_plugin"), false);
  // The permission the target needs was never granted to the plugin: the plugin's grants do not narrow the call.
  assert.equal(s.probe.contexts.at(-1)!.grants.includes("delegate:read"), false);
  // The plugin's own action saw the original, not a delegated caller.
  assert.equal(s.probe.seen.at(-1)!.audience, "agent"); assert.equal(s.probe.seen.at(-1)!.delegated_by, undefined);
});

test("W5-01-DELEGATE-05 S-43 a target not open to workflow, a permission the original caller lacks, and a pinned provider that is not the owner are refused", async t => {
  const s = await setup(t); s.offer([OPEN, NO_WORKFLOW, NEEDS_MORE]);
  await assert.rejects(s.run({ op: "invoke", reference: ref(NO_WORKFLOW) }), { code: "actions.dependency_missing" });
  await assert.rejects(s.run({ op: "invoke", reference: ref(NEEDS_MORE) }), { code: "actions.dependency_missing" });
  await assert.rejects(s.run({ op: "invoke", reference: { ...ref(OPEN), provider_id: "someone-else" } }), { code: "actions.dependency_missing" });
  assert.deepEqual(s.ran, []); assert.equal(s.probe.delivered(), null);
  // The grant of the permission is the original caller's, not the plugin's: with it the same reference is reached.
  assert.equal(await s.run({ op: "invoke", reference: ref(NEEDS_MORE) }, { ...s.caller, permissions: [...PAGE_PERMISSIONS, "delegate:admin"] }), "done");
});

test("W5-01-DELEGATE-05 S-43 discover lists what the delegated caller sees: not what only the plugin's own audience or the caller's missing permissions reach", async t => {
  const s = await setup(t); s.offer([OPEN, NO_WORKFLOW, NEEDS_MORE]);
  const listed = await s.run({ op: "discover" }) as string[];
  assert.ok(listed.includes(OPEN.capability_id));
  for (const hidden of [NO_WORKFLOW, NEEDS_MORE]) assert.equal(listed.includes(hidden.capability_id), false);
});

test("W5-01-DELEGATE-05 S-43 the target's audience is checked against workflow only, as for Workflows: an agent caller without per-action grants reaches a target open to workflow but not to agents, not one closed to workflow", async t => {
  const s = await setup(t); s.offer([NO_AGENT, NO_WORKFLOW]);
  const agent: ActionCallContext = { ...s.caller, audience: "agent", actor_id: "runtime:agent" };
  assert.equal(await s.run({ op: "invoke", reference: ref(NO_AGENT) }, agent), "done");
  assert.equal(s.targetsSeen.at(-1)!.audience, "workflow");
  s.ran.length = 0;
  await assert.rejects(s.run({ op: "invoke", reference: ref(NO_WORKFLOW) }, agent), { code: "actions.dependency_missing" });
  assert.deepEqual(s.ran, []);
});

/**
 * A caller shaped like the one `apps/local-host/src/mcp-action-client.ts` makes: `audience: "mcp"`, `allowed_actions` only the actions this client was granted
 * (`mcp-action-grants.ts` `resolveMcpActionContext`), and `validate_authority` / `assert_authority_current` that refuse an action outside that table with
 * `mcp.action_revoked` (`assertMcpActionAuthority`). The delegated call inherits both, so the client reaches what it was granted and no more.
 */
function mcpShaped(base: ActionCallContext, granted: () => readonly ActionReference[]): ActionCallContext {
  const assertGranted = (reference?: ActionReference) => {
    if (reference && !granted().some(item => item.capability_id === reference.capability_id && item.version === reference.version)) {
      throw new ActionError("mcp.action_revoked", "此客户端的能力授权已撤销或发生变化，请重新检查对外接入设置");
    }
  };
  return { ...base, actor_id: "mcp:client", audience: "mcp", get allowed_actions() { return granted().map(item => ({ ...item })); },
    validate_authority: async reference => assertGranted(reference), assert_authority_current: reference => assertGranted(reference) };
}

test("W5-01-DELEGATE-05 S-43 a caller shaped like an MCP client cannot delegate past its own grants: a target open to workflow but not granted to it is refused and never runs", async t => {
  const s = await setup(t); s.offer([OPEN]);
  // The client holds `delegate:read` through some other granted action, so the permission is not what refuses the target: only its grant table is.
  const granted: ActionReference[] = [{ capability_id: s.probe.action.capability_id, version: 1 }];
  const mcp = mcpShaped(s.caller, () => granted);
  await assert.rejects(s.run({ op: "invoke", reference: ref(OPEN) }, mcp), { code: "actions.dependency_missing" });
  assert.deepEqual(s.ran, []); assert.equal(s.probe.delivered(), null);
  assert.equal(s.probe.seen.at(-1)!.audience, "mcp"); assert.deepEqual(s.probe.seen.at(-1)!.allowed_actions?.map(item => item.capability_id), [s.probe.action.capability_id]);
  // The same client with the target in its table reaches it, as workflow: the refusal above was the client's grants and nothing else.
  granted.push(ref(OPEN));
  assert.equal(await s.run({ op: "invoke", reference: ref(OPEN) }, mcp), "done");
  assert.deepEqual(s.ran, [OPEN.capability_id]); assert.equal(s.targetsSeen.at(-1)!.audience, "workflow"); assert.equal(s.targetsSeen.at(-1)!.actor_id, "mcp:client");
});

test("W5-01-DELEGATE-05 S-43 a caller shaped like an MCP client whose grant on the target was withdrawn after its action list was made is refused by its own authority check, and the target never runs", async t => {
  const s = await setup(t); s.offer([OPEN]);
  // The target is still in `allowed_actions`, but the client's authority check no longer accepts it (mcp.action_revoked): the nested call asks that check too.
  const listed = [{ capability_id: s.probe.action.capability_id, version: 1 }, ref(OPEN)], accepted: ActionReference[] = [listed[0]!];
  const withdrawn: ActionCallContext = { ...mcpShaped(s.caller, () => accepted), get allowed_actions() { return listed.map(item => ({ ...item })); } };
  await assert.rejects(s.run({ op: "invoke", reference: ref(OPEN) }, withdrawn), { code: "mcp.action_revoked" });
  assert.deepEqual(s.ran, []); assert.equal(s.probe.delivered(), null);
  accepted.push(ref(OPEN));
  assert.equal(await s.run({ op: "invoke", reference: ref(OPEN) }, withdrawn), "done");
  assert.deepEqual(s.ran, [OPEN.capability_id]);
});

test("W5-01-DELEGATE-03 S-43 a plugin calling its own action through services.actions.invoke delegates only as far as that caller reaches: not to another plugin's target, which never runs", async t => {
  // `plugin-actions-client.ts` `actionCaller` makes this caller: the user audience (so `originOf` lets it through), the plugin's own grants, `allowed_actions` of
  // its own actions and `required_actions` only, and an authority check that knows only the actions the plugin declares. The delegated call inherits all of it.
  const selfcall = delegateProbe("selfcall", { permissions: ["delegate:read"] });
  const s = await setup(t, [selfcall], [...GRANTED, "delegate:read"]);
  const home = s.host.actionRegistry().registerProvider({ provider: { provider_id: "delegation-home-targets", title: "Delegation home targets", kind: "system" }, definitions: [HOME_OPEN],
    handlers: [{ ...HOME_OPEN, handle: async (caller: ActionExecutionContext) => { s.ran.push(HOME_OPEN.capability_id); s.targetsSeen.push(caller); return "done"; } }] });
  t.after(home);
  // The person reaches the home-scoped target by delegating from the plugin's action: the target itself is open, and the plugin holds the permission.
  assert.equal(await s.run({ op: "invoke", reference: ref(HOME_OPEN) }, s.caller, selfcall), "done");
  assert.deepEqual(s.ran, [HOME_OPEN.capability_id]); assert.equal(selfcall.delivered(), '"done"');
  s.ran.length = 0; selfcall.contexts.at(-1)!.services!.storage!.delete("delivered");
  let depth = 0;
  selfcall.behavior.handle = async (context, caller) => depth++ === 0
    ? context.services!.actions!.invoke(selfcall.action, { op: "invoke", reference: ref(HOME_OPEN) }, caller)
    : context.services!.actions!.directory!.invoke(ref(HOME_OPEN), {});
  await assert.rejects(s.run({ op: "invoke" }, s.caller, selfcall), { code: "actions.dependency_missing" });
  assert.equal(depth, 2);
  const inner = selfcall.seen.at(-1)!;
  assert.equal(inner.audience, "user"); assert.deepEqual(inner.allowed_actions?.map(item => item.capability_id), [selfcall.action.capability_id]);
  assert.deepEqual(s.ran, []); assert.equal(selfcall.delivered(), null);
});

test("W5-01-DELEGATE-04 S-43 same-plugin invoke and directory delegation preserve the original runtime memory authority across audience changes", async t => {
  const selfcall = delegateProbe("memoryselfcall", { permissions: ["delegate:read"] });
  const query: ActionDefinition = { ...HOME_OPEN, capability_id: "memoryselfcall.read", operation: "query",
    action: { ...HOME_OPEN.action, kind: "query", permissions: ["storage:private", "delegate:read"] } };
  const runtimeMemory: NonNullable<ActionCallContext["runtime_memory"]> = { plugin_id: selfcall.id, current_scene: "coding",
    class_restrictions: { policy_version: 2, taxonomy_version: 1, personal: [],
      project: [{ selector: { consumer: "agent", current_scene: "coding", kind: "convention" }, read: "off", form: "inherit" }] } };
  const originalPolicy = structuredClone(runtimeMemory), audiences: ActionAudience[] = [];
  const runtimeMemoryRead: NonNullable<ActionCallContext["runtime_memory_read"]> = {
    read: async () => { throw new Error("The Host control is not a plugin callback API"); },
  };
  let forgedReads = 0;
  const forgedRead: typeof runtimeMemoryRead = { read: async () => { forgedReads++; throw new Error("Forged control executed"); } };
  let observed = 0, projectId: string;
  const inspectPluginView = (caller: ActionExecutionContext) => {
    audiences.push(caller.audience);
    assert.equal(Object.hasOwn(caller, "runtime_memory"), false, "the plugin cannot inspect the Host's Run snapshot");
    assert.equal(caller.runtime_memory, undefined);
    assert.equal(Object.hasOwn(caller, "runtime_memory_read"), false, "neither nested callback receives the live Run capability");
    assert.equal(caller.runtime_memory_read, undefined);
    Reflect.set(caller, "runtime_memory_read", forgedRead);
    const fake = structuredClone(runtimeMemory);
    fake.class_restrictions.project[0]!.read = "inherit";
    Reflect.set(caller, "runtime_memory", fake);
    assert.deepEqual(runtimeMemory, originalPolicy, "editing the plugin view cannot relax the original snapshot");
  };
  // Test-only Host observation of the public Runtime scope; the plugin callback receives only its projected view.
  const observeHostCaller = () => {
    const scope = currentPluginAction();
    assert.ok(scope);
    assert.equal(scope.definition.capability_id, query.capability_id);
    const caller = scope.caller;
    assert.equal(caller.actor_id, "agent:prologue");
    assert.equal(caller.actor_kind, "runtime");
    assert.equal(caller.audit_actor_id, "agent:prologue:memory-session");
    assert.equal(caller.runtime_session_id, "memory-session");
    assert.equal(caller.project_id, projectId);
    assert.equal(caller.audience, "workflow");
    assert.equal(caller.delegated_by, selfcall.id);
    assert.equal(caller.runtime_memory, runtimeMemory, "the final invocation retains the original Host snapshot object");
    assert.equal(caller.runtime_memory_read, runtimeMemoryRead, "both production wrappers retain the original control, not the callback's lookalike");
    assert.deepEqual(caller.runtime_memory, originalPolicy, "neither wrapper can substitute its permissive fake");
    observed++;
  };
  const base = selfcall.definition;
  selfcall.definition = { ...base, manifest: { ...base.manifest, actions: [selfcall.action, query] }, async start(context) {
    const contribution = await base.start(context);
    return { ...contribution, actions: [...(contribution.actions ?? []), { ...query, handle: caller => {
      inspectPluginView(caller);
      observeHostCaller();
      return "done";
    } }] };
  } };
  const s = await setup(t, [selfcall], [...GRANTED, "delegate:read"]);
  projectId = s.project.project_id;
  let depth = 0;
  selfcall.behavior.handle = async (context, caller) => {
    inspectPluginView(caller);
    return depth++ === 0
      ? context.services!.actions!.invoke(selfcall.action, { op: "query" }, caller)
      : context.services!.actions!.directory!.invoke(ref(query), {});
  };
  const original: ActionCallContext = { ...s.caller, actor_id: "agent:prologue", actor_kind: "runtime", audience: "agent",
    audit_actor_id: "agent:prologue:memory-session", runtime_session_id: "memory-session", runtime_memory: runtimeMemory, runtime_memory_read: runtimeMemoryRead };
  assert.equal(await s.run({ op: "query" }, original, selfcall), "done");
  assert.equal(depth, 2);
  assert.deepEqual(audiences, ["agent", "user", "workflow"]);
  assert.equal(observed, 1, "the declared query actually executed after both nested calls");
  assert.equal(original.runtime_memory, runtimeMemory);
  assert.deepEqual(original.runtime_memory, originalPolicy);
  assert.equal(original.runtime_memory_read, runtimeMemoryRead);
  // S-43 own invoke uses the installation's grants. Withdraw only the target's permission; both source callbacks still run.
  await s.regrant(selfcall, GRANTED);
  depth = 0;
  await assert.rejects(s.run({ op: "query" }, original, selfcall), { code: "actions.dependency_missing" });
  assert.equal(depth, 2, "the source and its own nested action remained authorized");
  assert.equal(observed, 1, "the target disappeared from this caller's directory after its actual grant was withdrawn");

  // Direct directory delegation retains the original caller's target check, independently of its genuine Memory control.
  await s.regrant(selfcall, [...GRANTED, "delegate:read"]);
  selfcall.behavior.handle = async (context, caller) => {
    inspectPluginView(caller);
    return context.services!.actions!.directory!.invoke(ref(query), {});
  };
  assert.equal(await s.run({ op: "query" }, original, selfcall), "done");
  assert.equal(observed, 2, "the same target is reachable by direct delegation before withdrawal");
  await assert.rejects(s.run({ op: "query" }, { ...original, assert_authority_current: reference => {
    if (reference?.capability_id === query.capability_id) throw new ActionError("actions.forbidden", "Exact query grant withdrawn");
  } }, selfcall), { code: "actions.forbidden" });
  assert.equal(observed, 2, "the original caller's refused target never executed through direct delegation");
  assert.equal(forgedReads, 0, "self-reported controls were never called");
});

for (const mutation of ["source-stop", "source-revoke", "target-replace", "parent-revoke", "cancel"] as const) {
  test(`W5-01-DELEGATE-06 S-43 ${mutation} while the delegated call waits prevents result delivery`, async t => {
    const s = await setup(t), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    s.hold.wait = async () => { entered.resolve(); await release.promise; };
    let remove = s.offer([OPEN]), active = true;
    const abort = new AbortController();
    const pending = s.run({ op: "invoke", reference: ref(OPEN) }, { ...s.caller, signal: abort.signal,
      assert_authority_current: () => { if (!active) throw new ActionError("actions.forbidden", "Origin revoked"); } });
    const rejected = assert.rejects(pending);
    try {
      await Promise.race([entered.promise, pending.then(() => { throw new Error("Missed delegated wait"); })]);
      const install = s.host.homePlugins!.installation(s.probe.id)!;
      if (mutation === "source-stop") await s.platform.runtime.stop(install.install_id);
      if (mutation === "source-revoke") { await s.platform.runtime.stop(install.install_id); s.platform.runtime.grant(install.install_id, WITHOUT_GRANT); }
      if (mutation === "target-replace") { remove(); remove = s.offer([OPEN]); }
      if (mutation === "parent-revoke") active = false;
      if (mutation === "cancel") abort.abort();
    } finally { release.resolve(); }
    await rejected; remove();
    if (mutation === "source-stop" || mutation === "source-revoke") await s.platform.supervisor.restart(s.probe.id);
    assert.equal(s.probe.delivered(), null);
  });
}

test("W5-01-DELEGATE-07 S-43 the call log row names the plugin beside the original actor, and the same call made directly names no plugin", async t => {
  const s = await setup(t); s.offer([OPEN]);
  const original: ActionCallContext = { ...s.caller, actor_id: "runtime:logged", audience: "agent" };
  await s.run({ op: "invoke", reference: ref(OPEN) }, original);
  await s.client.invoke({ ...original, audience: "workflow" }, OPEN, {});
  const rows = s.log().filter(row => row.capability_id === OPEN.capability_id);
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0]!.actor_id, rows[0]!.audience, rows[0]!.delegated_by], ["runtime:logged", "workflow", s.probe.id]);
  assert.deepEqual([rows[1]!.actor_id, rows[1]!.audience, rows[1]!.delegated_by], ["runtime:logged", "workflow", undefined]);
  // The plugin's own action row is the original caller's call, with no delegation on it.
  const own = s.log().find(row => row.capability_id === s.probe.action.capability_id)!;
  assert.deepEqual([own.actor_id, own.audience, own.delegated_by], ["runtime:logged", "agent", undefined]);
  // The delegated call keeps the original call's call_id, so a lookup by that id shows the original and the call it delegated (the latter with delegated_by).
  assert.equal(typeof own.call_id, "string"); assert.equal(rows[0]!.call_id, own.call_id);
});

/** What `LOCAL_OWNER_PERMISSIONS` gives the person over the Host's own project settings; no probe here declares it. */
const PERSON_HOLDS = "projects:settings";
/** A Host provider the person holds `projects:settings` over (`localOwnerPermissionsOver`). */
const PERSON_HOLDS_PROVIDER = "system.project-workspaces";

/**
 * A project plugin whose page route runs its action as the person on the page, the production path: `web-request.ts` gives the route the
 * person's caller, `projectRouteControl` carries it and `bindPluginActionRoute` passes it on. The action then delegates through the directory.
 */
function routeProbe(name: string, consumes: readonly string[] = []) {
  const id = `io.molis.work.example.${name}`, contexts: PluginStartContext[] = [];
  const action: ActionDefinition<Directive, unknown> = { capability_id: `${name}.run`, version: 1, operation: "command", action: {
    title: "Use the action directory from a page", description: "Reach another action as the person on the page", kind: "operation", scope: "project", scheduling: "concurrent",
    audiences: ["user"], permissions: ["storage:private"], subject_kinds: [],
    input_schema: { type: "object", properties: { op: { type: "string" }, reference: { type: "object" }, input: { type: "object" } }, additionalProperties: false },
  } };
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: `delegate-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: "storage:private", required: true, reason: "Keep what the delegated call returned" },
      { permission: DELEGATE, required: true, reason: "Call other actions as the person who asked" }],
    capabilities: { provides: [], consumes: [...consumes] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [action],
    routes: [{ route_id: "run", method: "POST", path: "/run", permission: "storage:private" }],
  }, async start(context) {
    contexts.push(context);
    return { kind: "app", actions: [{ ...action, async handle(caller, raw) {
      const directive = raw as Directive, actions = context.services!.actions!;
      const result = directive.op === "query" ? await actions.invokeQuery(directive.reference!, directive.input ?? {})
        : await actions.directory!.invoke(directive.reference!, directive.input ?? {});
      await caller.beforeEffect();
      context.services!.storage!.set("delivered", JSON.stringify(result));
      return result;
    } }], routes: [bindPluginActionRoute(context, action, request => request.body as Directive, "run")] };
  } };
  return { id, definition, grants: () => contexts.at(-1)!.grants, delivered: () => contexts.at(-1)!.services!.storage!.get("delivered") };
}

/** The page's call to the probe's route, with what S-03 asks of a page request. */
const fromPage = (s: { origin: string; controlToken: string }, projectId: string, pluginId: string, directive: Directive) =>
  fetch(`${s.origin}/projects/${projectId}/api/plugins/${pluginId}/run`, { method: "POST",
    headers: { origin: s.origin, "content-type": "application/json", "x-molis-work-control-token": s.controlToken, "x-molis-work-idempotency-key": randomUUID() },
    body: JSON.stringify(directive) });

test("W5-01-DELEGATE-08 S-43 from the page, a project plugin's route reaches a target needing a permission the person holds and the plugin does not; not one the person lacks or one closed to workflow", async t => {
  const probe = routeProbe("routed");
  const s = await openTestHome(t, { catalogPolicy: false, host: { pluginFixtures: { project: [probe.definition] } } });
  const project = await s.createProject("Route delegation", []);
  const held = target("delegate.person_holds", ["user", "workflow"], [PERSON_HOLDS]);
  const lacked = target("delegate.person_lacks", ["user", "workflow"], ["delegate:admin"]);
  const closed = target("delegate.person_holds_not_workflow", ["user"], [PERSON_HOLDS]);
  const ran: string[] = [];
  // What the person holds is held over a provider (PG-007 stage 4): the targets sit under the Host provider the person holds
  // `projects:settings` over, so "held" means held there; a Host provider the person holds nothing over would reach nothing at all.
  t.after(s.host.actionRegistry(project.reference).registerProvider({ provider: { provider_id: PERSON_HOLDS_PROVIDER, title: "Delegation targets", kind: "system" },
    definitions: [held, lacked, closed], handlers: [held, lacked, closed].map(definition => ({ ...definition, handle: async () => { ran.push(definition.capability_id); return "done"; } })) }));
  const run = (definition: ActionDefinition) => fromPage(s, project.project_id, probe.id, { op: "invoke", reference: ref(definition) });
  for (const refused of [lacked, closed]) {
    const response = await run(refused);
    assert.notEqual(response.status, 200);
    assert.equal((await response.json() as { code?: string }).code, "actions.dependency_missing");
  }
  assert.deepEqual(ran, []); assert.equal(probe.delivered(), null);
  // The plugin answers for its own action's permission only; the target's is the person's.
  assert.equal(probe.grants().includes(PERSON_HOLDS), false);
  const response = await run(held);
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(await response.json(), "done");
  assert.deepEqual(ran, [held.capability_id]); assert.equal(probe.delivered(), '"done"');
});

test("W5-01-DELEGATE-08 S-43 from the page, a plugin holding actions:delegate still has its query delegation narrowed to its own grants: invokeQuery cannot reach a query needing a permission only the person holds, which the directory reaches", async t => {
  const held = target("delegate.person_query", ["user", "workflow"], [PERSON_HOLDS]);
  const query: ActionDefinition = { ...held, operation: "query", action: { ...held.action, kind: "query" } };
  const probe = routeProbe("routedquery", [query.capability_id]);
  const s = await openTestHome(t, { catalogPolicy: false, host: { pluginFixtures: { project: [probe.definition] } } });
  const project = await s.createProject("Route query delegation", []);
  const ran: string[] = [];
  t.after(s.host.actionRegistry(project.reference).registerProvider({ provider: { provider_id: PERSON_HOLDS_PROVIDER, title: "Delegation targets", kind: "system" },
    definitions: [query], handlers: [{ ...query, handle: async () => { ran.push(query.capability_id); return "done"; } }] }));
  // The route's person caller no longer narrows what a nested call adds for this plugin; the query delegation still narrows its own children.
  const refused = await fromPage(s, project.project_id, probe.id, { op: "query", reference: ref(query) });
  assert.notEqual(refused.status, 200);
  assert.equal((await refused.json() as { code?: string }).code, "actions.dependency_missing");
  assert.deepEqual(ran, []); assert.equal(probe.delivered(), null);
  assert.equal(probe.grants().includes(PERSON_HOLDS), false);
  // The same target through the directory, as the person: the refusal above was the query delegation's narrowing and nothing else.
  const reached = await fromPage(s, project.project_id, probe.id, { op: "invoke", reference: ref(query) });
  assert.equal(reached.status, 200, await reached.clone().text());
  assert.deepEqual(ran, [query.capability_id]); assert.equal(probe.delivered(), '"done"');
});

const TYPED: ActionDefinition = { ...OPEN, capability_id: "delegate.typed", action: { ...OPEN.action, title: "delegate.typed",
  input_schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false } } };

test("W5-01-DELEGATE-09 S-43 check refuses an input the target's schema rejects with the code invoke gives, and runs and logs nothing either way", async t => {
  const s = await setup(t); s.offer([TYPED]);
  const inputs: unknown[] = [];
  s.probe.behavior.handle = async context => { await context.services!.actions!.directory!.check(ref(TYPED), inputs.at(-1)); return "checked"; };
  for (const bad of [{}, { title: 3 }, { title: "A title", extra: true }]) {
    inputs.push(bad);
    await assert.rejects(s.run({ op: "invoke" }), { code: "actions.input_invalid" });
  }
  inputs.push({ title: "A title" });
  assert.equal(await s.run({ op: "invoke" }), "checked");
  assert.deepEqual(s.ran, []);
  assert.equal(s.log().some(row => row.capability_id === TYPED.capability_id), false);
  s.probe.behavior.handle = undefined;
  await assert.rejects(s.run({ op: "invoke", reference: ref(TYPED), input: { title: 3 } }), { code: "actions.input_invalid" });
  assert.deepEqual(s.ran, []); assert.equal(s.probe.delivered(), null);
});

test("W5-01-DELEGATE-09 S-43 check refuses what invoke refuses before the target runs: a malformed reference, a target closed to workflow or needing a permission the caller lacks, a call outside a running action, and a withdrawn grant", async t => {
  const s = await setup(t); s.offer([OPEN, NO_WORKFLOW, NEEDS_MORE]);
  const aim: { current: ActionReference } = { current: ref(OPEN) };
  s.probe.behavior.handle = async context => { await context.services!.actions!.directory!.check(aim.current, {}); return "checked"; };
  aim.current = { capability_id: "../x", version: 1 };
  await assert.rejects(s.run({ op: "invoke" }), { code: "actions.reference_invalid" });
  for (const refused of [NO_WORKFLOW, NEEDS_MORE]) {
    aim.current = ref(refused);
    await assert.rejects(s.run({ op: "invoke" }), { code: "actions.dependency_missing" });
  }
  aim.current = ref(OPEN);
  assert.equal(await s.run({ op: "invoke" }), "checked");
  await assert.rejects(s.probe.contexts.at(-1)!.services!.actions!.directory!.check(ref(OPEN), {}), { code: "actions.forbidden" });
  await s.regrant(s.probe, WITHOUT_GRANT);
  await assert.rejects(s.run({ op: "invoke" }), { code: "actions.forbidden" });
  assert.deepEqual(s.ran, []);
});

test("W5-01-DELEGATE-09 S-43 check asks the original caller's own checks of the target, as invoke does: an assistant-shaped caller refusing at its async check and an MCP-shaped caller refusing only at its final check are both refused, and nothing runs", async t => {
  const s = await setup(t); s.offer([OPEN]);
  s.probe.behavior.handle = async context => { await context.services!.actions!.directory!.check(ref(OPEN), {}); return "checked"; };
  // Both callers list the target; what refuses it is each caller's own check, made after the list (the action switched off, the grant withdrawn).
  const listed = [{ capability_id: s.probe.action.capability_id, version: 1 }, ref(OPEN)].map(item => ({ ...item }));
  const off = new Set([OPEN.capability_id]);
  const refuse = (reference: ActionReference | undefined, code: string) => { if (reference && off.has(reference.capability_id)) throw new ActionError(code, "这项能力已关闭或授权已撤销"); };
  const assistant: ActionCallContext = { ...s.caller, actor_id: "assistant:round", audience: "agent", allowed_actions: listed,
    validate_authority: async reference => refuse(reference, "assistant.action_revoked") };
  const mcp: ActionCallContext = { ...s.caller, actor_id: "mcp:client", audience: "mcp", allowed_actions: listed,
    assert_authority_current: reference => refuse(reference, "mcp.action_revoked") };
  await assert.rejects(s.run({ op: "invoke" }, assistant), { code: "assistant.action_revoked" });
  await assert.rejects(s.run({ op: "invoke" }, mcp), { code: "mcp.action_revoked" });
  // invoke gives the same two refusals for the same target.
  s.probe.behavior.handle = undefined;
  await assert.rejects(s.run({ op: "invoke", reference: ref(OPEN) }, assistant), { code: "assistant.action_revoked" });
  await assert.rejects(s.run({ op: "invoke", reference: ref(OPEN) }, mcp), { code: "mcp.action_revoked" });
  assert.deepEqual(s.ran, []); assert.equal(s.probe.delivered(), null);
  // With the target back on, check passes for both and still runs nothing.
  off.clear();
  s.probe.behavior.handle = async context => { await context.services!.actions!.directory!.check(ref(OPEN), {}); return "checked"; };
  assert.equal(await s.run({ op: "invoke" }, assistant), "checked");
  assert.equal(await s.run({ op: "invoke" }, mcp), "checked");
  assert.deepEqual(s.ran, []);
});

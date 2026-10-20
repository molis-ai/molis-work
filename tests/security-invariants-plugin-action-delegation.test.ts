import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionAudience, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
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

interface Directive { op: "discover" | "invoke"; reference?: ActionReference; input?: unknown }

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
  for (const bad of [{ capability_id: "../x", version: 1 }, { capability_id: OPEN.capability_id, version: 0 }, { capability_id: OPEN.capability_id, version: 1, provider_id: "bad id" }]) {
    await assert.rejects(s.run({ op: "invoke", reference: bad }), { code: "actions.reference_invalid" });
  }
  assert.deepEqual(s.ran, []);
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

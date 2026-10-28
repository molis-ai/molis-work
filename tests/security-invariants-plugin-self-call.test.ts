import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { LOCAL_PERSON_ACTOR_ID, type ActionAudience, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { openTestHome } from "./fixtures/test-home.js";

/**
 * S-73 (PG-028): a plugin's call to one of its own actions (`services.actions.invoke`) is made in the audience of the call it is part
 * of, so an Agent's, an MCP client's, a workflow's or another plugin's call does not become the person's by passing through the plugin's
 * own code. Without an outer call it is the installation's own (`plugin`) unless it runs in a route the person's page opened. Every test
 * asserts a refusal or a refused audience: the handler the call would have reached never runs.
 */

const DELEGATE = "actions:delegate";
const ALL: ActionAudience[] = ["user", "agent", "mcp", "workflow", "plugin"];

type Behavior = (context: PluginStartContext, caller: ActionExecutionContext) => Promise<unknown>;
interface StartedProbe {
  readonly actions: { readonly inner: ActionDefinition; readonly userOnly: ActionDefinition };
  readonly started: Array<Promise<unknown>>;
}

/** A Home plugin with an outer action, an inner one open to every audience, and one open to the person alone (the plugin audience reaches what agents reach). */
function selfCallProbe(name: string, options: { consumes?: readonly string[]; delegate?: boolean; atStart?: (context: PluginStartContext, self: StartedProbe) => void } = {}) {
  const id = `io.molis.work.example.${name}`;
  const action = (suffix: string, audiences: ActionAudience[]): ActionDefinition => ({ capability_id: `${name}.${suffix}`, version: 1, operation: "command", action: {
    title: suffix, description: "A self call probe", kind: "operation", scope: "home", scheduling: "concurrent", audiences, permissions: ["storage:private"], subject_kinds: [],
    input_schema: { type: "object" }, output_schema: { type: "string" } } });
  const actions = { outer: action("outer", ALL), inner: action("inner", ALL), userOnly: action("user_only", ["user"]) };
  const contexts: PluginStartContext[] = [], seen: Record<string, ActionExecutionContext[]> = {}, behavior: Record<string, Behavior> = {}, started: Array<Promise<unknown>> = [];
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: `self-call-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: "storage:private", required: true, reason: "Keep what a call returned" },
      ...(options.delegate ? [{ permission: DELEGATE, required: false, reason: "Call other actions as the person who asked" },
        { permission: "self_call:read", required: false, reason: "Hold what the delegated target needs" }] : [])],
    capabilities: { provides: [], consumes: [...(options.consumes ?? [])] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: Object.values(actions),
  }, async start(context) {
    contexts.push(context);
    options.atStart?.(context, { actions, started });
    return { kind: "app", actions: Object.values(actions).map(each => ({ ...each, async handle(caller) {
      (seen[each.capability_id] ??= []).push(caller);
      const suffix = each.capability_id.slice(name.length + 1);
      return behavior[suffix] ? behavior[suffix](context, caller) : "done";
    } })) };
  } };
  return { id, actions, contexts, seen, behavior, started, definition,
    saw: (each: ActionDefinition) => seen[each.capability_id] ?? [],
    ran: (each: ActionDefinition) => (seen[each.capability_id] ?? []).length };
}
type Probe = ReturnType<typeof selfCallProbe>;

const OPEN: ActionDefinition = { capability_id: "self_call.open", version: 1, operation: "command", action: { title: "Open", description: "A target open to every audience", kind: "operation",
  scope: "home", audiences: ["user", "agent", "mcp", "workflow"], permissions: ["self_call:read"], subject_kinds: [], input_schema: { type: "object" }, output_schema: { type: "string" } } };
const ref = (definition: ActionDefinition): ActionReference => ({ capability_id: definition.capability_id, version: definition.version });

async function setup(t: TestContext, probes: readonly Probe[], delegating: readonly Probe[] = []) {
  const served = await openTestHome(t, { catalogPolicy: false, host: { pluginFixtures: { home: probes.map(probe => probe.definition) } } });
  const project = await served.createProject("Self call", []);
  const platform = await served.host.homePlugins!.ready();
  for (const probe of delegating) {
    const install = served.host.homePlugins!.installation(probe.id)!;
    await platform.runtime.stop(install.install_id); platform.runtime.grant(install.install_id, ["storage:private", DELEGATE, "self_call:read"]); await platform.supervisor.restart(probe.id);
  }
  const client = served.host.actionClient(project.reference), targetRan: string[] = [];
  const dispose = served.host.actionRegistry().registerProvider({ provider: { provider_id: "self-call-targets", title: "Self call targets", kind: "system" }, definitions: [OPEN],
    handlers: [{ ...OPEN, handle: async () => { targetRan.push(OPEN.capability_id); return "done"; } }] });
  t.after(dispose);
  const caller = (audience: ActionAudience): ActionCallContext => ({ actor_id: audience === "user" ? LOCAL_PERSON_ACTOR_ID : `runtime:${audience}`, audience, project_id: project.project_id,
    permissions: ["storage:private", "self_call:read"] });
  return { ...served, project, platform, client, targetRan, caller, run: (probe: Probe, definition: ActionDefinition, audience: ActionAudience) => client.invoke(caller(audience), definition, {}) };
}

for (const audience of ["user", "agent", "mcp", "workflow"] as const) {
  test(`RAC-584 S-73 the plugin's call to its own action keeps the audience of the call it is part of (${audience})`, async t => {
    const probe = selfCallProbe("keeps");
    const s = await setup(t, [probe]);
    probe.behavior.outer = (context, caller) => context.services!.actions!.invoke(probe.actions.inner, {}, caller) as Promise<unknown>;
    assert.equal(await s.run(probe, probe.actions.outer, audience), "done");
    const inner = probe.saw(probe.actions.inner).at(-1)!;
    assert.equal(inner.audience, audience);
    assert.equal(inner.actor_id, s.caller(audience).actor_id);
    // What the person could always do from their own page is unchanged: the nested call is the plugin's own actions and nothing else.
    assert.deepEqual(inner.allowed_actions?.map(item => item.capability_id).sort(), Object.values(probe.actions).map(item => item.capability_id).sort());
  });
}

test("RAC-584 S-73 an Agent's, an MCP client's or a workflow's call cannot reach, through the plugin's own code, an action offered to the person alone", async t => {
  const probe = selfCallProbe("userlock");
  const s = await setup(t, [probe]);
  probe.behavior.outer = (context, caller) => context.services!.actions!.invoke(probe.actions.userOnly, {}, caller) as Promise<unknown>;
  for (const audience of ["agent", "mcp", "workflow"] as const) {
    await assert.rejects(s.run(probe, probe.actions.outer, audience), { code: "actions.forbidden" }, audience);
    assert.equal(probe.ran(probe.actions.userOnly), 0, `${audience}: the person-only action never ran`);
  }
  // The person's own call goes through it, which is the refusal's only difference.
  assert.equal(await s.run(probe, probe.actions.outer, "user"), "done");
  assert.equal(probe.ran(probe.actions.userOnly), 1);
});

test("RAC-585 S-73 a call another plugin made (plugin audience) stays plugin through the callee's own action, which then reaches through the action directory only what the calling plugin could", async t => {
  const callee = selfCallProbe("callee", { delegate: true }), caller = selfCallProbe("calleruser", { consumes: ["callee.outer"] });
  const s = await setup(t, [callee, caller], [callee]);
  callee.behavior.outer = (context, execution) => context.services!.actions!.invoke(callee.actions.inner, {}, execution) as Promise<unknown>;
  callee.behavior.inner = (context) => context.services!.actions!.directory!.invoke(ref(OPEN), {});
  caller.behavior.outer = (context, execution) => context.services!.actions!.invoke(callee.actions.outer, {}, execution) as Promise<unknown>;
  // The directory keeps that call the calling plugin's own (user decision 2026-10-26, S-43): the target is not among the actions its Manifest consumes.
  await assert.rejects(s.run(caller, caller.actions.outer, "user"), { code: "actions.dependency_missing" });
  const inner = callee.saw(callee.actions.inner).at(-1)!;
  assert.equal(inner.audience, "plugin", "the person's call went through another plugin: what that plugin called is not the person's");
  assert.deepEqual(s.targetRan, [], "the directory's target never ran");
  // The directory works for the person's own call of the plugin's action: the calling plugin's reach is what the refusal above rests on.
  callee.behavior.outer = (context) => context.services!.actions!.directory!.invoke(ref(OPEN), {});
  assert.equal(await s.run(callee, callee.actions.outer, "user"), "done");
  assert.deepEqual(s.targetRan, [OPEN.capability_id]);
});

test("RAC-586 S-73 a call made in a timer set up in start is the installation's own (plugin), and an action only the person is offered is refused without running", async t => {
  const settled: Array<{ call: string; outcome: "done" | string }> = [];
  const timer = Promise.withResolvers<void>();
  const probe = selfCallProbe("startup", { atStart: (context, self) => {
    const note = (call: string) => (promise: Promise<unknown>) => promise.then(() => settled.push({ call, outcome: "done" }), (error: { code?: string }) => settled.push({ call, outcome: error.code ?? "error" }));
    // In `start` itself the plugin's actions are not registered yet; what is asked there is the installation's own call all the same.
    self.started.push(note("start user_only")(context.services!.actions!.invoke(self.actions.userOnly, {})));
    setTimeout(() => {
      void Promise.all([note("timer inner")(context.services!.actions!.invoke(self.actions.inner, {})), note("timer user_only")(context.services!.actions!.invoke(self.actions.userOnly, {}))])
        .then(() => timer.resolve(), error => timer.reject(error));
    }, 20);
  } });
  await setup(t, [probe]);
  await timer.promise;
  await Promise.allSettled(probe.started);
  const outcome = (call: string) => settled.filter(entry => entry.call === call).map(entry => entry.outcome);
  assert.ok(outcome("timer inner").includes("done"), JSON.stringify(settled));
  for (const call of ["start user_only", "timer user_only"]) assert.ok(outcome(call).length > 0 && outcome(call).every(each => each !== "done"), `${call}: ${JSON.stringify(settled)}`);
  assert.equal(outcome("timer user_only").at(-1), "actions.forbidden");
  assert.ok(probe.saw(probe.actions.inner).length > 0 && probe.saw(probe.actions.inner).every(caller => caller.audience === "plugin"));
  assert.equal(probe.ran(probe.actions.userOnly), 0, "an action only the person is offered never ran for the installation's own call");
});

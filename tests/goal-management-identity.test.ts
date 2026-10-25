import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { MolisWorkServer, withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import * as goalsPlugin from "@molis-ai/molis-work-plugin-goals";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { newCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { goalPluginActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionMetadata, type ActionReference, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityCallOptions, HostCapabilityDefinition, HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import { managementCaller, managementGoals } from "./goal-management-caller.js";
import { createPluginCapabilityClient } from "@molis-ai/molis-work-plugin-runtime";
import { filesManifest } from "@molis-ai/molis-work-plugin-files";
import { callAs, callerPlugin, issuedCaller, registerProbe, startProjectPlugins } from "./fixtures/plugin-callers.js";
import { goalApplicationOf } from "./fixtures/goal-application.js";

/**
 * The ten writes that used to have a typed management door of their own. They are registered actions now, and a management caller
 * (the CLI, the management MCP) calls them like any other caller: the person on this machine is the writer. Each is shown with
 * the business fields it needs; the identity is looked at on top of them.
 */
type FormerDoor = { name: string; definition: ActionReference & { readonly action: ActionMetadata };
  call(client: BoundActionClient, input: object): Promise<unknown>; business: Record<string, unknown> };
const formerDoors = (goal_id: string, cursor: number): FormerDoor[] => [
  { name: "configure", definition: goalsActions.configure, call: (client, input) => client.invoke(goalsActions.configure, input as never), business: { goal_id, expected_version: 0, types: [] } },
  { name: "report", definition: goalsActions.report, call: (client, input) => client.invoke(goalsActions.report, input as never), business: { goal_id, events: [] } },
  { name: "progress", definition: goalsActions.progress, call: (client, input) => client.invoke(goalsActions.progress, input as never), business: { goal_id, based_on_cursor: cursor, summary: "进展" } },
  { name: "concern", definition: goalsActions.concern, call: (client, input) => client.invoke(goalsActions.concern, input as never), business: { goal_id, action: "open", title: "问题" } },
  { name: "request decision", definition: goalsActions.requestDecision, call: (client, input) => client.invoke(goalsActions.requestDecision, input as never), business: { goal_id, question: "是否继续？" } },
  { name: "cite decision", definition: goalsActions.citeDecision, call: (client, input) => client.invoke(goalsActions.citeDecision, input as never), business: { goal_id, decision_id: "d" } },
  { name: "agreement", definition: goalsActions.agree, call: (client, input) => client.invoke(goalsActions.agree, input as never), business: { goal_id } },
  { name: "closure", definition: goalsActions.close, call: (client, input) => client.invoke(goalsActions.close, input as never), business: { goal_id, kind: "complete", reason: "收尾" } },
  { name: "resume", definition: goalsActions.resume, call: (client, input) => client.invoke(goalsActions.resume, input as never), business: { goal_id, reason: "继续" } },
  { name: "note", definition: goalsActions.note, call: (client, input) => client.invoke(goalsActions.note, input as never), business: { goal_id, body: "便笺" } },
];

/**
 * The CLI and the management MCP are the management door. They have no caller identity of their own, so they record the person on
 * this machine and refuse an actor_id or actor_kind carried in the arguments instead of trusting it (specs/goal-closure-identity).
 * Goals management writes are actions; only Coding's four typed protocols remain. The action caller supplies the project and identity,
 * so a foreign project stays a scope mismatch and an input cannot supply the writer.
 */
test("every management write records the person on this machine and refuses an identity in its arguments", async () => {
  const home = await mkdtemp(join(tmpdir(), "goal-management-identity-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Identity", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const typed = host.client(ref), actions = host.actionClient(ref), project_id = project.project_id, goal_id = "IDENTITY-GOAL";
  const management = managementGoals(actions, project_id);
  const cursor = async () => (await management.invoke(goalsActions.state, { goal_id })).goal_event_cursor;
  const event = (eventId: string) => host.withProject(ref, runtime => goalApplicationOf(runtime).goalEvents.readEvent(project_id, goal_id, eventId));
  try {
    const intent = { goal_id, title: "管理入口", outcome: "记在本机这个人身上", idempotency_key: "create" };
    assert.equal((await management.invoke(goalsActions.create, intent)).replayed, false);
    assert.equal((await management.invoke(goalsActions.create, intent)).replayed, true, "the same key replays for the same person");
    const before = await cursor();

    for (const [definition, business] of [[goalsActions.create, { title: "目标" }], [goalsActions.decide, { goal_id, conclusion: "可以" }]] as const) {
      for (const identity of [{ actor_id: "someone-else" }, { actor_kind: "runtime" }, { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user" }]) {
        await assert.rejects(actions.invoke({ ...managementCaller(project_id), permissions: ["goals:read", "goals:write", "goals:decide", "attention:write"] }, definition, { ...business, idempotency_key: "refused", ...identity } as never),
          { code: "actions.input_invalid" });
      }
      await assert.rejects(actions.invoke(managementCaller("foreign"), definition, { ...business, idempotency_key: "foreign", actor_id: "someone-else" } as never),
        { code: "actions.scope_mismatch" }, "the caller's project is checked before its input");
    }
    // The ten writes that are actions now: the input is closed and names neither who writes nor which project (both come from the
    // management caller's context), an identity in it is refused, and a context for a foreign project is a scope mismatch.
    for (const { name, definition, call, business } of formerDoors(goal_id, before)) {
      const schema = definition.action.input_schema as { additionalProperties?: boolean; properties?: Record<string, unknown> };
      assert.equal(schema.additionalProperties, false, `${name}: the input is closed`);
      assert.deepEqual(["actor_id", "actor_kind", "project_id"].filter(field => field in (schema.properties ?? {})), [], `${name}: its input does not name who writes`);
      for (const identity of [{ actor_id: "someone-else" }, { actor_kind: "runtime" }, { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user" }]) {
        await assert.rejects(call(management, { idempotency_key: `refused-${name}`, ...business, ...identity }),
          { code: "actions.input_invalid" }, `${name} refuses ${Object.keys(identity).join(" and ")}`);
      }
      await assert.rejects(actions.invoke(managementCaller("foreign", `foreign-${name}`), definition, { ...business, idempotency_key: `foreign-${name}` }),
        { code: "actions.scope_mismatch" }, `${name}: a foreign project is a scope mismatch`);
    }
    const forgedActive = { goal_id, reason: "当前", idempotency_key: "refused-active", actor_id: "someone-else" };
    await assert.rejects(management.invoke(goalsActions.active, forgedActive as never), { code: "actions.input_invalid" });
    await assert.rejects(actions.invoke(managementCaller("foreign"), goalsActions.active, forgedActive as never), { code: "actions.scope_mismatch" });
    const forgedCheck = { proposal_id: "p", idempotency_key: "refused-check", actor_id: "someone-else" };
    await assert.rejects(management.invoke(goalsActions.treeCheck, forgedCheck as never), { code: "actions.input_invalid" });
    await assert.rejects(actions.invoke(managementCaller("foreign"), goalsActions.treeCheck, forgedCheck as never), { code: "actions.scope_mismatch" });
    // The progress capability Coding uses has no project in its input; the typed Host client is the management door there too.
    for (const identity of [{ actor_id: "someone-else" }, { actor_kind: "runtime" }]) {
      await assert.rejects(management.invoke(goalPluginActions.progress, { goal_id, based_on_cursor: before, summary: "进展", idempotency_key: "refused-record", ...identity } as never),
        { code: "actions.input_invalid" });
    }
    assert.equal(await cursor(), before, "a refused call writes nothing");

    // Without an identity the writer is the person on this machine, and the same key replays for that person.
    const note = { goal_id, body: "便笺", idempotency_key: "note" };
    const noted = await management.invoke(goalsActions.note, note);
    assert.equal(noted.recorded, true);
    const written = await event(noted.event_id);
    assert.equal(written.actor_id, LOCAL_PERSON_ACTOR_ID);
    assert.equal(written.actor_kind, "user");
    assert.equal((await management.invoke(goalsActions.note, note)).replayed, true);
    const progress = { goal_id, based_on_cursor: await cursor(), summary: "进展", idempotency_key: "progress" };
    assert.equal((await management.invoke(goalsActions.progress, progress)).progress_summary.actor_id, LOCAL_PERSON_ACTOR_ID);
    const record = { goal_id, based_on_cursor: await cursor(), summary: "再一条进展", idempotency_key: "record" };
    const recorded = await management.invoke(goalPluginActions.progress, record);
    assert.equal(recorded.progress_summary.actor_id, LOCAL_PERSON_ACTOR_ID);
    assert.equal((await management.invoke(goalPluginActions.progress, record)).replayed, true);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

// W3-07-5-01: fixed protocol literals, independent of the removed exports, all at version 1.
const RETIRED_GOALS_ENTRIES = [
  ["io.molis.work.local-host.board.initialize", "command"], ["io.molis.work.local-host.board.snapshot", "query"],
  ["io.molis.work.goals.events.create-intent", "command"], ["io.molis.work.goals.events.decide", "command"],
  ["io.molis.work.goals.submit-goal-tree-proposal", "command"], ["io.molis.work.goals.list-goal-tree-proposals", "query"],
  ["io.molis.work.goals.check-goal-tree-proposal", "command"], ["io.molis.work.goals.decide-goal-tree-proposal", "command"],
  ["io.molis.work.local-host.project.guidance", "query"], ["io.molis.work.local-host.goals.set-active", "command"],
  ["goals.context.list.v1", "query"], ["goals.context.read.v1", "query"],
  ["goals.progress.record.v1", "command"], ["goals.progress.receipt.v1", "query"],
] as const;

test("W3-07-5-01 / W3-07-8-02: all fourteen retired Goals literals refuse Host and SDK callers, including an unflagged descriptor", async () => {
  const home = await mkdtemp(join(tmpdir(), "goal-management-plugin-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Plugin", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const writer = callerPlugin("goalwriter", "project", { "goals:read": true, "goals:write": true });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: [writer.definition] } });
  const typed = host.client(ref), project_id = project.project_id, goal_id = "PLUGIN-GOAL";
  const management = managementGoals(host.actionClient(ref), project_id);
  const event = (eventId: string) => host.withProject(ref, runtime => goalApplicationOf(runtime).goalEvents.readEvent(project_id, goal_id, eventId));
  try {
    await host.withProject(ref, () => undefined);
    // The caller the Host issued the writer plugin's session; a plugin's call presents it, and only it.
    const probe = registerProbe(host.actionRegistry(ref), "project");
    await startProjectPlugins(host, ref);
    const issued = await issuedCaller(probe, writer, project_id);
    const asPlugin: HostCapabilityCallOptions = { consumer: "plugin", before_effect: async () => {}, plugin_caller: issued };
    const forged: HostPluginCaller = { ...issued, assertActive: () => {} };
    await management.invoke(goalsActions.create, { goal_id, title: "插件", outcome: "不能冒充本机这个人", idempotency_key: "create" });
    const before = await management.invoke(goalsActions.snapshot, {});
    const descriptors = RETIRED_GOALS_ENTRIES.map(([capability_id, operation]) => ({ capability_id, version: 1, operation }) as HostCapabilityDefinition<unknown, unknown>);
    const sdk = createPluginCapabilityClient({ ...filesManifest, plugin_id: "io.molis.work.test.goal-writer",
      capabilities: { provides: [], consumes: descriptors.map(entry => entry.capability_id) } }, typed);
    for (const descriptor of descriptors) {
      for (const availability of [typed.availability(descriptor), sdk.availability(descriptor)]) {
        assert.equal(availability.available, false, descriptor.capability_id);
        assert.equal(!availability.available && availability.code, "actions.dependency_missing", descriptor.capability_id);
      }
      const input = { project_id, title: "不可复活", goal_id: "PLUGIN-SECOND", idempotency_key: "retired" };
      const callId = newCallId();
      await withCallId(callId, () => assert.rejects(typed.invoke(descriptor, input), { code: "actions.dependency_missing" }, descriptor.capability_id));
      const rows = host.callLog!.find(callId);
      assert.equal(rows.length, 1, "the refused call has one findable diagnostic row");
      assert.deepEqual([rows[0]!.code, rows[0]!.refused, rows[0]!.path, rows[0]!.message], ["actions.dependency_missing", true, "typed", undefined]);
      await assert.rejects(sdk.invoke(descriptor, input), { code: "actions.dependency_missing" }, descriptor.capability_id);
      await assert.rejects(typed.invoke(descriptor, input, asPlugin), { code: "actions.dependency_missing" }, descriptor.capability_id);
    }
    assert.deepEqual(await management.invoke(goalsActions.snapshot, {}), before, "retired entries write no Goal, active selection or proposal");
    assert.deepEqual(Object.values(goalsPlugin).filter(value => value && typeof value === "object" && "capability_id" in value
      && RETIRED_GOALS_ENTRIES.some(([id]) => id === value.capability_id)), [], "the package exports no retired descriptor");
    const second = () => host.withProject(ref, runtime => goalApplicationOf(runtime).goalQueries.getGoal(project_id, "PLUGIN-SECOND"));
    await assert.rejects(second(), { code: "goals.not_found" }, "the retired create entry left no record");

    // Reversible create/note record the plugin's actual caller, the person its session runs for; an identity in the input is refused.
    const pluginCaller = callAs(issued, ["goals:read", "goals:write"]);
    await host.actionClient(ref).invoke(pluginCaller, goalsActions.create,
      { goal_id: "PLUGIN-SECOND", title: "再一个", idempotency_key: "plugin-intent" });
    assert.equal((await second()).goal_id, "PLUGIN-SECOND");
    const pluginCreated = await management.invoke(goalsActions.events, { goal_id: "PLUGIN-SECOND" });
    assert.equal(pluginCreated.events[0]!.actor_id, issued.actor_id, "reversible create records the real caller");
    await assert.rejects(host.actionClient(ref).invoke(pluginCaller, goalsActions.note,
      { goal_id, body: "伪造写作者", idempotency_key: "forged-plugin-note", actor_id: LOCAL_PERSON_ACTOR_ID } as never), { code: "actions.input_invalid" });
    const pluginNote = await host.actionClient(ref).invoke(pluginCaller, goalsActions.note, { goal_id, body: "插件写的便笺", idempotency_key: "plugin-note" });
    assert.equal((await event(pluginNote.event_id)).actor_id, issued.actor_id);
    const noted = await management.invoke(goalsActions.note, { goal_id, body: "本机这个人写的便笺", idempotency_key: "note" });
    assert.equal((await event(noted.event_id)).actor_id, LOCAL_PERSON_ACTOR_ID);
    const cursor = (await management.invoke(goalsActions.state, { goal_id })).goal_event_cursor;
    await assert.rejects(host.actionClient(ref).invoke({ ...pluginCaller, host_plugin: forged },
      goalPluginActions.progress, { goal_id, based_on_cursor: cursor, summary: "伪造的插件身份", idempotency_key: "plugin-progress" }), { code: "host.plugin_caller_invalid" });
    assert.equal((await management.invoke(goalsActions.state, { goal_id })).goal_event_cursor, cursor);
    // PG-006: the progress record is not kept for a list of builtin plugins; a plugin that holds goals:write records it as itself.
    const recorded = await host.actionClient(ref).invoke(pluginCaller, goalPluginActions.progress, { goal_id, based_on_cursor: cursor, summary: "插件记下的进展", idempotency_key: "plugin-progress" });
    assert.equal(recorded.progress_summary.actor_id, issued.actor_id);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

/**
 * A project on a fresh Home, with the callers the approval rule is tried through: the management MCP, the person's Web
 * action client and a runtime's. `supported` makes a Goal whose one requirement the work already supports, so the project's approval
 * rule is the only thing left to satisfy.
 */
async function approvalProject(name: string) {
  const home = await mkdtemp(join(tmpdir(), `goal-management-${name}-`));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: name, actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const project_id = project.project_id, management = managementGoals(host.actionClient(ref), project_id);
  const mcp = new MolisWorkServer("management", null, null, host);
  const runtime = bindActionClient(host.actionClient(ref), () => ({ actor_id: "runtime:closer", audit_actor_id: "runtime:closer:session",
    actor_kind: "runtime", audience: "agent", project_id, permissions: ["goals:read", "goals:write", "attention:write"] }));
  const web = bindActionClient(host.actionClient(ref), () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user", project_id,
    permissions: ["goals:read", "goals:write", "goals:decide", "attention:write"], user_action: { source: "web", conversation_ref: "web:approval", message_ref: "web:click" } }));
  const requirement = (goal_id: string) => `${goal_id}-requirement`;
  const supported = async (goal_id: string, { human = false } = {}) => {
    await runtime.invoke(goalsActions.create, { goal_id, title: "需要点头", outcome: "结果可以检查", idempotency_key: `create-${goal_id}`,
      requirements: [{ requirement_id: requirement(goal_id), statement: "结果可以检查", ...(human ? { human_decision_required: true } : {}) }] });
    await runtime.invoke(goalsActions.configure, { goal_id, expected_version: 0, idempotency_key: `configure-${goal_id}`,
      types: [{ type_id: "work", version: 1, name: "交付", purpose: "保留事实",
        fields: [{ field_id: "body", name: "正文", purpose: "原文", format: "longtext", required: true }] }],
      requirement_bindings: [{ type_id: "work", requirement_id: requirement(goal_id) }] });
    await runtime.invoke(goalsActions.report, { goal_id, idempotency_key: `report-${goal_id}`,
      events: [{ type_id: "work", type_version: 1, title: "交付", fields: { body: "已交付" },
        judgments: [{ requirement_id: requirement(goal_id), verdict: "supports" }] }] });
  };
  const closeInput = async (goal_id: string, idempotency_key: string) => {
    const state = await runtime.invoke(goalsActions.state, { goal_id });
    return { goal_id, kind: "complete" as const, result: "结果可以检查", reason: "试着完成", idempotency_key,
      expected_config_version: state.config.version, expected_agreement_version: state.agreement.version };
  };
  return { host, ref, mcp, management, project_id, runtime, web, requirement, supported, closeInput,
    done: async () => { await mcp.close(); await host.close(); await rm(home, { recursive: true, force: true }); } };
}

/**
 * The management door records its closes as the person on this machine, a user. Under the project rule 「完成前必须你点头」 that is
 * still not the approval (specs/goal-closure-identity): neither is the Web's complete button or a runtime's close. What releases the
 * rule is a trusted user conclusion, and the door can record one as the person too.
 */
test("under the project approval rule a close from the management door, the Web or a runtime is not the approval", async () => {
  const { host, ref, mcp, management, project_id, runtime, web, requirement, supported, closeInput, done } = await approvalProject("approval");
  const closers = {
    runtime: async (goal_id: string, key: string) => runtime.invoke(goalsActions.close, await closeInput(goal_id, key)),
    web: async (goal_id: string, key: string) => web.invoke(goalsActions.close, await closeInput(goal_id, key)),
    management: async (goal_id: string, key: string) => management.invoke(goalsActions.close, await closeInput(goal_id, key)),
  };
  const APPROVAL_REQUIRED = "goals.event_closure.human_approval_required";
  try {
    // Without the rule the management door completes a supported Goal, so a refusal below is the rule's and not the door's.
    await supported("CONTROL");
    assert.equal((await closers.management("CONTROL", "close-control")).completion_applied, true);

    await web.invoke(goalsActions.policySave, { policy: { human_approval: true }, user_confirmed: true, idempotency_key: "policy" });
    await supported("DECIDED");
    for (const [name, close] of Object.entries(closers)) {
      const held = await close("DECIDED", `close-${name}`);
      assert.equal(held.completion_applied, false, `${name} clicking complete is not the approval`);
      assert.deepEqual(held.unmet_reasons.map(reason => reason.code), [APPROVAL_REQUIRED], name);
      if (name === "management") {
        // What makes the case worth pinning: the held close is recorded as the person on this machine, a user.
        const recorded = await host.withProject(ref, open => goalApplicationOf(open).goalEvents.readEvent(project_id, "DECIDED", held.event_id));
        assert.deepEqual([recorded.actor_id, recorded.actor_kind], [LOCAL_PERSON_ACTOR_ID, "user"]);
      }
    }
    // A decision from the person that authorizes complete releases it, for the same door that was held back before. The door sends no
    // authority: the Host decides as the person on this machine.
    await mcp.callTool("molis_work_v1_event_decide", { database_path: ref.storage_key, project_id, goal_id: "DECIDED", idempotency_key: "allow", conclusion: "可以完成",
      effects: [{ kind: "authorize_action", action: "complete" }], scope: { action: "complete" } });
    assert.equal((await closers.management("DECIDED", "close-management-after")).completion_applied, true);

    // An accepted conclusion on the requirement releases it as well, with no decision about completing at all.
    await supported("ACCEPTED");
    assert.deepEqual((await closers.runtime("ACCEPTED", "close-before")).unmet_reasons.map(reason => reason.code), [APPROVAL_REQUIRED]);
    await web.invoke(goalsActions.decide, { goal_id: "ACCEPTED", idempotency_key: "accept", conclusion: "接受这条要求",
      accepts_requirements: true, scope: { requirement_ids: [requirement("ACCEPTED")] } });
    assert.equal((await closers.runtime("ACCEPTED", "close-after")).completion_applied, true);
  } finally { await done(); }
});

/**
 * One decision can accept a requirement and authorize completing, which is what the decision form records when the person ticks both
 * (specs/goal-closure-identity). It is an authorization, so it is limited like one, to the agreement it was given for and the round it
 * was given in, though the accepted conclusion it leaves on the requirement outlives both.
 */
test("under the project approval rule a decision from the Web that accepts a requirement and authorizes complete ends with the round and with the agreement", async () => {
  const { runtime, web, requirement, supported, closeInput, done } = await approvalProject("accepting");
  const APPROVAL_REQUIRED = "goals.event_closure.human_approval_required";
  const approve = (goal_id: string, idempotency_key: string, requirement_ids: string[]) => web.invoke(goalsActions.decide, { goal_id, idempotency_key,
    conclusion: "这些要求通过，可以完成", accepts_requirements: true, scope: { action: "complete", requirement_ids } });
  const closeNow = async (goal_id: string, key: string) => runtime.invoke(goalsActions.close, await closeInput(goal_id, key));
  const reportAgain = (goal_id: string, requirement_id: string, idempotency_key: string) => runtime.invoke(goalsActions.report, { goal_id, idempotency_key,
    events: [{ type_id: "work", type_version: 1, title: "交付", fields: { body: "又交付了" }, judgments: [{ requirement_id, verdict: "supports" }] }] });
  const held = async (goal_id: string, key: string, what: string) => {
    const closure = await closeNow(goal_id, key);
    assert.equal(closure.completion_applied, false, what);
    assert.deepEqual(closure.unmet_reasons.map(reason => reason.code), [APPROVAL_REQUIRED], what);
  };
  try {
    await web.invoke(goalsActions.policySave, { policy: { human_approval: true }, user_confirmed: true, idempotency_key: "policy" });

    // The round: completed, resumed and supported again, with the requirement still accepted. The person approves again.
    await supported("ROUND");
    const approval = await approve("ROUND", "approve-round", [requirement("ROUND")]);
    assert.deepEqual(approval.decision.effects, [{ kind: "accept_requirements" }, { kind: "authorize_action", action: "complete" }]);
    assert.equal((await closeNow("ROUND", "close-round-1")).completion_applied, true);
    await runtime.invoke(goalsActions.resume, { goal_id: "ROUND", idempotency_key: "resume-round", reason: "还要再做一轮" });
    await reportAgain("ROUND", requirement("ROUND"), "report-round-2");
    await held("ROUND", "close-round-2", "resumed, earlier approval that also accepted the requirement");
    await approve("ROUND", "approve-round-again", [requirement("ROUND")]);
    assert.equal((await closeNow("ROUND", "close-round-3")).completion_applied, true);

    // The agreement: the runtime adds a requirement without citing anything and the work supports it. The person approves again.
    await supported("AGREEMENT");
    await approve("AGREEMENT", "approve-agreement", [requirement("AGREEMENT")]);
    const state = await runtime.invoke(goalsActions.state, { goal_id: "AGREEMENT" });
    await runtime.invoke(goalsActions.agree, { goal_id: "AGREEMENT", idempotency_key: "add-agreement", expected_config_version: state.config.version,
      expected_agreement_version: state.agreement.version, new_requirements: [{ requirement_id: "AGREEMENT-new", statement: "新加的要求", bound_type_id: "work" }] });
    await reportAgain("AGREEMENT", "AGREEMENT-new", "report-agreement-new");
    await held("AGREEMENT", "close-agreement-1", "requirement added, earlier approval that also accepted a requirement");
    await approve("AGREEMENT", "approve-agreement-again", [requirement("AGREEMENT"), "AGREEMENT-new"]);
    assert.equal((await closeNow("AGREEMENT", "close-agreement-2")).completion_applied, true);
  } finally { await done(); }
});

/**
 * A plain acceptance of a requirement, the answer the protocol has a runtime ask for, is a nod of the same kind as an authorization
 * to complete (specs/goal-closure-identity, the second decision of 2026-10-09): the rule counts it for the agreement it was given for
 * and the round it was given in. The three flows are the ones the review reproduced, on a real Host with the Web's decision button.
 */
test("under the project approval rule a plain acceptance of a requirement from the Web ends with the round and with the agreement", async () => {
  const { runtime, web, requirement, supported, closeInput, done } = await approvalProject("accepted");
  const APPROVAL_REQUIRED = "goals.event_closure.human_approval_required";
  const accept = (goal_id: string, idempotency_key: string, requirement_ids: string[]) => web.invoke(goalsActions.decide, { goal_id, idempotency_key,
    conclusion: "接受这些要求", accepts_requirements: true, scope: { requirement_ids } });
  const authorize = (goal_id: string, idempotency_key: string) => web.invoke(goalsActions.decide, { goal_id, idempotency_key,
    conclusion: "可以完成", effects: [{ kind: "authorize_action", action: "complete" }], scope: { action: "complete" } });
  const closeNow = async (goal_id: string, key: string) => runtime.invoke(goalsActions.close, await closeInput(goal_id, key));
  const reportAgain = (goal_id: string, requirement_id: string, idempotency_key: string) => runtime.invoke(goalsActions.report, { goal_id, idempotency_key,
    events: [{ type_id: "work", type_version: 1, title: "交付", fields: { body: "又交付了" }, judgments: [{ requirement_id, verdict: "supports" }] }] });
  const heldFor = async (goal_id: string, key: string, reasons: string[], what: string) => {
    const closure = await closeNow(goal_id, key);
    assert.equal(closure.completion_applied, false, what);
    assert.deepEqual(closure.unmet_reasons.map(reason => reason.code), reasons, what);
  };
  const verdictOn = async (goal_id: string) => (await runtime.invoke(goalsActions.state, { goal_id })).requirements
    .find(item => item.requirement_id === requirement(goal_id))?.user_conclusion?.verdict;
  try {
    await web.invoke(goalsActions.policySave, { policy: { human_approval: true }, user_confirmed: true, idempotency_key: "policy" });

    // The round: completed, resumed and supported again, with the requirement still accepted. The person accepts again.
    await supported("ROUND");
    const acceptance = await accept("ROUND", "accept-round", [requirement("ROUND")]);
    assert.deepEqual(acceptance.decision.effects, [{ kind: "accept_requirements" }], "the Web stores only the acceptance");
    assert.equal(acceptance.decision.scope.action, null);
    assert.equal((await closeNow("ROUND", "close-round-1")).completion_applied, true);
    await runtime.invoke(goalsActions.resume, { goal_id: "ROUND", idempotency_key: "resume-round", reason: "还要再做一轮" });
    await reportAgain("ROUND", requirement("ROUND"), "report-round-2");
    assert.equal(await verdictOn("ROUND"), "accepted", "the requirement is still accepted");
    await heldFor("ROUND", "close-round-2", [APPROVAL_REQUIRED], "resumed, earlier acceptance");
    await accept("ROUND", "accept-round-again", [requirement("ROUND")]);
    assert.equal((await closeNow("ROUND", "close-round-3")).completion_applied, true);

    // The agreement: the runtime adds a requirement without citing anything and the work supports it. The person accepts again.
    await supported("AGREEMENT");
    await accept("AGREEMENT", "accept-agreement", [requirement("AGREEMENT")]);
    const state = await runtime.invoke(goalsActions.state, { goal_id: "AGREEMENT" });
    await runtime.invoke(goalsActions.agree, { goal_id: "AGREEMENT", idempotency_key: "add-agreement", expected_config_version: state.config.version,
      expected_agreement_version: state.agreement.version, new_requirements: [{ requirement_id: "AGREEMENT-new", statement: "新加的要求", bound_type_id: "work" }] });
    await reportAgain("AGREEMENT", "AGREEMENT-new", "report-agreement-new");
    assert.equal(await verdictOn("AGREEMENT"), "accepted", "the requirement is still accepted");
    await heldFor("AGREEMENT", "close-agreement-1", [APPROVAL_REQUIRED], "requirement added, earlier acceptance");
    await accept("AGREEMENT", "accept-agreement-again", [requirement("AGREEMENT")]);
    assert.equal((await closeNow("AGREEMENT", "close-agreement-2")).completion_applied, true);

    // A requirement that needs the person's acceptance. The authorization is the nod the rule asks for, but the requirement still
    // needs its own acceptance, and accepting it is both. Resumed with nothing new, it stays accepted, and the rule asks again.
    await supported("HUMAN", { human: true });
    await authorize("HUMAN", "authorize-human");
    await heldFor("HUMAN", "close-human-1", ["goals.event_closure.human_decision_required"], "authorized, the requirement not accepted");
    await accept("HUMAN", "accept-human", [requirement("HUMAN")]);
    assert.equal((await closeNow("HUMAN", "close-human-2")).completion_applied, true);
    await runtime.invoke(goalsActions.resume, { goal_id: "HUMAN", idempotency_key: "resume-human", reason: "还要再做一轮" });
    await reportAgain("HUMAN", requirement("HUMAN"), "report-human-2");
    assert.equal(await verdictOn("HUMAN"), "accepted", "the requirement stays accepted");
    await heldFor("HUMAN", "close-human-3", [APPROVAL_REQUIRED], "resumed, the acceptance and the authorization of the round before");
    await authorize("HUMAN", "authorize-human-again");
    assert.equal((await closeNow("HUMAN", "close-human-4")).completion_applied, true);
  } finally { await done(); }
});

/** Type errors a small caller gets from the built declarations. The test runner strips types, so the types are checked here. */
function typeErrors(source: string): string[] {
  const file = fileURLToPath(new URL("./goal-management-types.virtual.ts", import.meta.url));
  const options: ts.CompilerOptions = { noEmit: true, strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: ["node"],
    typeRoots: [fileURLToPath(new URL("../node_modules/@types", import.meta.url))] };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, ...rest) => name === file ? ts.createSourceFile(file, source, rest[0], true) : read(name, ...rest);
  return ts.getPreEmitDiagnostics(ts.createProgram([file], options, host))
    .filter(diagnostic => !diagnostic.file || diagnostic.file.fileName === file)
    .map(diagnostic => `line ${diagnostic.file ? ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start ?? 0).line + 1 : 0}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`);
}

const FREE_OF_IDENTITY = `
type Identity = "actor_id" | "actor_kind";
type KeysOf<Input> = Input extends readonly [infer First, ...unknown[]] ? keyof First : keyof Input;
type Free<Input> = [Extract<KeysOf<Input>, Identity>] extends [never] ? true : false;`;

/**
 * The host refuses an actor_id or actor_kind in these entries' arguments, so a caller that follows the types must not be asked for
 * one. `GoalTreeProposalCheckInput` is the domain input and still names the actor, which the action handler derives from its trusted context.
 */
test("the management actions are typed without an identity, so a caller that follows the types is not refused", { timeout: 180_000 }, () => {
  const source = `
import type { ActionDefinition, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
${FREE_OF_IDENTITY}
type Input<T> = T extends ActionDefinition<infer I, infer _O> ? I : never;
export const createFree: Free<Input<typeof goalsActions.create>> = true;
export const decideFree: Free<Input<typeof goalsActions.decide>> = true;
export const setActiveGoalFree: Free<Input<typeof goalsActions.active>> = true;
export const checkGoalTreeProposalFree: Free<Input<typeof goalsActions.treeCheck>> = true;
declare const client: BoundActionClient;
export const checked = client.invoke(goalsActions.treeCheck, { proposal_id: "x", idempotency_key: "k" });
// @ts-expect-error the call context supplies the actor, which the input refuses
export const forged: Input<typeof goalsActions.treeCheck> = { proposal_id: "x", idempotency_key: "k", actor_id: "someone" };
`;
  assert.deepEqual(typeErrors(source), []);
});

test("the type check flags an entry whose input still names who writes", { timeout: 180_000 }, () => {
  const errors = typeErrors(`${FREE_OF_IDENTITY}
export const named: Free<{ project_id: string; actor_id: string }> = true;
export const nested: Free<[{ project_id: string; actor_kind: "user" }]> = true;
export const clean: Free<{ project_id: string }> = true;
`);
  assert.deepEqual(errors.map(error => error.split(":")[0]), ["line 5", "line 6"], errors.join("\n"));
});


const proposalEntry = (key: string, name = "child") => ({ summary: "拆一个子目标", idempotency_key: key, items: [{ item_id: `${name}-item`, kind: "goal" as const, operation: "create" as const,
  payload: { goal_id: `${name}-goal`, title: "子目标", outcome: "结果" }, source_refs: ["runtime"], reason: "需要", confidence: 0.9 }] });

/**
 * Project guidance, a planning method and a structure proposal are written through the same management door as the event writes
 * (the CLI and the management MCP), so they follow the same rule: the person on this machine is recorded, and an identity in the
 * arguments is refused instead of trusted. A Runtime writes them through the registered actions, which take the identity from the
 * call context.
 */
test("a structure proposal written through the management door records the person on this machine", async () => {
  const home = await mkdtemp(join(tmpdir(), "goal-management-entries-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Entries", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const project_id = project.project_id, management = managementGoals(host.actionClient(ref), project_id);
  const runtime = bindActionClient(host.actionClient(ref), () => ({ actor_id: "runtime:writer", audit_actor_id: "runtime:writer:session", actor_kind: "runtime",
    audience: "agent", project_id, permissions: ["goals:read", "goals:write", "attention:write"], runtime_session_id: "session" }));
  const identities = [{ actor_id: "someone-else" }, { actor_kind: "runtime" }, { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user" }];
  try {
    // Structure proposal submit.
    const proposal = proposalEntry("proposal-submit");
    for (const identity of [...identities, { submitted_session_id: "forged-session" }]) {
      await assert.rejects(management.invoke(goalsActions.treeSubmit, { ...proposal, ...identity } as never), { code: "actions.input_invalid" }, `submit refuses ${Object.keys(identity).join(" and ")}`);
    }
    await assert.rejects(host.actionClient(ref).invoke(managementCaller("foreign"), goalsActions.treeSubmit, { ...proposal, actor_id: "someone-else" } as never), { code: "actions.scope_mismatch" });
    assert.deepEqual((await runtime.invoke(goalsActions.treeRead, {})).proposals, [], "a refused call writes nothing");
    const submitted = await management.invoke(goalsActions.treeSubmit, proposal);
    assert.equal(submitted.proposal.submitted_by, LOCAL_PERSON_ACTOR_ID);
    assert.equal(submitted.proposal.submitted_session_id, null, "the management door has no Runtime Session");
    assert.equal(submitted.replayed, false);
    assert.equal((await management.invoke(goalsActions.treeSubmit, proposal)).replayed, true, "the same key replays for the same person");
    // The Runtime's action with the same key is its own proposal under its own Session: no entry replays the other's.
    const viaTree = await runtime.invoke(goalsActions.treeSubmit, proposalEntry("proposal-submit", "runtime"));
    assert.equal(viaTree.replayed, false);
    assert.equal(viaTree.proposal.submitted_by, "runtime:writer:session");
    assert.equal(viaTree.proposal.submitted_session_id, "session");
    assert.notEqual(viaTree.proposal.proposal_id, submitted.proposal.proposal_id);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("structure submit takes a plugin's own action identity and refuses an identity claimed in its input", async () => {
  const home = await mkdtemp(join(tmpdir(), "goal-management-entries-plugin-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "EntriesPlugin", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  // A proposal opens the decision reminder through the platform's Attention service, which asks its caller for `attention:write` (PG-094 S11).
  const writer = callerPlugin("goalproposer", "project", { "goals:read": true, "goals:write": true, "attention:write": true });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: [writer.definition] } });
  const project_id = project.project_id, actions = host.actionClient(ref), proposal = proposalEntry("plugin-submit");
  try {
    await host.withProject(ref, () => undefined);
    const probe = registerProbe(host.actionRegistry(ref), "project");
    await startProjectPlugins(host, ref);
    const issued = await issuedCaller(probe, writer, project_id);
    const caller = callAs(issued, ["goals:read", "goals:write", "attention:write"]);
    await assert.rejects(actions.invoke(caller, goalsActions.treeSubmit, { ...proposal, actor_id: LOCAL_PERSON_ACTOR_ID } as never), { code: "actions.input_invalid" });
    assert.deepEqual((await actions.invoke(caller, goalsActions.treeRead, {})).proposals, []);
    const saved = await actions.invoke(caller, goalsActions.treeSubmit, proposal);
    assert.equal(saved.proposal.submitted_by, issued.actor_id);
    assert.equal(saved.proposal.submitted_session_id, null);
    assert.equal((await actions.invoke(caller, goalsActions.treeRead, { proposal_id: saved.proposal.proposal_id })).proposals[0]?.proposal_id, saved.proposal.proposal_id);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("the structure-submit action is typed without an identity", { timeout: 180_000 }, () => {
  const source = `
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
type Input<T> = T extends ActionDefinition<infer I, infer _O> ? I : never;
${FREE_OF_IDENTITY}
export const submitFree: Free<Input<typeof goalsActions.treeSubmit>> = true;
type SessionFree<Input> = "submitted_session_id" extends keyof Input ? false : true;
export const submitSessionFree: SessionFree<Input<typeof goalsActions.treeSubmit>> = true;
`;
  assert.deepEqual(typeErrors(source), []);
});

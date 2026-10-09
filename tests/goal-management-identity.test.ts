import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import * as goalsPlugin from "@molis-ai/molis-work-plugin-goals";
import { createGoalIntentCapability, setActiveGoalCapability, recordGoalUserDecisionCapability, goalTreeCapabilities, goalsActions,
  hostEventDecisionAuthority } from "@molis-ai/molis-work-plugin-goals";
import { goalProgressCapabilities } from "@molis-ai/molis-work-contracts/modules/goals";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionMetadata, type ActionReference, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityCallOptions, HostCapabilityDefinition, HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import { managementCaller, managementGoals } from "./goal-management-caller.js";
import { createPluginCapabilityClient } from "@molis-ai/molis-work-plugin-runtime";
import { filesManifest } from "@molis-ai/molis-work-plugin-files";

const door = (name: string, capability: unknown, business: Record<string, unknown>) =>
  ({ name, capability: capability as HostCapabilityDefinition<unknown, unknown>, business });

/** The typed management writes that still have a caller in the product (the first-run setup creates the first Goal). */
const managementDoors = () => [
  door("create intent", createGoalIntentCapability, { title: "目标" }),
];

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

/** Every typed event write the Goals plugin exports, by export name: the commands under the event entry's id prefix. */
const typedEventWrites = () => Object.entries(goalsPlugin as Record<string, unknown>).filter((entry): entry is [string, HostCapabilityDefinition<unknown, unknown>] => {
  const value = entry[1] as { capability_id?: unknown; operation?: unknown } | null;
  return typeof value === "object" && value !== null && value.operation === "command"
    && typeof value.capability_id === "string" && value.capability_id.startsWith("io.molis.work.goals.events.");
});

/**
 * The CLI and the management MCP are the management door. They have no caller identity of their own, so they record the person on
 * this machine and refuse an actor_id or actor_kind carried in the arguments instead of trusting it (specs/goal-closure-identity).
 * What is still typed (the first Goal of a project, the current Goal, the structure check, Coding's progress) keeps its door; every
 * other write is a Goals action that a management caller calls as that person. The project is checked first: a foreign project
 * stays a scope mismatch.
 */
test("every management write records the person on this machine and refuses an identity in its arguments", async () => {
  const home = await mkdtemp(join(tmpdir(), "goal-management-identity-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Identity", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const typed = host.client(ref), actions = host.actionClient(ref), project_id = project.project_id, goal_id = "IDENTITY-GOAL";
  const management = managementGoals(actions, project_id);
  const cursor = async () => (await management.invoke(goalsActions.state, { goal_id })).goal_event_cursor;
  const event = (eventId: string) => host.withProject(ref, runtime => runtime.coordinator.goalEvents.readEvent(project_id, goal_id, eventId));
  try {
    const intent = { project_id, goal_id, title: "管理入口", outcome: "记在本机这个人身上", idempotency_key: "create" };
    assert.equal((await typed.invoke(createGoalIntentCapability, intent)).replayed, false);
    assert.equal((await typed.invoke(createGoalIntentCapability, intent)).replayed, true, "the same key replays for the same person");
    const before = await cursor();

    // Each typed door takes the project and the key and nothing about who writes. The business fields are left out on purpose: the
    // identity is refused before they are read, and a refused call writes nothing.
    for (const { name, capability, business } of managementDoors()) {
      for (const identity of [{ actor_id: "someone-else" }, { actor_kind: "runtime" }, { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user" }]) {
        await assert.rejects(typed.invoke(capability, { project_id, idempotency_key: `refused-${name}`, ...business, ...identity }),
          { code: "actions.input_invalid" }, `${name} refuses ${Object.keys(identity).join(" and ")}`);
      }
      await assert.rejects(typed.invoke(capability, { ...business, project_id: "foreign", idempotency_key: `foreign-${name}`, actor_id: "someone-else" }),
        { code: "actions.scope_mismatch" }, `${name}: a foreign project is a scope mismatch before the identity is looked at`);
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
    // The current Goal and the tree check carry the project in a wrapper: a nested write, and a one-element argument list.
    const forgedActive = { goal: { goal_id, reason: "当前" }, write: { idempotency_key: "refused-active", actor_id: "someone-else" } };
    await assert.rejects(typed.invoke(setActiveGoalCapability, { project_id, ...forgedActive } as never), { code: "actions.input_invalid" });
    await assert.rejects(typed.invoke(setActiveGoalCapability, { project_id: "foreign", ...forgedActive } as never), { code: "actions.scope_mismatch" });
    const forgedCheck = { proposal_id: "p", idempotency_key: "refused-check", actor_id: "someone-else" };
    await assert.rejects(typed.invoke(goalTreeCapabilities.checkGoalTreeProposal, [{ project_id, ...forgedCheck }] as never), { code: "actions.input_invalid" });
    await assert.rejects(typed.invoke(goalTreeCapabilities.checkGoalTreeProposal, [{ project_id: "foreign", ...forgedCheck }] as never), { code: "actions.scope_mismatch" });
    // The progress capability Coding uses has no project in its input; the typed Host client is the management door there too.
    for (const identity of [{ actor_id: "someone-else" }, { actor_kind: "runtime" }]) {
      await assert.rejects(typed.invoke(goalProgressCapabilities.record, { goal_id, based_on_cursor: before, summary: "进展", idempotency_key: "refused-record", ...identity } as never),
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
    const recorded = await typed.invoke(goalProgressCapabilities.record, record);
    assert.equal(recorded.progress_summary.actor_id, LOCAL_PERSON_ACTOR_ID);
    assert.equal((await typed.invoke(goalProgressCapabilities.record, record)).replayed, true);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

/**
 * The management door records the person on this machine, so it has to stay out of a plugin's reach: a plugin that lists one of
 * these entries under capabilities.consumes would otherwise be recorded as that person. The typed entries are `host_only`. What a
 * plugin may still reach is a registered action, and that takes the identity from the call context; the actions behind the
 * deleted typed doors say in their own audiences who may call them.
 */
test("a plugin that lists a management entry under consumes is refused and is never recorded as the person on this machine", async () => {
  const home = await mkdtemp(join(tmpdir(), "goal-management-plugin-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Plugin", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const typed = host.client(ref), project_id = project.project_id, goal_id = "PLUGIN-GOAL";
  const management = managementGoals(host.actionClient(ref), project_id);
  const cursor = async () => (await management.invoke(goalsActions.state, { goal_id })).goal_event_cursor;
  const event = (eventId: string) => host.withProject(ref, runtime => runtime.coordinator.goalEvents.readEvent(project_id, goal_id, eventId));
  // What the plugin executor binds around every call a plugin makes: the plugin consumer and the plugin's own call context.
  const asPlugin = (actor_id: string): HostCapabilityCallOptions => ({ consumer: "plugin", before_effect: async () => {},
    plugin_caller: { plugin_id: "io.molis.work.test.goal-writer", install_id: "install-1", actor_id, project_id,
      declaration: { manifest: {} as HostPluginCaller["declaration"]["manifest"] }, assertActive: () => {} } });
  try {
    await typed.invoke(createGoalIntentCapability, { project_id, goal_id, title: "插件", outcome: "不能冒充本机这个人", idempotency_key: "create" });
    const before = await cursor();
    const entries = [
      ...managementDoors().map(({ name, capability, business }) =>
        ({ name, capability, input: { project_id, idempotency_key: `plugin-${name}`, ...business } as unknown })),
      { name: "set current goal", capability: setActiveGoalCapability as HostCapabilityDefinition<unknown, unknown>,
        input: { project_id, goal: { goal_id, reason: "当前" }, write: { idempotency_key: "plugin-active" } } as unknown },
      { name: "check structure proposal", capability: goalTreeCapabilities.checkGoalTreeProposal as HostCapabilityDefinition<unknown, unknown>,
        input: [{ project_id, proposal_id: "p", idempotency_key: "plugin-check" }] as unknown },
    ];
    // The table is every typed event write the Goals plugin exports (the event decision aside: it takes the protected authority and
    // was already host_only), and each of them carries the flag. A write added later without the flag fails here, and so does a
    // typed event write that comes back after its action took its place.
    const exported = typedEventWrites().map(([, capability]) => capability);
    assert.deepEqual(exported.map(capability => capability.capability_id).sort(),
      [...managementDoors().map(({ capability }) => capability.capability_id), recordGoalUserDecisionCapability.capability_id].sort(),
      "add the new typed event write to managementDoors, and mark it host_only");
    assert.deepEqual(exported.filter(capability => capability.host_only !== true).map(capability => capability.capability_id), [],
      "a typed event write that a plugin can reach is recorded as the person on this machine");
    const manifest = { ...filesManifest, plugin_id: "io.molis.work.test.goal-writer",
      capabilities: { provides: [], consumes: entries.map(entry => entry.capability.capability_id) } };
    const sdk = createPluginCapabilityClient(manifest, typed);
    for (const { name, capability, input } of entries) {
      // Listing the entry in the manifest does not make it reachable, and neither does a copy of the definition without the flag.
      const available = sdk.availability(capability);
      assert.equal(available.available, false, `${name} is not available to a plugin`);
      assert.equal(!available.available && available.code, "actions.host_only", name);
      await assert.rejects(sdk.invoke(capability, input), { code: "actions.host_only" }, `${name}: through the plugin client`);
      await assert.rejects(sdk.invoke({ ...capability, host_only: false }, input), { code: "actions.host_only" }, `${name}: through an unflagged copy`);
      await assert.rejects(typed.invoke(capability, input, asPlugin("plugin-person")), { code: "actions.host_only" }, `${name}: with the plugin's own call context`);
    }
    assert.equal(await cursor(), before, "a refused call writes nothing");

    // A plugin that wants to write reaches the registered action, and the action takes who writes from the plugin's own call
    // context: the same note is recorded under the plugin's identity, never the person's.
    const pluginNote = await host.actionClient(ref).invoke({ actor_id: "plugin-person", audience: "plugin", project_id, permissions: ["goals:read", "goals:write"] },
      goalsActions.note, { goal_id, body: "插件写的便笺", idempotency_key: "plugin-note" }) as { event_id: string };
    assert.equal((await event(pluginNote.event_id)).actor_id, "plugin-person");

    // With valid arguments the refusal is the only thing between the plugin and a record under the person's name.
    const intent = { project_id, goal_id: "PLUGIN-SECOND", title: "再一个", idempotency_key: "plugin-intent" };
    const second = () => host.withProject(ref, runtime => runtime.coordinator.goalQueries.getGoal(project_id, "PLUGIN-SECOND"));
    await assert.rejects(typed.invoke(createGoalIntentCapability, intent, asPlugin("plugin-person")), { code: "actions.host_only" });
    await assert.rejects(second(), { code: "goal.not_found" }, "no record was left behind");
    await typed.invoke(createGoalIntentCapability, intent);
    assert.equal((await second())?.goal_id, "PLUGIN-SECOND", "the same arguments from the Host's own client are recorded");
    const noted = await management.invoke(goalsActions.note, { goal_id, body: "本机这个人写的便笺", idempotency_key: "note" });
    assert.equal((await event(noted.event_id)).actor_id, LOCAL_PERSON_ACTOR_ID, "the same call from a management caller is recorded as the person");

    // What a plugin is meant to reach stays open: Goal progress takes the actor from the plugin's own call context.
    assert.equal(typed.availability(goalProgressCapabilities.record, { consumer: "plugin" }).available, true);
    const recorded = await typed.invoke(goalProgressCapabilities.record,
      { goal_id, based_on_cursor: await cursor(), summary: "插件的进展", idempotency_key: "plugin-progress" } as never, asPlugin("plugin-person"));
    assert.equal(recorded.progress_summary.actor_id, "plugin-person");
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

/**
 * A project on a fresh Home, with the callers the approval rule is tried through: the management door (`typed`), the person's Web
 * action client and a runtime's. `supported` makes a Goal whose one requirement the work already supports, so the project's approval
 * rule is the only thing left to satisfy.
 */
async function approvalProject(name: string) {
  const home = await mkdtemp(join(tmpdir(), `goal-management-${name}-`));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: name, actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const typed = host.client(ref), project_id = project.project_id, management = managementGoals(host.actionClient(ref), project_id);
  const runtime = bindActionClient(host.actionClient(ref), () => ({ actor_id: "runtime:closer", audit_actor_id: "runtime:closer:session",
    actor_kind: "runtime", audience: "agent", project_id, permissions: ["goals:read", "goals:write"] }));
  const web = bindActionClient(host.actionClient(ref), () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user", project_id,
    permissions: ["goals:read", "goals:write", "goals:decide"], user_action: { source: "web", conversation_ref: "web:approval", message_ref: "web:click" } }));
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
  return { host, ref, typed, management, project_id, runtime, web, requirement, supported, closeInput,
    done: async () => { await host.close(); await rm(home, { recursive: true, force: true }); } };
}

/**
 * The management door records its closes as the person on this machine, a user. Under the project rule 「完成前必须你点头」 that is
 * still not the approval (specs/goal-closure-identity): neither is the Web's complete button or a runtime's close. What releases the
 * rule is a trusted user conclusion, and the door can record one as the person too.
 */
test("under the project approval rule a close from the management door, the Web or a runtime is not the approval", async () => {
  const { host, ref, typed, management, project_id, runtime, web, requirement, supported, closeInput, done } = await approvalProject("approval");
  const closers = {
    runtime: async (goal_id: string, key: string) => runtime.invoke(goalsActions.close, await closeInput(goal_id, key)),
    web: async (goal_id: string, key: string) => web.invoke(goalsActions.close, await closeInput(goal_id, key)),
    management: async (goal_id: string, key: string) => management.invoke(goalsActions.close, await closeInput(goal_id, key)),
  };
  const APPROVAL_REQUIRED = "event_closure.human_approval_required";
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
        const recorded = await host.withProject(ref, open => open.coordinator.goalEvents.readEvent(project_id, "DECIDED", held.event_id));
        assert.deepEqual([recorded.actor_id, recorded.actor_kind], [LOCAL_PERSON_ACTOR_ID, "user"]);
      }
    }
    // A decision from the person that authorizes complete releases it, for the same door that was held back before.
    await typed.invoke(recordGoalUserDecisionCapability, { project_id, goal_id: "DECIDED", idempotency_key: "allow",
      authority: hostEventDecisionAuthority("management", project_id, LOCAL_PERSON_ACTOR_ID, "allow"), conclusion: "可以完成",
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
  const APPROVAL_REQUIRED = "event_closure.human_approval_required";
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
  const APPROVAL_REQUIRED = "event_closure.human_approval_required";
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
    await heldFor("HUMAN", "close-human-1", ["event_closure.human_decision_required"], "authorized, the requirement not accepted");
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
 * one. `GoalTreeProposalCheckInput` is the domain input and still names the actor, so the typed check has an input type of its own.
 */
test("the typed management entries are typed without an identity, so a caller that follows the types is not refused", { timeout: 180_000 }, () => {
  // Every typed event write by export name. The event decision names its person inside the protected authority on purpose.
  const writes = typedEventWrites().map(([name]) => name).filter(name => name !== "recordGoalUserDecisionCapability");
  assert.deepEqual(writes, ["createGoalIntentCapability"], "the typed event writes that are left; every other write is an action");
  const source = `
import type { HostCapabilityInput, LocalHostProjectClient } from "@molis-ai/molis-work-contracts/platform/app-host";
import { ${writes.join(", ")}, setActiveGoalCapability, goalTreeCapabilities, createGoalProposalClients } from "@molis-ai/molis-work-plugin-goals";
${FREE_OF_IDENTITY}
${writes.map(name => `export const ${name}Free: Free<HostCapabilityInput<typeof ${name}>> = true;`).join("\n")}
export const setActiveGoalFree: Free<HostCapabilityInput<typeof setActiveGoalCapability>["write"]> = true;
export const checkGoalTreeProposalFree: Free<HostCapabilityInput<typeof goalTreeCapabilities.checkGoalTreeProposal>> = true;

declare const client: LocalHostProjectClient;
const { goalTree } = createGoalProposalClients(client);
export const checked = goalTree.checkGoalTreeProposal({ project_id: "p", proposal_id: "x", idempotency_key: "k" });
// @ts-expect-error the host records the person on this machine and refuses an actor_id
export const forged = goalTree.checkGoalTreeProposal({ project_id: "p", proposal_id: "x", idempotency_key: "k", actor_id: "someone" });
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

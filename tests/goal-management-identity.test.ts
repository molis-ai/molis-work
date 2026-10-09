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
import { createGoalIntentCapability, configureGoalEventsCapability, reportGoalEventsCapability, recordGoalProgressCapability,
  applyGoalConcernCapability, requestGoalDecisionCapability, citeGoalDecisionCapability, setGoalEventAgreementCapability,
  submitGoalEventClosureCapability, resumeGoalEventWorkCapability, recordGoalNoteCapability, setActiveGoalCapability,
  recordGoalUserDecisionCapability, readGoalEventStateCapability, goalTreeCapabilities, goalsActions, goalsEntryCapabilities,
  hostEventDecisionAuthority } from "@molis-ai/molis-work-plugin-goals";
import type { ResolvedPlanningMethodPack } from "@molis-ai/molis-work-contracts/modules/goals";
import { goalProgressCapabilities } from "@molis-ai/molis-work-contracts/modules/goals";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityCallOptions, HostCapabilityDefinition, HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import { createPluginCapabilityClient } from "@molis-ai/molis-work-plugin-runtime";
import { filesManifest } from "@molis-ai/molis-work-plugin-files";

const door = (name: string, capability: unknown, business: Record<string, unknown>) =>
  ({ name, capability: capability as HostCapabilityDefinition<unknown, unknown>, business });

/** The eleven writes that take the project and the key plus their own business fields; the identity is looked at before those. */
const managementDoors = (goal_id: string, cursor: number) => [
  door("create intent", createGoalIntentCapability, { title: "目标" }),
  door("configure", configureGoalEventsCapability, { goal_id, expected_version: 0 }),
  door("report", reportGoalEventsCapability, { goal_id, events: [] }),
  door("progress", recordGoalProgressCapability, { goal_id, based_on_cursor: cursor, summary: "进展" }),
  door("concern", applyGoalConcernCapability, { goal_id, action: "open", title: "问题" }),
  door("request decision", requestGoalDecisionCapability, { goal_id, question: "是否继续？" }),
  door("cite decision", citeGoalDecisionCapability, { goal_id, decision_id: "d" }),
  door("agreement", setGoalEventAgreementCapability, { goal_id }),
  door("closure", submitGoalEventClosureCapability, { goal_id, kind: "complete", reason: "收尾" }),
  door("resume", resumeGoalEventWorkCapability, { goal_id, reason: "继续" }),
  door("note", recordGoalNoteCapability, { goal_id, body: "便笺" }),
];

/** Every typed event write the Goals plugin exports, by export name: the commands under the event entry's id prefix. */
const typedEventWrites = () => Object.entries(goalsPlugin as Record<string, unknown>).filter((entry): entry is [string, HostCapabilityDefinition<unknown, unknown>] => {
  const value = entry[1] as { capability_id?: unknown; operation?: unknown } | null;
  return typeof value === "object" && value !== null && value.operation === "command"
    && typeof value.capability_id === "string" && value.capability_id.startsWith("io.molis.work.goals.events.");
});

/**
 * The CLI and the typed Host client are the management door. It has no caller identity of its own, so it records the person on
 * this machine and refuses an actor_id or actor_kind carried in the arguments instead of trusting it
 * (specs/goal-closure-identity). The project is checked first: a foreign project stays a scope mismatch.
 */
test("every management write records the person on this machine and refuses an identity in its arguments", async () => {
  const home = await mkdtemp(join(tmpdir(), "goal-management-identity-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Identity", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const typed = host.client(ref), project_id = project.project_id, goal_id = "IDENTITY-GOAL";
  const cursor = async () => (await typed.invoke(readGoalEventStateCapability, { project_id, goal_id })).goal_event_cursor;
  const event = (eventId: string) => host.withProject(ref, runtime => runtime.coordinator.goalEvents.readEvent(project_id, goal_id, eventId));
  try {
    const intent = { project_id, goal_id, title: "管理入口", outcome: "记在本机这个人身上", idempotency_key: "create" };
    assert.equal((await typed.invoke(createGoalIntentCapability, intent)).replayed, false);
    assert.equal((await typed.invoke(createGoalIntentCapability, intent)).replayed, true, "the same key replays for the same person");
    const before = await cursor();

    // Each door takes the project and the key and nothing about who writes. The business fields are left out on purpose: the
    // identity is refused before they are read, and a refused call writes nothing.
    for (const { name, capability, business } of managementDoors(goal_id, before)) {
      for (const identity of [{ actor_id: "someone-else" }, { actor_kind: "runtime" }, { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user" }]) {
        await assert.rejects(typed.invoke(capability, { project_id, idempotency_key: `refused-${name}`, ...business, ...identity }),
          { code: "actions.input_invalid" }, `${name} refuses ${Object.keys(identity).join(" and ")}`);
      }
      await assert.rejects(typed.invoke(capability, { ...business, project_id: "foreign", idempotency_key: `foreign-${name}`, actor_id: "someone-else" }),
        { code: "actions.scope_mismatch" }, `${name}: a foreign project is a scope mismatch before the identity is looked at`);
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
    const note = { project_id, goal_id, body: "便笺", idempotency_key: "note" };
    const noted = await typed.invoke(recordGoalNoteCapability, note);
    assert.equal(noted.recorded, true);
    const written = await event(noted.event_id);
    assert.equal(written.actor_id, LOCAL_PERSON_ACTOR_ID);
    assert.equal(written.actor_kind, "user");
    assert.equal((await typed.invoke(recordGoalNoteCapability, note)).replayed, true);
    const progress = { project_id, goal_id, based_on_cursor: await cursor(), summary: "进展", idempotency_key: "progress" };
    assert.equal((await typed.invoke(recordGoalProgressCapability, progress)).progress_summary.actor_id, LOCAL_PERSON_ACTOR_ID);
    const record = { goal_id, based_on_cursor: await cursor(), summary: "再一条进展", idempotency_key: "record" };
    const recorded = await typed.invoke(goalProgressCapabilities.record, record);
    assert.equal(recorded.progress_summary.actor_id, LOCAL_PERSON_ACTOR_ID);
    assert.equal((await typed.invoke(goalProgressCapabilities.record, record)).replayed, true);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

/**
 * The management door records the person on this machine, so it has to stay out of a plugin's reach: a plugin that lists one of
 * these entries under capabilities.consumes would otherwise be recorded as that person. The entries are `host_only`. What a plugin
 * may still reach is a registered action, and that takes the identity from the call context.
 */
test("a plugin that lists a management entry under consumes is refused and is never recorded as the person on this machine", async () => {
  const home = await mkdtemp(join(tmpdir(), "goal-management-plugin-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Plugin", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const typed = host.client(ref), project_id = project.project_id, goal_id = "PLUGIN-GOAL";
  const cursor = async () => (await typed.invoke(readGoalEventStateCapability, { project_id, goal_id })).goal_event_cursor;
  const event = (eventId: string) => host.withProject(ref, runtime => runtime.coordinator.goalEvents.readEvent(project_id, goal_id, eventId));
  // What the plugin executor binds around every call a plugin makes: the plugin consumer and the plugin's own call context.
  const asPlugin = (actor_id: string): HostCapabilityCallOptions => ({ consumer: "plugin", before_effect: async () => {},
    plugin_caller: { plugin_id: "io.molis.work.test.goal-writer", install_id: "install-1", actor_id, project_id,
      declaration: { manifest: {} as HostPluginCaller["declaration"]["manifest"] }, assertActive: () => {} } });
  try {
    await typed.invoke(createGoalIntentCapability, { project_id, goal_id, title: "插件", outcome: "不能冒充本机这个人", idempotency_key: "create" });
    const before = await cursor();
    const entries = [
      ...managementDoors(goal_id, before).map(({ name, capability, business }) =>
        ({ name, capability, input: { project_id, idempotency_key: `plugin-${name}`, ...business } as unknown })),
      { name: "set current goal", capability: setActiveGoalCapability as HostCapabilityDefinition<unknown, unknown>,
        input: { project_id, goal: { goal_id, reason: "当前" }, write: { idempotency_key: "plugin-active" } } as unknown },
      { name: "check structure proposal", capability: goalTreeCapabilities.checkGoalTreeProposal as HostCapabilityDefinition<unknown, unknown>,
        input: [{ project_id, proposal_id: "p", idempotency_key: "plugin-check" }] as unknown },
    ];
    // The table is every typed event write the Goals plugin exports (the event decision aside: it takes the protected authority and
    // was already host_only), and each of them carries the flag. A write added later without the flag fails here.
    const exported = typedEventWrites().map(([, capability]) => capability);
    assert.deepEqual(exported.map(capability => capability.capability_id).sort(),
      [...managementDoors(goal_id, before).map(({ capability }) => capability.capability_id), recordGoalUserDecisionCapability.capability_id].sort(),
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

    // With valid arguments the refusal is the only thing between the plugin and a record under the person's name.
    const note = { project_id, goal_id, body: "插件写的便笺", idempotency_key: "plugin-note" };
    await assert.rejects(typed.invoke(recordGoalNoteCapability, note, asPlugin("plugin-person")), { code: "actions.host_only" });
    assert.equal(await cursor(), before, "no record was left behind");
    const noted = await typed.invoke(recordGoalNoteCapability, note);
    assert.equal((await event(noted.event_id)).actor_id, LOCAL_PERSON_ACTOR_ID, "the same arguments from the Host's own client are recorded as the person");

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
  const typed = host.client(ref), project_id = project.project_id;
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
  return { host, ref, typed, project_id, runtime, web, requirement, supported, closeInput,
    done: async () => { await host.close(); await rm(home, { recursive: true, force: true }); } };
}

/**
 * The management door records its closes as the person on this machine, a user. Under the project rule 「完成前必须你点头」 that is
 * still not the approval (specs/goal-closure-identity): neither is the Web's complete button or a runtime's close. What releases the
 * rule is a trusted user conclusion, and the door can record one as the person too.
 */
test("under the project approval rule a close from the management door, the Web or a runtime is not the approval", async () => {
  const { host, ref, typed, project_id, runtime, web, requirement, supported, closeInput, done } = await approvalProject("approval");
  const closers = {
    runtime: async (goal_id: string, key: string) => runtime.invoke(goalsActions.close, await closeInput(goal_id, key)),
    web: async (goal_id: string, key: string) => web.invoke(goalsActions.close, await closeInput(goal_id, key)),
    management: async (goal_id: string, key: string) => typed.invoke(submitGoalEventClosureCapability, { project_id, ...await closeInput(goal_id, key) }),
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
  assert.ok(writes.length >= 11, `found ${writes.length} typed event writes; the eleven management writes at least should be enumerated`);
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


const guidanceEntry = (key: string) => ({ kind: "constraint" as const, content: "用户数据只保存在本机。", source_refs: ["project://requirements"], reason: "长期数据边界",
  confirmation_summary: "用户已确认此原文", user_confirmed: true, idempotency_key: key });
const proposalEntry = (key: string, name = "child") => ({ summary: "拆一个子目标", idempotency_key: key, items: [{ item_id: `${name}-item`, kind: "goal" as const, operation: "create" as const,
  payload: { goal_id: `${name}-goal`, title: "子目标", outcome: "结果" }, source_refs: ["runtime"], reason: "需要", confidence: 0.9 }] });

/**
 * Project guidance, a planning method and a structure proposal are written through the same management door as the event writes
 * (the CLI and the typed Host client), so they follow the same rule: the person on this machine is recorded, and an identity in the
 * arguments is refused instead of trusted. A Runtime writes them through the registered actions, which take the identity from the
 * call context.
 */
test("guidance, a planning method and a structure proposal written through the management door record the person on this machine", async () => {
  const home = await mkdtemp(join(tmpdir(), "goal-management-entries-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Entries", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const typed = host.client(ref), project_id = project.project_id;
  const runtime = bindActionClient(host.actionClient(ref), () => ({ actor_id: "runtime:writer", audit_actor_id: "runtime:writer:session", actor_kind: "runtime",
    audience: "agent", project_id, permissions: ["goals:read", "goals:write"], runtime_session_id: "session" }));
  const events = (type: string) => host.withProject(ref, r => r.store.db.prepare("SELECT actor_id FROM events WHERE type = ? ORDER BY seq").all(type) as Array<{ actor_id: string }>);
  const identities = [{ actor_id: "someone-else" }, { actor_kind: "runtime" }, { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user" }];
  try {
    // Guidance: add and update.
    const add = guidanceEntry("guidance-add");
    for (const identity of identities) {
      await assert.rejects(typed.invoke(goalsEntryCapabilities.commands.addProjectGuidance, [{ project_id, ...add, ...identity }] as never), { code: "actions.input_invalid" }, `add refuses ${Object.keys(identity).join(" and ")}`);
    }
    await assert.rejects(typed.invoke(goalsEntryCapabilities.commands.addProjectGuidance, [{ ...add, project_id: "foreign", actor_id: "someone-else" }] as never), { code: "actions.scope_mismatch" });
    assert.deepEqual((await runtime.invoke(goalsActions.guidanceRead, {})).entries, [], "a refused call writes nothing");
    const added = await typed.invoke(goalsEntryCapabilities.commands.addProjectGuidance, [{ project_id, ...add }]);
    assert.equal(added.entry.created_by, LOCAL_PERSON_ACTOR_ID);
    assert.equal((await typed.invoke(goalsEntryCapabilities.commands.addProjectGuidance, [{ project_id, ...add }])).replayed, true, "the same key replays for the same person");
    const edit = { guidance_id: added.entry.guidance_id, action: "edit" as const, kind: "constraint" as const, content: "导出前由用户明确确认。", source_refs: ["project://new"],
      reason: "准确说明导出边界", confirmation_summary: "用户确认修改", user_confirmed: true, idempotency_key: "guidance-edit" };
    for (const identity of identities) {
      await assert.rejects(typed.invoke(goalsEntryCapabilities.commands.updateProjectGuidance, [{ project_id, ...edit, ...identity }] as never), { code: "actions.input_invalid" }, `update refuses ${Object.keys(identity).join(" and ")}`);
    }
    await assert.rejects(typed.invoke(goalsEntryCapabilities.commands.updateProjectGuidance, [{ ...edit, project_id: "foreign", actor_id: "someone-else" }] as never), { code: "actions.scope_mismatch" });
    const edited = await typed.invoke(goalsEntryCapabilities.commands.updateProjectGuidance, [{ project_id, ...edit }]);
    assert.equal(edited.entry.updated_by, LOCAL_PERSON_ACTOR_ID);
    assert.equal(edited.entry.revision, 2);
    // A Runtime still writes through the action, and is recorded as its Session.
    const viaAction = await runtime.invoke(goalsActions.guidanceAdd, { ...guidanceEntry("guidance-runtime"), content: "另一条长期说明。" });
    assert.equal(viaAction.entry.created_by, "runtime:writer:session");

    // Planning method save.
    const source = (await runtime.invoke(goalsActions.planningRead, {})).methods.find(method => method.scope !== "project");
    assert.ok(source, "the built-in methods are there to copy");
    const { scope: _scope, version: _version, created_at: _created, updated_at: _updated, overridden_scopes: _overrides, ...method } = source as ResolvedPlanningMethodPack;
    const planning = { project_id, user_confirmed: true, method: { ...method, enabled: false, instructions: "项目独立正文" } };
    for (const identity of identities) {
      await assert.rejects(typed.invoke(goalsEntryCapabilities.planning.saveProjectMethod, [{ ...planning, ...identity }] as never), { code: "actions.input_invalid" }, `planning save refuses ${Object.keys(identity).join(" and ")}`);
    }
    await assert.rejects(typed.invoke(goalsEntryCapabilities.planning.saveProjectMethod, [{ ...planning, project_id: "foreign", actor_id: "someone-else" }] as never), { code: "actions.scope_mismatch" });
    assert.deepEqual(await events("planning.method_saved"), [], "a refused call writes nothing");
    const saved = await typed.invoke(goalsEntryCapabilities.planning.saveProjectMethod, [planning]);
    assert.equal(saved.method.instructions, "项目独立正文");
    assert.deepEqual(await events("planning.method_saved"), [{ actor_id: LOCAL_PERSON_ACTOR_ID }]);

    // Structure proposal submit.
    const proposal = proposalEntry("proposal-submit");
    for (const identity of [...identities, { submitted_session_id: "forged-session" }]) {
      await assert.rejects(typed.invoke(goalTreeCapabilities.submitGoalTreeProposal, [{ project_id, ...proposal, ...identity }] as never), { code: "actions.input_invalid" }, `submit refuses ${Object.keys(identity).join(" and ")}`);
    }
    await assert.rejects(typed.invoke(goalTreeCapabilities.submitGoalTreeProposal, [{ ...proposal, project_id: "foreign", actor_id: "someone-else" }] as never), { code: "actions.scope_mismatch" });
    assert.deepEqual((await runtime.invoke(goalsActions.treeRead, {})).proposals, [], "a refused call writes nothing");
    const submitted = await typed.invoke(goalTreeCapabilities.submitGoalTreeProposal, [{ project_id, ...proposal }]);
    assert.equal(submitted.proposal.submitted_by, LOCAL_PERSON_ACTOR_ID);
    assert.equal(submitted.proposal.submitted_session_id, null, "the management door has no Runtime Session");
    assert.equal(submitted.replayed, false);
    assert.equal((await typed.invoke(goalTreeCapabilities.submitGoalTreeProposal, [{ project_id, ...proposal }])).replayed, true, "the same key replays for the same person");
    // The Runtime's action with the same key is its own proposal under its own Session: no entry replays the other's.
    const viaTree = await runtime.invoke(goalsActions.treeSubmit, proposalEntry("proposal-submit", "runtime"));
    assert.equal(viaTree.replayed, false);
    assert.equal(viaTree.proposal.submitted_by, "runtime:writer:session");
    assert.equal(viaTree.proposal.submitted_session_id, "session");
    assert.notEqual(viaTree.proposal.proposal_id, submitted.proposal.proposal_id);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

/** These entries record the person on this machine, so a plugin that lists one must be refused rather than recorded as that person. */
test("a plugin that lists guidance, planning save or structure submit under consumes is refused", async () => {
  const home = await mkdtemp(join(tmpdir(), "goal-management-entries-plugin-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "EntriesPlugin", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const typed = host.client(ref), project_id = project.project_id;
  const asPlugin = (actor_id: string): HostCapabilityCallOptions => ({ consumer: "plugin", before_effect: async () => {},
    plugin_caller: { plugin_id: "io.molis.work.test.entry-writer", install_id: "install-1", actor_id, project_id,
      declaration: { manifest: {} as HostPluginCaller["declaration"]["manifest"] }, assertActive: () => {} } });
  const runtime = bindActionClient(host.actionClient(ref), () => ({ actor_id: "runtime:writer", project_id, audience: "agent", permissions: ["goals:read", "goals:write"] }));
  try {
    const entries = [
      { name: "add guidance", capability: goalsEntryCapabilities.commands.addProjectGuidance as HostCapabilityDefinition<unknown, unknown>, input: [{ project_id, ...guidanceEntry("plugin-add") }] as unknown },
      { name: "update guidance", capability: goalsEntryCapabilities.commands.updateProjectGuidance as HostCapabilityDefinition<unknown, unknown>,
        input: [{ project_id, guidance_id: "g", action: "deactivate", reason: "停用", confirmation_summary: "确认", user_confirmed: true, idempotency_key: "plugin-update" }] as unknown },
      { name: "save planning method", capability: goalsEntryCapabilities.planning.saveProjectMethod as HostCapabilityDefinition<unknown, unknown>, input: [{ project_id, user_confirmed: true, method: {} }] as unknown },
      { name: "submit structure proposal", capability: goalTreeCapabilities.submitGoalTreeProposal as HostCapabilityDefinition<unknown, unknown>, input: [{ project_id, ...proposalEntry("plugin-submit") }] as unknown },
    ];
    assert.deepEqual(entries.filter(entry => entry.capability.host_only !== true).map(entry => entry.name), [], "every one of them is flagged host_only");
    const manifest = { ...filesManifest, plugin_id: "io.molis.work.test.entry-writer", capabilities: { provides: [], consumes: entries.map(entry => entry.capability.capability_id) } };
    const sdk = createPluginCapabilityClient(manifest, typed);
    for (const { name, capability, input } of entries) {
      const available = sdk.availability(capability);
      assert.equal(available.available, false, `${name} is not available to a plugin`);
      assert.equal(!available.available && available.code, "actions.host_only", name);
      await assert.rejects(sdk.invoke(capability, input), { code: "actions.host_only" }, `${name}: through the plugin client`);
      await assert.rejects(sdk.invoke({ ...capability, host_only: false }, input), { code: "actions.host_only" }, `${name}: through an unflagged copy`);
      await assert.rejects(typed.invoke(capability, input, asPlugin("plugin-person")), { code: "actions.host_only" }, `${name}: with the plugin's own call context`);
    }
    assert.deepEqual((await runtime.invoke(goalsActions.guidanceRead, {})).entries, []);
    assert.deepEqual((await runtime.invoke(goalsActions.treeRead, {})).proposals, []);
    // Reading stays open to the Host's own client and to plugins that list it: only the writes carry the person's name.
    assert.equal(goalTreeCapabilities.listGoalTreeProposals.host_only === true, false);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("the typed guidance, planning-save and structure-submit entries are typed without an identity", { timeout: 180_000 }, () => {
  const source = `
import type { HostCapabilityInput } from "@molis-ai/molis-work-contracts/platform/app-host";
import { goalsEntryCapabilities, goalTreeCapabilities } from "@molis-ai/molis-work-plugin-goals";
${FREE_OF_IDENTITY}
export const addFree: Free<HostCapabilityInput<typeof goalsEntryCapabilities.commands.addProjectGuidance>> = true;
export const updateFree: Free<HostCapabilityInput<typeof goalsEntryCapabilities.commands.updateProjectGuidance>> = true;
export const saveFree: Free<HostCapabilityInput<typeof goalsEntryCapabilities.planning.saveProjectMethod>> = true;
export const submitFree: Free<HostCapabilityInput<typeof goalTreeCapabilities.submitGoalTreeProposal>> = true;
type SessionFree<Input> = Input extends readonly [infer First, ...unknown[]] ? ("submitted_session_id" extends keyof First ? false : true) : true;
export const submitSessionFree: SessionFree<HostCapabilityInput<typeof goalTreeCapabilities.submitGoalTreeProposal>> = true;
`;
  assert.deepEqual(typeErrors(source), []);
});

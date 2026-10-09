import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { createGoalIntentCapability, configureGoalEventsCapability, reportGoalEventsCapability, recordGoalProgressCapability,
  applyGoalConcernCapability, requestGoalDecisionCapability, citeGoalDecisionCapability, setGoalEventAgreementCapability,
  submitGoalEventClosureCapability, resumeGoalEventWorkCapability, recordGoalNoteCapability, setActiveGoalCapability,
  readGoalEventStateCapability, goalTreeCapabilities } from "@molis-ai/molis-work-plugin-goals";
import { goalProgressCapabilities } from "@molis-ai/molis-work-contracts/modules/goals";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityDefinition } from "@molis-ai/molis-work-contracts/platform/app-host";

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
  const door = (name: string, capability: unknown, business: Record<string, unknown>) =>
    ({ name, capability: capability as HostCapabilityDefinition<unknown, unknown>, business });
  try {
    const intent = { project_id, goal_id, title: "管理入口", outcome: "记在本机这个人身上", idempotency_key: "create" };
    assert.equal((await typed.invoke(createGoalIntentCapability, intent)).replayed, false);
    assert.equal((await typed.invoke(createGoalIntentCapability, intent)).replayed, true, "the same key replays for the same person");
    const before = await cursor();

    // Each door takes the project and the key and nothing about who writes. The business fields are left out on purpose: the
    // identity is refused before they are read, and a refused call writes nothing.
    const doors = [
      door("create intent", createGoalIntentCapability, { title: "目标" }),
      door("configure", configureGoalEventsCapability, { goal_id, expected_version: 0 }),
      door("report", reportGoalEventsCapability, { goal_id, events: [] }),
      door("progress", recordGoalProgressCapability, { goal_id, based_on_cursor: before, summary: "进展" }),
      door("concern", applyGoalConcernCapability, { goal_id, action: "open", title: "问题" }),
      door("request decision", requestGoalDecisionCapability, { goal_id, question: "是否继续？" }),
      door("cite decision", citeGoalDecisionCapability, { goal_id, decision_id: "d" }),
      door("agreement", setGoalEventAgreementCapability, { goal_id }),
      door("closure", submitGoalEventClosureCapability, { goal_id, kind: "complete", reason: "收尾" }),
      door("resume", resumeGoalEventWorkCapability, { goal_id, reason: "继续" }),
      door("note", recordGoalNoteCapability, { goal_id, body: "便笺" }),
    ];
    for (const { name, capability, business } of doors) {
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

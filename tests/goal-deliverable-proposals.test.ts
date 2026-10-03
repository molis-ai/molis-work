import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { createGoalsDeliverableActionHandlers, goalsArtifactInputActions, goalsDeliverableActions, type GoalDeliverable } from "@molis-ai/molis-work-plugin-goals";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";

// specs/artifact-positioning A5c: the assistant, Coding, workflows and MCP propose deliverables; only the person records them.
test("deliverables from anyone but the person are proposals the person confirms or turns down", async () => {
  const db = new Database(":memory:");
  const ledger = createContextLedger(db, { authorize: () => true });
  const versions = new Map([["plan@1", "计划"], ["plan@2", "计划终稿"]]);
  const pinned: string[] = [];
  const actions = new ActionService();
  actions.registerProvider({ provider: { provider_id: "goals", title: "Goals", kind: "plugin", project_id: "project" },
    definitions: [...Object.values(goalsDeliverableActions), ...Object.values(goalsArtifactInputActions)], handlers: createGoalsDeliverableActionHandlers({ boardId: "board", goalExists: id => id === "G1", ledger,
      readArtifact: ref => versions.has(`${ref.artifact_id}@${ref.version}`) ? { title: versions.get(`${ref.artifact_id}@${ref.version}`)!, artifact_type_id: "doc", availability: "available", lifecycle_state: "active" } : null,
      pin: async (_caller, subject) => { pinned.push(subject.id); return { artifact_id: "plan", version: 2 }; },
      pinnableKinds: async () => ["pages_document"], boundObjects: () => [] }) });
  const caller = (audience: ActionCallContext["audience"]): ActionCallContext => ({ actor_id: audience === "user" ? "web-user" : "assistant", audience, project_id: "project", permissions: ["goals:read", "goals:write"] });
  const person = caller("user"), assistant = caller("agent");
  const list = async () => (await actions.invoke(person, goalsDeliverableActions.list, { goal_id: "G1" }) as { deliverables: GoalDeliverable[] }).deliverables
    .map(item => [item.reference.version, item.proposed, item.reason]);

  // The assistant proposes, with its reason; a repeat returns the same proposal. Nothing is delivered yet.
  const proposed = await actions.invoke(assistant, goalsDeliverableActions.add, { goal_id: "G1", reference: { artifact_id: "plan", version: 1 }, reason: "这是验收时用的版本" }) as { deliverable: GoalDeliverable; replayed: boolean };
  assert.deepEqual([proposed.deliverable.proposed, proposed.deliverable.reason, proposed.replayed], [true, "这是验收时用的版本", false]);
  assert.equal((await actions.invoke(assistant, goalsDeliverableActions.add, { goal_id: "G1", reference: { artifact_id: "plan", version: 1 } }) as { replayed: boolean }).replayed, true);
  assert.deepEqual(await list(), [[1, true, "这是验收时用的版本"]]);
  assert.equal(ledger.query.list({ actor_id: "web-user", scope: { kind: "personal", id: "board" } }, { type: "goal.output" }).length, 0, "a proposal is not a goal.output");

  // The person confirms it: it becomes a deliverable and the proposal is retired.
  const confirmed = await actions.invoke(person, goalsDeliverableActions.add, { goal_id: "G1", reference: { artifact_id: "plan", version: 1 } }) as { deliverable: GoalDeliverable };
  assert.equal(confirmed.deliverable.proposed, false);
  assert.deepEqual(await list(), [[1, false, null]]);

  // The assistant cannot take back a confirmed deliverable; it can pin and propose another version.
  await assert.rejects(actions.invoke(assistant, goalsDeliverableActions.remove, { goal_id: "G1", reference: { artifact_id: "plan", version: 1 } }), { code: "goals.deliverable_confirmed" });
  const pinnedProposal = await actions.invoke(assistant, goalsDeliverableActions.pin, { goal_id: "G1", subject: { kind: "pages_document", id: "doc-1" } }) as { deliverable: GoalDeliverable };
  assert.deepEqual([pinned, pinnedProposal.deliverable.proposed], [["doc-1"], true]);
  assert.deepEqual(await list(), [[1, false, null], [2, true, null]]);

  // The person turns the proposal down; their own deliverable stays.
  assert.equal((await actions.invoke(person, goalsDeliverableActions.remove, { goal_id: "G1", reference: { artifact_id: "plan", version: 2 } }) as { removed: boolean }).removed, true);
  assert.deepEqual(await list(), [[1, false, null]]);
  db.close();
});

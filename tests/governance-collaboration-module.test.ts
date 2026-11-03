import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { governanceModuleExports as governanceExports } from "./fixtures/goals-modules.js";

import {
  GovernanceCollaborationModule,
  deriveGoalTreeProposalState,
} from "./fixtures/goals-modules.js";

import { DEMO_PROJECT_ID, seedDemoGoals } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { pluginLegalSql } from "./fixtures/plugin-legal-sql.js";

async function fixture(name: string): Promise<{
  store: LocalProjectDatabase;
  governance: GovernanceCollaborationModule;
  dispose(): void;
}> {
  const directory = mkdtempSync(join(tmpdir(), `molis-work-governance-${name}-`));
  const databasePath = join(directory, "molis-work.sqlite");
  await seedDemoGoals(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  let sequence = 0;
  const governance = new GovernanceCollaborationModule({
    db: pluginLegalSql(store).governance,
    journal: store,
    now: () => `2026-09-02T00:00:0${sequence}.000Z`,
    id: () => `test-${sequence += 1}`,
  });
  return {
    store,
    governance,
    dispose: () => {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("Governance decision provenance and target-owner materialization share one rollback boundary", async () => {
  const { store, governance, dispose } = await fixture("decisions");
  try {
    // W5-08-MOD-01/02: only business services are public; their transaction still owns both effects below.
    assert.equal("GovernanceRepository" in governanceExports, false);
    assert.equal("GovernanceRecordStore" in governanceExports, false);
    assert.equal("repository" in governance, false);
    const proposalId = "goal-tree-proposal-module-test";
    const itemId = "goal-tree-item-module-test";
    governance.records.insertGoalTreeProposal({
      proposal_id: proposalId,
      project_id: DEMO_PROJECT_ID,
      root_goal_id: "V1",
      submitted_by: "runtime-a",
      discovered_in_run_id: null,
      state: "pending",
      version: 1,
      supersedes_proposal_id: null,
      base_event_cursor: store.eventCursor(DEMO_PROJECT_ID),
      summary: "atomic materialization test",
      narrative: null,
      created_at: "2026-09-02T00:00:00.000Z",
      updated_at: "2026-09-02T00:00:00.000Z",
    });
    governance.records.insertGoalTreeProposalItem({
      item_id: itemId,
      proposal_id: proposalId,
      project_id: DEMO_PROJECT_ID,
      ordinal: 1,
      kind: "goal",
      operation: "create",
      payload: { goal_id: "V1-child", title: "Child", outcome: "Child outcome" },
      source_refs: ["conversation://thread/message"],
      reason: "user confirmed",
      explanation: null,
      confidence: 1,
      affected_objects: [{ object_type: "goal", object_id: "V1-child" }],
      baseline_versions: [{ object_type: "goal", object_id: "V1-child", exists: false, version: "absent" }],
      requires_user_confirmation: true,
      state: "pending",
      supersedes_item_id: null,
      created_at: "2026-09-02T00:00:00.000Z",
      updated_at: "2026-09-02T00:00:00.000Z",
    });
    // The board has no name any more; its update time stands in for "a write by another owner in the same transaction".
    const beforeUpdatedAt = (store.db.prepare("SELECT updated_at FROM boards WHERE project_id = ?")
      .get(DEMO_PROJECT_ID) as { updated_at: string }).updated_at;
    const decision = {
      decision_id: "goal-tree-decision-module-test",
      project_id: DEMO_PROJECT_ID,
      proposal_id: proposalId,
      item_id: itemId,
      decision: "confirmed" as const,
      actor_id: "user-a",
      authority_source: "runtime_dialogue" as const,
      runtime_actor_id: "runtime-a",
      conversation_ref: "codex://threads/test",
      message_ref: "message-test",
      reason: "confirmed in the current dialogue",
      revision_proposal_id: null,
      materialized_objects: [{ object_type: "goal" as const, object_id: "V1-child" }],
      created_at: "2026-09-02T00:00:01.000Z",
    };

    assert.throws(() => governance.decisions.materializeAtomically(() => {
      governance.records.insertGoalTreeDecision(decision);
      governance.records.transitionGoalTreeItem({
        proposal_id: proposalId,
        item_id: itemId,
        state: "applied",
        materialized_objects: decision.materialized_objects,
        updated_at: decision.created_at,
      });
      store.db.prepare("UPDATE boards SET updated_at = ? WHERE project_id = ?")
        .run("must roll back", DEMO_PROJECT_ID);
      throw new Error("target owner failed");
    }), /target owner failed/);
    assert.equal(governance.query.getGoalTreeProposal(DEMO_PROJECT_ID, proposalId)?.decisions.length, 0);
    assert.equal(governance.query.getGoalTreeProposal(DEMO_PROJECT_ID, proposalId)?.items[0]?.state, "pending");
    assert.equal((store.db.prepare("SELECT updated_at FROM boards WHERE project_id = ?")
      .get(DEMO_PROJECT_ID) as { updated_at: string }).updated_at, beforeUpdatedAt);

    governance.decisions.materializeAtomically(() => {
      governance.records.insertGoalTreeDecision(decision);
      governance.records.transitionGoalTreeItem({
        proposal_id: proposalId,
        item_id: itemId,
        state: "applied",
        materialized_objects: decision.materialized_objects,
        updated_at: decision.created_at,
      });
      store.db.prepare("UPDATE boards SET updated_at = ? WHERE project_id = ?")
        .run("materialized", DEMO_PROJECT_ID);
    });
    const persisted = governance.query.getGoalTreeProposal(DEMO_PROJECT_ID, proposalId);
    assert.equal(persisted?.decisions[0]?.authority_source, "runtime_dialogue");
    assert.equal(persisted?.decisions[0]?.conversation_ref, "codex://threads/test");
    assert.equal(persisted?.decisions[0]?.message_ref, "message-test");
    assert.equal(persisted?.items[0]?.state, "applied");
    assert.equal(deriveGoalTreeProposalState(persisted?.items ?? []), "approved");
    // I2-01: the real state transition is refused by the shared owner model.
    assert.throws(
      () => governance.records.transitionGoalTreeItem({
        proposal_id: proposalId,
        item_id: itemId,
        state: "pending",
        updated_at: "2026-09-02T00:00:02.000Z",
      }),
      (error: unknown) => error instanceof ActionError && error.code === "goals.governance.transition_invalid" && error.kind === "invalid",
    );
  } finally {
    dispose();
  }
});

/** The one thing the stored-JSON cases assert: a read that cannot parse raises the owner's "record unreadable" code. */
function capturedGovernanceRead(action: () => unknown): ActionError {
  let thrown: unknown = null;
  try { action(); } catch (error) { thrown = error; }
  if (!(thrown instanceof ActionError)) assert.fail("读不出来的 JSON 应当抛 ActionError，而不是当成备用值");
  assert.equal(thrown.code, "goals.storage.record_unreadable");
  assert.equal(thrown.kind, "internal");
  return thrown;
}

function insertProposalWithItem(store: LocalProjectDatabase, governance: GovernanceCollaborationModule, name: string): { proposalId: string; itemId: string } {
  const proposalId = `proposal-${name}`;
  const itemId = `item-${name}`;
  governance.records.insertGoalTreeProposal({
    proposal_id: proposalId,
    project_id: DEMO_PROJECT_ID,
    root_goal_id: "V1",
    submitted_by: "runtime-a",
    discovered_in_run_id: null,
    state: "pending",
    version: 1,
    supersedes_proposal_id: null,
    base_event_cursor: store.eventCursor(DEMO_PROJECT_ID),
    summary: `stored json ${name}`,
    narrative: null,
    created_at: "2026-09-02T00:00:00.000Z",
    updated_at: "2026-09-02T00:00:00.000Z",
  });
  governance.records.insertGoalTreeProposalItem({
    item_id: itemId,
    proposal_id: proposalId,
    project_id: DEMO_PROJECT_ID,
    ordinal: 1,
    kind: "goal",
    operation: "create",
    payload: { goal_id: `child-${name}`, title: "Child", outcome: "Child outcome" },
    source_refs: ["conversation://thread/message"],
    reason: "user confirmed",
    explanation: null,
    confidence: 1,
    affected_objects: [{ object_type: "goal", object_id: `child-${name}` }],
    baseline_versions: [{ object_type: "goal", object_id: `child-${name}`, exists: false, version: "absent" }],
    requires_user_confirmation: true,
    state: "pending",
    supersedes_item_id: null,
    created_at: "2026-09-02T00:00:00.000Z",
    updated_at: "2026-09-02T00:00:00.000Z",
  });
  return { proposalId, itemId };
}

test("RAC-1266: an unreadable proposal item baseline stops the proposal read instead of reading as no versions", async () => {
  const { store, governance, dispose } = await fixture("unreadable-baseline");
  try {
    const { proposalId, itemId } = insertProposalWithItem(store, governance, "unreadable-baseline");
    store.db.prepare("UPDATE goal_tree_proposal_items SET baseline_versions_json = ? WHERE item_id = ?").run('{"unreadable":', itemId);
    capturedGovernanceRead(() => governance.query.getGoalTreeProposal(DEMO_PROJECT_ID, proposalId));
  } finally { dispose(); }
});

test("RAC-1267: an unreadable trusted decision scope stops the decision read", async () => {
  const { store, governance, dispose } = await fixture("unreadable-scope");
  try {
    const goalId = (store.db.prepare("SELECT goal_id FROM goals ORDER BY goal_id LIMIT 1").get() as { goal_id: string }).goal_id;
    const decisionId = "decision-unreadable-scope";
    store.db.prepare(`INSERT INTO goal_event_trusted_decisions (
      decision_id, project_id, goal_id, actor_id, actor_kind, authority_source,
      conversation_ref, message_ref, request_id, selected_option_id, conclusion,
      accepts_requirements, scope_json, change_json, recorded_at
    ) VALUES (?, ?, ?, ?, 'user', 'management', ?, ?, NULL, NULL, ?, 1, ?, NULL, ?)`).run(
      decisionId, DEMO_PROJECT_ID, goalId, "review-user",
      "codex://threads/test", "message-test", "我确认可以完成", '{"action":', "2026-09-02T00:00:01.000Z",
    );
    capturedGovernanceRead(() => governance.eventDecisions.read(DEMO_PROJECT_ID, decisionId));
  } finally { dispose(); }
});

test("RAC-1269: the unreadable-record error never repeats the stored proposal text", async () => {
  const { store, governance, dispose } = await fixture("unreadable-marker");
  try {
    const marker = "RAC-1269-governance-marker";
    const { proposalId, itemId } = insertProposalWithItem(store, governance, "unreadable-marker");
    store.db.prepare("UPDATE goal_tree_proposal_items SET baseline_versions_json = ? WHERE item_id = ?").run(`{"${marker}":`, itemId);
    const error = capturedGovernanceRead(() => governance.query.getGoalTreeProposal(DEMO_PROJECT_ID, proposalId));
    assert.doesNotMatch(error.message, new RegExp(marker));
    assert.doesNotMatch(JSON.stringify(error.details ?? null), new RegExp(marker));
  } finally { dispose(); }
});

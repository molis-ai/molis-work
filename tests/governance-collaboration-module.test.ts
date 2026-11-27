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
import { GOALS_PLUGIN_ID, goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { projectReviewDecisions } from "@molis-ai/molis-work-service-project-approvals";
import { fixtureApprovals } from "./fixtures/goal-application.js";
import { pluginLegalSql } from "./fixtures/plugin-legal-sql.js";

async function fixture(name: string): Promise<{
  store: LocalProjectDatabase;
  governance: GovernanceCollaborationModule;
  approvals: ReturnType<typeof fixtureApprovals>;
  dispose(): void;
}> {
  const directory = mkdtempSync(join(tmpdir(), `molis-work-governance-${name}-`));
  const databasePath = join(directory, "molis-work.sqlite");
  await seedDemoGoals(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  const clock = () => "2026-09-02T00:00:00.000Z";
  const approvals = fixtureApprovals(store, () => new Date(clock()));
  const governance = new GovernanceCollaborationModule({
    ...approvals,
    db: pluginLegalSql(store).governance,
    journal: store,
    now: clock,
  });
  return {
    store,
    governance,
    approvals,
    dispose: () => {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("Governance decision provenance and target-owner materialization share one rollback boundary", async () => {
  const { store, governance, approvals, dispose } = await fixture("decisions");
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
      submitted_session_id: null,
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
    const beforeUpdatedAt = (store.db.prepare("SELECT updated_at FROM boards WHERE id = 1")
      .get() as { updated_at: string }).updated_at;
    const decision = {
      decision_id: "goal-tree-decision-module-test",
      project_id: DEMO_PROJECT_ID,
      proposal_id: proposalId,
      item_id: itemId,
      decision: "confirmed" as const,
      actor_id: "user-a",
      authority_source: "management" as const,
      runtime_actor_id: "runtime-a",
      conversation_ref: "codex://threads/test",
      message_ref: "message-test",
      reason: "confirmed in the management entry",
      revision_proposal_id: null,
      materialized_objects: [{ object_type: "goal" as const, object_id: "V1-child" }],
      created_at: "2026-09-02T00:00:01.000Z",
    };

    assert.throws(() => governance.decisions.materializeAtomically(() => {
      governance.records.insertGoalTreeDecision({ ...decision, authority_source: "runtime_dialogue" });
    }), { code: "actions.forbidden" });
    const materialize = (time: string, complete: () => void) => approvals.tree(DEMO_PROJECT_ID, proposalId, "target-owner-review",
      { ...decision, actor_kind: "user" }, decision, () => governance.decisions.materializeAtomically(() => {
        governance.records.insertGoalTreeDecision(decision);
        governance.records.transitionGoalTreeItem({
          proposal_id: proposalId, item_id: itemId, state: "applied",
          materialized_objects: decision.materialized_objects, updated_at: decision.created_at,
        });
        store.db.prepare("UPDATE boards SET updated_at = ? WHERE id = 1").run(time);
        complete();
      }));
    const history = projectReviewDecisions(store.db, DEMO_PROJECT_ID);
    const historyBefore = history.count();
    assert.throws(() => materialize("must roll back", () => { throw new Error("target owner failed"); }), /target owner failed/);
    assert.equal(history.count(), historyBefore);
    assert.equal(governance.query.getGoalTreeProposal(DEMO_PROJECT_ID, proposalId)?.decisions.length, 0);
    assert.equal(governance.query.getGoalTreeProposal(DEMO_PROJECT_ID, proposalId)?.items[0]?.state, "pending");
    assert.equal((store.db.prepare("SELECT updated_at FROM boards WHERE id = 1")
      .get() as { updated_at: string }).updated_at, beforeUpdatedAt);

    materialize("materialized", () => undefined);
    assert.equal(history.count(), historyBefore + 1);
    const persisted = governance.query.getGoalTreeProposal(DEMO_PROJECT_ID, proposalId);
    assert.equal(persisted?.decisions[0]?.authority_source, "management");
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
function capturedGovernanceRead(action: () => unknown, code = "goals.storage.record_unreadable"): ActionError {
  let thrown: unknown = null;
  try { action(); } catch (error) { thrown = error; }
  if (!(thrown instanceof ActionError)) assert.fail("读不出来的 JSON 应当抛 ActionError，而不是当成备用值");
  assert.equal(thrown.code, code);
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
    submitted_session_id: null,
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

test("RAC-1267: an unreadable trusted decision record stops the decision read", async () => {
  const { store, dispose } = await fixture("unreadable-scope");
  try {
    const decisionId = "decision-unreadable-scope";
    const recorded_at = "2026-09-02T00:00:01.000Z";
    const marker = "damaged-decision-scope-marker";
    store.db.prepare(`INSERT INTO project_review_decisions(decision_id, project_id, record_json, recorded_at) VALUES (?, ?, ?, ?)`)
      .run(decisionId, DEMO_PROJECT_ID, `{"${marker}":1}`, recorded_at);
    const error = capturedGovernanceRead(() => projectReviewDecisions(store.db, DEMO_PROJECT_ID).read(decisionId), "actions.execution_failed");
    const location = store.db.prepare("SELECT CAST(rowid AS TEXT) AS ref FROM project_review_decisions WHERE decision_id = ?").get(decisionId) as { ref: string };
    assert.deepEqual(error.details, { storage: { table: "project_review_decisions", column: "record_json", row_ref: location.ref } });
    assert.doesNotMatch(error.message, new RegExp(marker));
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

import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as governanceExports from "@molis-ai/molis-work-module-governance-collaboration";

import {
  GovernanceCollaborationModule,
  deriveGoalTreeProposalState,
} from "@molis-ai/molis-work-module-governance-collaboration";

import { DEMO_PROJECT_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { pluginLegalSql } from "./fixtures/plugin-legal-sql.js";

function fixture(name: string): {
  store: LocalProjectDatabase;
  governance: GovernanceCollaborationModule;
  dispose(): void;
} {
  const directory = mkdtempSync(join(tmpdir(), `molis-work-governance-${name}-`));
  const databasePath = join(directory, "molis-work.sqlite");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  let sequence = 0;
  const governance = new GovernanceCollaborationModule({
    db: pluginLegalSql(store).db,
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

test("Governance decision provenance and target-owner materialization share one rollback boundary", () => {
  const { store, governance, dispose } = fixture("decisions");
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

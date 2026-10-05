import { buildMolisWorkWebView } from "./fixtures/web-view.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { GoalProjectApplication, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { buildDecisionGroups, hostEventDecisionAuthority, pendingDecisionCount } from "@molis-ai/molis-work-plugin-goals";
import { materializeGoalEventHistory } from "./goal-event-history-fixture.js";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-02-tree-"));
  const store = new LocalProjectDatabase(join(directory, "project.db"));
  const app = new GoalProjectApplication(store);
  app.initializeBoard({ board_id: "board", title: "树", actor_id: "user-1", idempotency_key: "init" });
  return { directory, store, app };
}

test("tree submit does not need a Run and approved goals can be recorded immediately", () => {
  const data = fixture();
  try {
    const submitted = data.app.goalTreeSubmission.submitGoalTreeProposal({
      board_id: "board",
      actor_id: "runtime:test:session",
      submitted_session_id: "session",
      summary: "创建两个 Goal 并建立父子关系",
      items: [
        {
          item_id: "item-parent",
          kind: "goal",
          operation: "create",
          payload: { title: "父", outcome: "父结果", goal_id: "tree-parent" },
          source_refs: ["runtime"],
          reason: "新父目标",
          confidence: 0.9,
        },
        {
          item_id: "item-child",
          kind: "goal",
          operation: "create",
          payload: { title: "子", outcome: "子结果", goal_id: "tree-child" },
          source_refs: ["runtime"],
          reason: "新子目标",
          confidence: 0.9,
        },
        {
          item_id: "item-rel",
          kind: "relation",
          operation: "create",
          payload: { from_goal_id: "tree-child", to_goal_id: "tree-parent", type: "part_of", reason: "组成父结果" },
          source_refs: ["runtime"],
          reason: "父子",
          confidence: 0.9,
        },
      ],
      idempotency_key: "tree-1",
    });
    assert.equal(submitted.replayed, false);
    const checked = data.app.goalTreeCheck.checkGoalTreeProposal({
      board_id: "board",
      proposal_id: submitted.proposal.proposal_id,
      actor_id: "runtime:test:session",
      idempotency_key: "check-1",
    });
    assert.deepEqual(checked.conflict_item_ids, []);
    const pendingView = buildMolisWorkWebView(data.store, data.app, { boardId: "board" });
    assert.equal(pendingDecisionCount(pendingView), 1);
    assert.deepEqual(
      buildDecisionGroups(pendingView).flatMap((group) => group.goalTreeProposals.map((item) => item.proposal_id)),
      [submitted.proposal.proposal_id],
    );
    assert.throws(
      () => data.app.goalTreeDecision.decideGoalTreeProposal({
        board_id: "board",
        proposal_id: submitted.proposal.proposal_id,
        authority: {
          ...hostEventDecisionAuthority("runtime_dialogue", "board", "forged-user", "forged-runtime"),
          whole_confirmation_prompted: true,
        },
        confirm_all_pending: true,
        reason: "伪造 Runtime 整组确认",
        idempotency_key: "forged-runtime",
      }),
      (error: unknown) => error instanceof Error && (
        (error as { code?: string }).code === "goal_tree_proposal.whole_confirmation_ambiguous"
        || String(error).includes("绑定准确的 Proposal ID")
      ),
    );
    const decided = data.app.goalTreeDecision.decideGoalTreeProposal({
      board_id: "board",
      proposal_id: submitted.proposal.proposal_id,
      authority: {
        ...hostEventDecisionAuthority("web", "board", "web-user", "tree-dec-1"),
        whole_confirmation_prompted: true,
      },
      confirm_all_pending: true,
      reason: "采用结构",
      idempotency_key: "dec-1",
    });
    assert.equal(decided.applied_item_ids.length, 3);
    const decidedView = buildMolisWorkWebView(data.store, data.app, { boardId: "board" });
    assert.equal(pendingDecisionCount(decidedView), 0);
    const child = data.app.goalEvents.readState("board", "tree-child");
    assert.equal(child.can_record, true);
    assert.equal(child.intent.source_kind, "tree");
    assert.equal(data.app.goalEvents.readState("board", "tree-parent").intent.source_kind, "tree");
    const note = data.app.goalEvents.recordNote({
      board_id: "board", goal_id: "tree-child", actor_id: "runtime:test:session", actor_kind: "runtime",
      body: "无 Run 可直接记录", idempotency_key: "tree-note",
    });
    assert.equal(note.recorded, true);
    assert.throws(
      () => data.app.goalTreeSubmission.submitGoalTreeProposal({
        board_id: "board",
        actor_id: "runtime:test:session",
        summary: "旧 kind",
        items: [{
          kind: "risk", operation: "create", payload: { description: "x" },
          source_refs: ["runtime"], reason: "旧", confidence: 0.5,
        }],
        idempotency_key: "tree-risk",
      }),
      (error: unknown) => error instanceof Error && (
        (error as { code?: string }).code === "goal_tree_proposal.kind_invalid"
        || String(error).includes("只能是 goal")
      ),
    );
  } finally {
    data.store.close();
    rmSync(data.directory, { recursive: true, force: true });
  }
});


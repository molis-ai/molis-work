import type { AttentionApi } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { GoalTreeProposalRecord } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import { goalTreeProposalAttentionGoalId, goalTreeProposalNeedsDecision } from "./decision-groups.js";

export interface GoalDecisionAttentionPorts {
  attention: Pick<AttentionApi, "commands" | "query">;
  listProposals(boardId: string): GoalTreeProposalRecord[];
  goalExists(boardId: string, goalId: string): boolean;
  runGoalId(boardId: string, runId: string): string | null;
}

/** Goals owns Goal-decision Attention. Inbox only reads the resulting reference. */
export class GoalDecisionAttentionSync {
  constructor(private readonly ports: GoalDecisionAttentionPorts) {}

  settleProposal(boardId: string, proposal: GoalTreeProposalRecord, reopenDismissed = true): void {
    const goalId = this.goalId(boardId, proposal);
    if (goalId) this.settleGoal(boardId, goalId, reopenDismissed);
  }

  settleGoal(boardId: string, goalId: string, reopenDismissed = true): void {
    if (this.needsDecision(boardId, goalId)) this.ensureOpen(boardId, goalId, reopenDismissed);
    else this.complete(boardId, goalId);
  }

  reconcile(boardId: string): void {
    const pending = new Set<string>();
    for (const proposal of this.ports.listProposals(boardId)) {
      if (proposal.origin !== "native" || !goalTreeProposalNeedsDecision(proposal)) continue;
      const goalId = this.goalId(boardId, proposal);
      if (goalId) pending.add(goalId);
    }
    for (const goalId of pending) this.ensureOpen(boardId, goalId, false);
    for (const entry of this.ports.attention.query.list(boardId)) {
      if (entry.subject_type !== "goal_decision") continue;
      if (pending.has(entry.subject_id)) continue;
      if (entry.status === "open" || entry.status === "in_progress") {
        this.ports.attention.commands.setStatus(boardId, entry.entry_id, "done");
      }
    }
  }

  private goalId(boardId: string, proposal: GoalTreeProposalRecord): string | null {
    return goalTreeProposalAttentionGoalId(
      proposal,
      (goalId) => this.ports.goalExists(boardId, goalId),
      (runId) => this.ports.runGoalId(boardId, runId),
    );
  }

  private needsDecision(boardId: string, goalId: string): boolean {
    return this.ports.listProposals(boardId).some((proposal) =>
      proposal.origin === "native"
      && goalTreeProposalNeedsDecision(proposal)
      && this.goalId(boardId, proposal) === goalId,
    );
  }

  private ensureOpen(boardId: string, goalId: string, reopenDismissed: boolean): void {
    if (!this.ports.goalExists(boardId, goalId)) return;
    const { entry } = this.ports.attention.commands.create({
      project_id: boardId,
      subject_type: "goal_decision",
      subject_id: goalId,
      reason: "goal_decision",
    });
    if (entry.status === "open" || entry.status === "in_progress") return;
    if (entry.status === "dismissed" && !reopenDismissed) return;
    this.ports.attention.commands.setStatus(boardId, entry.entry_id, "open");
  }

  private complete(boardId: string, goalId: string): void {
    for (const entry of this.ports.attention.query.findForSubject(boardId, "goal_decision", goalId)) {
      if (entry.status === "open" || entry.status === "in_progress") {
        this.ports.attention.commands.setStatus(boardId, entry.entry_id, "done");
      }
    }
  }
}

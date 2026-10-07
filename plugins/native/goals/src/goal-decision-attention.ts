import type { AttentionApi } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { GoalTreeProposalRecord } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import { goalTreeProposalAttentionGoalId, goalTreeProposalNeedsDecision } from "./decision-groups.js";

export interface GoalDecisionAttentionPorts {
  attention: Pick<AttentionApi, "commands" | "query">;
  listProposals(projectId: string): GoalTreeProposalRecord[];
  goalExists(projectId: string, goalId: string): boolean;
}

/** Goals owns Goal-decision Attention. Inbox only reads the resulting reference. */
export class GoalDecisionAttentionSync {
  constructor(private readonly ports: GoalDecisionAttentionPorts) {}

  settleProposal(projectId: string, proposal: GoalTreeProposalRecord, reopenDismissed = true): void {
    const goalId = this.goalId(projectId, proposal);
    if (goalId) this.settleGoal(projectId, goalId, reopenDismissed);
  }

  settleGoal(projectId: string, goalId: string, reopenDismissed = true): void {
    if (this.needsDecision(projectId, goalId)) this.ensureOpen(projectId, goalId, reopenDismissed);
    else this.complete(projectId, goalId);
  }

  reconcile(projectId: string): void {
    const pending = new Set<string>();
    for (const proposal of this.ports.listProposals(projectId)) {
      if (!goalTreeProposalNeedsDecision(proposal)) continue;
      const goalId = this.goalId(projectId, proposal);
      if (goalId) pending.add(goalId);
    }
    for (const goalId of pending) this.ensureOpen(projectId, goalId, false);
    for (const entry of this.ports.attention.query.list(projectId)) {
      if (entry.subject_type !== "goal_decision") continue;
      if (pending.has(entry.subject_id)) continue;
      if (entry.status === "open" || entry.status === "in_progress") {
        this.ports.attention.commands.setStatus(projectId, entry.entry_id, "done");
      }
    }
  }

  private goalId(projectId: string, proposal: GoalTreeProposalRecord): string | null {
    return goalTreeProposalAttentionGoalId(
      proposal,
      (goalId) => this.ports.goalExists(projectId, goalId),
    );
  }

  private needsDecision(projectId: string, goalId: string): boolean {
    return this.ports.listProposals(projectId).some((proposal) =>
      goalTreeProposalNeedsDecision(proposal)
      && this.goalId(projectId, proposal) === goalId,
    );
  }

  private ensureOpen(projectId: string, goalId: string, reopenDismissed: boolean): void {
    if (!this.ports.goalExists(projectId, goalId)) return;
    const { entry } = this.ports.attention.commands.create({
      project_id: projectId,
      subject_type: "goal_decision",
      subject_id: goalId,
      reason: "goal_decision",
    });
    if (entry.status === "open" || entry.status === "in_progress") return;
    if (entry.status === "dismissed" && !reopenDismissed) return;
    this.ports.attention.commands.setStatus(projectId, entry.entry_id, "open");
  }

  private complete(projectId: string, goalId: string): void {
    for (const entry of this.ports.attention.query.findForSubject(projectId, "goal_decision", goalId)) {
      if (entry.status === "open" || entry.status === "in_progress") {
        this.ports.attention.commands.setStatus(projectId, entry.entry_id, "done");
      }
    }
  }
}

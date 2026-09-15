import type {
  GovernanceRecordsApi,
  GoalTreeProposalDecisionResult,
} from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

import type { GovernanceSqliteDatabase } from "./repository.js";
import { GovernanceGoalTreeRecords } from "./goal-tree-records.js";
import { GovernanceProposalOperationStore } from "./proposal-operation-store.js";
import { GovernanceError, type GovernanceErrorFactory } from "./errors.js";

export class GovernanceRecordStore implements GovernanceRecordsApi {
  private readonly proposalOperations: GovernanceProposalOperationStore;
  private readonly goalTrees: GovernanceGoalTreeRecords;
  constructor(db: GovernanceSqliteDatabase, errorFactory: GovernanceErrorFactory = (code, message, details) => new GovernanceError(code, message, details)) {
    this.goalTrees = new GovernanceGoalTreeRecords(db, errorFactory);
    this.proposalOperations = new GovernanceProposalOperationStore(db, errorFactory);
  }

  executeGoalTreeSubmission(...args: Parameters<GovernanceRecordsApi["executeGoalTreeSubmission"]>) {
    return this.proposalOperations.executeSubmission(...args);
  }

  executeGoalTreeDecision<TTransition>(input: Parameters<GovernanceRecordsApi["executeGoalTreeDecision"]>[0],
    operation: () => { value: Omit<GoalTreeProposalDecisionResult<TTransition>, "replayed">; at: string }): GoalTreeProposalDecisionResult<TTransition> {
    return this.proposalOperations.executeGoalTreeDecision(input, operation);
  }

  recordGoalTreeDecision(input: Parameters<GovernanceRecordsApi["recordGoalTreeDecision"]>[0]): number {
    return this.proposalOperations.recordGoalTreeDecision(input);
  }

  recordGoalTreeSubmission(input: Parameters<GovernanceRecordsApi["recordGoalTreeSubmission"]>[0]): number {
    return this.proposalOperations.recordSubmission(input);
  }

  executeGoalTreeCheck(...args: Parameters<GovernanceRecordsApi["executeGoalTreeCheck"]>) {
    return this.proposalOperations.executeCheck(...args);
  }

  recordGoalTreeCheck(input: Parameters<GovernanceRecordsApi["recordGoalTreeCheck"]>[0]): number {
    return this.proposalOperations.recordCheck(input);
  }

  recordGoalTreeRevision(input: Parameters<GovernanceRecordsApi["recordGoalTreeRevision"]>[0]): number {
    return this.proposalOperations.recordRevision(input);
  }

  recordGoalTreeItemDecision(...args: Parameters<GovernanceRecordsApi["recordGoalTreeItemDecision"]>) {
    return this.goalTrees.recordGoalTreeItemDecision(...args);
  }

  refreshGoalTreeProposalState(...args: Parameters<GovernanceRecordsApi["refreshGoalTreeProposalState"]>) {
    return this.goalTrees.refreshGoalTreeProposalState(...args);
  }

  findGoalTreeItemOwner(...args: Parameters<GovernanceRecordsApi["findGoalTreeItemOwner"]>) {
    return this.goalTrees.findGoalTreeItemOwner(...args);
  }

  insertGoalTreeProposal(...args: Parameters<GovernanceRecordsApi["insertGoalTreeProposal"]>) {
    return this.goalTrees.insertGoalTreeProposal(...args);
  }

  insertGoalTreeProposalItem(...args: Parameters<GovernanceRecordsApi["insertGoalTreeProposalItem"]>) {
    return this.goalTrees.insertGoalTreeProposalItem(...args);
  }

  supersedeGoalTreeProposal(...args: Parameters<GovernanceRecordsApi["supersedeGoalTreeProposal"]>) {
    return this.goalTrees.supersedeGoalTreeProposal(...args);
  }

  setGoalTreeItemCheck(...args: Parameters<GovernanceRecordsApi["setGoalTreeItemCheck"]>) {
    return this.goalTrees.setGoalTreeItemCheck(...args);
  }

  transitionGoalTreeProposal(...args: Parameters<GovernanceRecordsApi["transitionGoalTreeProposal"]>) {
    return this.goalTrees.transitionGoalTreeProposal(...args);
  }

  transitionGoalTreeItem(...args: Parameters<GovernanceRecordsApi["transitionGoalTreeItem"]>) {
    return this.goalTrees.transitionGoalTreeItem(...args);
  }

  insertGoalTreeDecision(...args: Parameters<GovernanceRecordsApi["insertGoalTreeDecision"]>) {
    return this.goalTrees.insertGoalTreeDecision(...args);
  }
}

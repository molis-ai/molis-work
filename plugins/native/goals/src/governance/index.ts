import type {
  GovernanceApplicationApi,
  GovernanceEventDecisionApi,
  GovernanceQueryApi,
  GovernanceRecordsApi,
} from "../contract/governance-collaboration.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";

import {
  GovernanceRepository,
  type GovernanceJournal,
  type GovernanceSqliteDatabase,
} from "./repository.js";
import { GovernanceRecordStore } from "./record-store.js";
import { GovernanceProvenance } from "./provenance.js";
import { GovernanceDecisionTransactions } from "./decision-transactions.js";
import { GovernanceEventDecisions } from "./event-decisions.js";
import type { GoalTreeApprovalHistory } from "./mappers.js";

export interface GovernanceCollaborationModuleOptions {
  db: GovernanceSqliteDatabase;
  journal: GovernanceJournal;
  now?: () => string;
  eventDecisions?: GovernanceEventDecisionApi;
  treeApprovals?: GoalTreeApprovalHistory;
}

export class GovernanceCollaborationModule implements GovernanceApplicationApi {
  readonly provenance: GovernanceProvenance;
  readonly records: GovernanceRecordsApi;
  readonly decisions: GovernanceApplicationApi["decisions"];
  readonly eventDecisions: GovernanceApplicationApi["eventDecisions"];
  readonly query: GovernanceQueryApi;

  constructor(options: GovernanceCollaborationModuleOptions) {
    this.provenance = new GovernanceProvenance();
    const repository = new GovernanceRepository(options.db, options.journal, options.treeApprovals);
    this.records = new GovernanceRecordStore(options.db, options.journal, options.treeApprovals);
    this.decisions = new GovernanceDecisionTransactions(options.db);
    this.eventDecisions = options.eventDecisions ?? new GovernanceEventDecisions(
      () => { throw new ActionError("actions.forbidden", "需要平台记录的本人决定"); }, () => null,
    );
    this.query = governanceQueries(repository);
  }
}

export { GovernanceProvenance } from "./provenance.js";
export {
  json as governanceJson,
  mapGoalTreeProposal,
  mapGoalTreeProposalDecision,
  mapGoalTreeProposalItem,
} from "./mappers.js";
export { GovernanceEventDecisions } from "./event-decisions.js";
export type { GoalTreeApprovalHistory } from "./mappers.js";
export {
  type GovernanceJournal,
  type GovernanceSqliteDatabase,
  type GovernanceSqliteStatement,
} from "./repository.js";
export { assertGovernanceTransition, deriveGoalTreeProposalState } from "./state-machine.js";

function governanceQueries(repository: GovernanceRepository): GovernanceQueryApi {
  return {
      eventCursor: (projectId) => repository.eventCursor(projectId),
      snapshot: (projectId) => repository.snapshot(projectId),
      getGoalTreeProposal: (projectId, proposalId) =>
        repository.getGoalTreeProposal(projectId, proposalId),
      listGoalTreeProposals: (projectId) => repository.listGoalTreeProposals(projectId),
    };
}


export { governanceReplicationDefinition } from './replication.js';

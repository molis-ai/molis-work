import type {
  GovernanceApplicationApi,
  GovernanceQueryApi,
  GovernanceRecordsApi,
} from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

import {
  GovernanceRepository,
  type GovernanceJournal,
  type GovernanceSqliteDatabase,
} from "./repository.js";
import { GovernanceRecordStore } from "./record-store.js";
import { GovernanceProvenance } from "./provenance.js";
import { GovernanceDecisionTransactions } from "./decision-transactions.js";
import { GovernanceEventDecisions } from "./event-decisions.js";

export interface GovernanceCollaborationModuleOptions {
  db: GovernanceSqliteDatabase;
  journal: GovernanceJournal;
  now?: () => string;
}

export class GovernanceCollaborationModule implements GovernanceApplicationApi {
  readonly provenance: GovernanceProvenance;
  readonly records: GovernanceRecordsApi;
  readonly decisions: GovernanceApplicationApi["decisions"];
  readonly eventDecisions: GovernanceApplicationApi["eventDecisions"];
  readonly query: GovernanceQueryApi;

  constructor(options: GovernanceCollaborationModuleOptions) {
    this.provenance = new GovernanceProvenance();
    const repository = new GovernanceRepository(options.db, options.journal);
    this.records = new GovernanceRecordStore(options.db, options.journal);
    this.decisions = new GovernanceDecisionTransactions(options.db);
    this.eventDecisions = new GovernanceEventDecisions(
      options.db,
      options.now,
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
  parseJson as parseGovernanceJson,
} from "./mappers.js";
export { GovernanceEventDecisions } from "./event-decisions.js";
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

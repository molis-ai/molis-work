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

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-module-governance-collaboration",
  packagePath: "modules/governance-collaboration",
  kind: "module",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/modules/governance-collaboration",
  migrationGoals: ["goal-reorg-f2","goal-reorg-ex3","goal-reorg-ex4"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "governance.proposals.v1",
    "governance.decisions.v1",
    "governance.event-decisions.v1",
  ],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

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

export function createGovernanceReadServices(db: GovernanceSqliteDatabase, journal: GovernanceJournal): { query: GovernanceQueryApi } {
  return { query: governanceQueries(new GovernanceRepository(db, journal)) };
}

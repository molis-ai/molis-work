import type {
  GovernanceApplicationApi,
  GovernanceQueryApi,
  GovernanceRecordsApi,
} from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

import {
  GovernanceRepository,
  type GovernanceSqliteDatabase,
} from "./repository.js";
import { GovernanceRecordStore } from "./record-store.js";
import { GovernanceProvenance } from "./provenance.js";
import { GovernanceDecisionTransactions } from "./decision-transactions.js";
import { GovernanceEventDecisions } from "./event-decisions.js";
import type { GovernanceErrorFactory } from "./errors.js";

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
  now?: () => string;
  errorFactory?: GovernanceErrorFactory;
}

export class GovernanceCollaborationModule implements GovernanceApplicationApi {
  readonly provenance: GovernanceProvenance;
  readonly repository: GovernanceRepository;
  readonly records: GovernanceRecordsApi;
  readonly decisions: GovernanceApplicationApi["decisions"];
  readonly eventDecisions: GovernanceApplicationApi["eventDecisions"];
  readonly query: GovernanceQueryApi;

  constructor(options: GovernanceCollaborationModuleOptions) {
    this.provenance = new GovernanceProvenance(options.errorFactory);
    this.repository = new GovernanceRepository(options.db);
    this.records = new GovernanceRecordStore(options.db, options.errorFactory);
    this.decisions = new GovernanceDecisionTransactions(options.db);
    this.eventDecisions = new GovernanceEventDecisions(
      options.db,
      options.now,
      options.errorFactory,
    );
    this.query = governanceQueries(this.repository);
  }
}

export { GovernanceError, type GovernanceErrorFactory } from "./errors.js";
export { GovernanceProvenance } from "./provenance.js";
export {
  json as governanceJson,
  mapGoalTreeProposal,
  mapGoalTreeProposalDecision,
  mapGoalTreeProposalItem,
  parseJson as parseGovernanceJson,
} from "./mappers.js";
export {
  GOVERNANCE_SCHEMA_SQL,
  createGovernanceSchema,
  type GovernanceSchemaDatabase,
} from "./schema.js";
export {
  GovernanceEventDecisions,
  GOAL_EVENT_TRUSTED_DECISIONS_SQL,
} from "./event-decisions.js";
export {
  GovernanceRepository,
  type GovernanceSqliteDatabase,
  type GovernanceSqliteStatement,
} from "./repository.js";
export {
  GovernanceRecordStore,
} from "./record-store.js";
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

export function createGovernanceReadServices(db: GovernanceSqliteDatabase): { query: GovernanceQueryApi } {
  return { query: governanceQueries(new GovernanceRepository(db)) };
}

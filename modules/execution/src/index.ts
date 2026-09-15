import type {
  ExecutionApplicationApi,
  ExecutionQueryApi,
} from "@molis-ai/molis-work-contracts/modules/execution";

import { ExecutionRepository, type ExecutionSqliteDatabase } from "./repository.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-module-execution",
  packagePath: "modules/execution",
  kind: "module",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/modules/execution",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-ex1", "goal-reorg-ex4"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "execution.query.v1",
    "execution.repository.v1",
  ],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export interface ExecutionModuleOptions {
  db: ExecutionSqliteDatabase;
}

export class ExecutionModule implements ExecutionApplicationApi {
  readonly repository: ExecutionRepository;
  readonly query: ExecutionQueryApi;

  constructor(options: ExecutionModuleOptions) {
    this.repository = new ExecutionRepository(options.db);
    this.query = executionQueries(this.repository);
  }
}

export { ExecutionError, type ExecutionErrorFactory } from "./errors.js";
export {
  migrateClarifierRoles,
  migrateExecutionActionColumns,
  migrateReviewerRunRoles,
  migrateUnifiedClaimRolesAndExclusivity,
  type ExecutionMigrationDatabase,
} from "./migrations.js";
export {
  EXECUTION_SCHEMA_SQL,
  ExecutionRepository,
  createExecutionSchema,
  mapExecutionClaim,
  mapExecutionRun,
  type ExecutionSqliteDatabase,
  type ExecutionSqliteStatement,
} from "./repository.js";

function executionQueries(repository: ExecutionRepository): ExecutionQueryApi {
  return {
      activeClaimCount: (boardId, at) => repository.activeClaimCount(boardId, at),
      nonterminalRunCount: boardId => repository.nonterminalRunCount(boardId),
      activeRunIdsForGoal: (...args) => repository.activeRunIdsForGoal(...args),
      listClaimsForGoal: (...args) => repository.listClaimsForGoal(...args),
      latestRunForGoal: (...args) => repository.latestRunForGoal(...args),
      latestClaimForGoal: (...args) => repository.latestClaimForGoal(...args),
      latestActiveRunForClaim: claimId => repository.latestActiveRunForClaim(claimId),
      activeClaimIdsForGoal: (...args) => repository.activeClaimIdsForGoal(...args),
      listLifecycleEvents: boardId => repository.listLifecycleEvents(boardId),
      getClaim: (boardId, claimId) => repository.getClaim(boardId, claimId),
      getRun: (boardId, runId) => repository.getRun(boardId, runId),
      getRunWithClaim: (boardId, runId) => repository.getRunWithClaim(boardId, runId),
      listClaims: (boardId) => repository.listClaims(boardId),
      listRuns: (boardId) => repository.listRuns(boardId),
      listNonterminalRuns: boardId => repository.listNonterminalRuns(boardId),
    };
}

export function createExecutionQueryApi(db: ExecutionSqliteDatabase): ExecutionQueryApi {
  return executionQueries(new ExecutionRepository(db));
}

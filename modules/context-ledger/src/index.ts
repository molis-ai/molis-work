import { ContextLedgerRepository, type ContextLedgerDatabase } from "./repository.js";
import { ContextLedgerService, type ContextLedgerOptions } from "./service.js";
export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-module-context-ledger",
  packagePath: "modules/context-ledger",
  kind: "module",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/modules/context-ledger",
  migrationGoals: ["goal-reorg-f2","goal-reorg-ar2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["context.edges.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export function createContextLedger(db: ContextLedgerDatabase, options: ContextLedgerOptions): ContextLedgerService {
  return new ContextLedgerService(new ContextLedgerRepository(db), options);
}

export { createContextLedgerSchema, type ContextLedgerDatabase } from "./repository.js";
export { ContextLedgerError, type ContextLedgerOptions } from "./service.js";
export { createContextMaterializer } from "./materialization.js";

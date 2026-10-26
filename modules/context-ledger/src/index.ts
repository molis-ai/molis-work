import { ContextLedgerRepository, type ContextLedgerDatabase } from "./repository.js";
import { ContextLedgerService, type ContextLedgerOptions } from "./service.js";
export function createContextLedger(db: ContextLedgerDatabase, options: ContextLedgerOptions): ContextLedgerService {
  return new ContextLedgerService(new ContextLedgerRepository(db, options.initializeSchema), options);
}

export { CONTEXT_LEDGER_SCHEMA, createContextLedgerSchema, type ContextLedgerDatabase } from "./repository.js";
export { type ContextLedgerOptions } from "./service.js";
export { createContextMaterializer } from "./materialization.js";

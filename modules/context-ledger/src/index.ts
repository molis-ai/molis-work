import { ContextLedgerRepository, type ContextLedgerDatabase } from "./repository.js";
import { ContextLedgerService, type ContextLedgerOptions } from "./service.js";
export function createContextLedger(db: ContextLedgerDatabase, options: ContextLedgerOptions): ContextLedgerService {
  return new ContextLedgerService(new ContextLedgerRepository(db, options.initializeSchema), options);
}

export { CONTEXT_LEDGER_SCHEMA, createContextLedgerSchema, rewriteStoredContextEdges, type ContextLedgerDatabase, type StoredContextEdge, type StoredContextEdgeChange } from "./repository.js";
export { contextEdgeQueryKeys, type ContextLedgerOptions } from "./service.js";
export { createContextMaterializer } from "./materialization.js";
export { relationEdgesReplicationDefinition, relationEdgesTriggerCondition } from './replication.js';
export {createContextHistoryReplication,type ContextHistoryReplicationOptions} from './history-replication.js';

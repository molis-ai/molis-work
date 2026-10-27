export { MemoryService, applies, characterOwner, SIGNAL_THRESHOLD,
  type MemoryBackendEntry, type MemoryBackendPort, type MemoryCaller, type MemoryServicePorts, type MemoryProposal, type MemoryLearned } from "./service.js";
export { memoryErrors, type MemoryErrorCode } from "./errors.js";
export { CANDIDATE_TTL_MS } from "./shapes.js";
export { MEMORY_GATE_POLICY, MEMORY_GATE_VERSION, MEMORY_GATE_RULE } from "./policy.js";
export { purgeProjectMemories, previewProjectMemoryPurge, applyProjectMemoryPurge, type ProjectMemoryPurgePlan } from "./purge-project.js";
export { readProjectMemoryPurgeLedgerFacts, projectMemoryPurgeLedger, type ProjectMemoryPurgeLedger, type ProjectMemoryPurgeFactsQuery, type ProjectMemoryPurgeLedgerFacts } from "./purge-project-ledger.js";
export { defaultPrefs, completePrefs, isCompletePrefs, consumerAccess, CONSUMER_LABELS, PLUGIN_DEFAULT_KINDS } from "./prefs.js";
export { memoryClassReadAllowed, memoryClassReadPossible, memoryClassFormationAllowed, type MemoryClassContext, type MemoryClassTarget } from "./class-restrictions.js";
export { recallKeywords, keywordScore, sameText, sameWords, looksLikeSecret, looksLikeInstruction } from "./text.js";
export { quotedFrom, theirWords } from "./spoken.js";
export { interpretMemoryLedgerRecoveryFact, resolveForgottenMemoryIdentity, type MemoryRecoveryObservation } from "./recovery-facts.js";
export { collectMemoryLedgerRecoveryObservations, type MemoryRecoverySourceReader, type MemoryRecoverySourceObservation } from "./recovery-source.js";

export { MemoryService, applies, characterOwner, SIGNAL_THRESHOLD,
  type MemoryBackendEntry, type MemoryBackendPort, type MemoryCaller, type MemoryServicePorts, type MemoryProposal, type MemoryLearned } from "./service.js";
export { memoryErrors, type MemoryErrorCode } from "./errors.js";
export type { MemoryForgettingPhase } from "./forgetting.js";
export { MEMORY_GATE_POLICY, MEMORY_GATE_VERSION, MEMORY_GATE_RULE } from "./policy.js";
export { purgeProjectMemories } from "./purge-project.js";
export { defaultPrefs, completePrefs, isCompletePrefs, consumerAccess, formationAllowed, CONSUMER_LABELS, PLUGIN_DEFAULT_KINDS, PLUGIN_PROJECT_DEFAULT_KINDS, pluginDefaultKinds } from "./prefs.js";
export { recallKeywords, keywordScore, sameText, sameWords, looksLikeSecret, looksLikeInstruction } from "./text.js";
export { quotedFrom, theirWords } from "./spoken.js";

export type { MemoryPageLimits } from "./management-pages.js";

export { memoryClassReadAllowed, memoryClassReadPossible, memoryClassFormationAllowed } from "./class-restrictions.js";
export { prepareMemoryRestoreRetention, applyMemoryRestoreRetention } from "./restore-retention.js";

export { MemoryService, applies, characterOwner, SIGNAL_THRESHOLD,
  type MemoryBackendEntry, type MemoryBackendPort, type MemoryCaller, type MemoryServicePorts, type MemoryProposal, type MemoryLearned } from "./service.js";
export { memoryErrors, type MemoryErrorCode } from "./errors.js";
export { MEMORY_GATE_POLICY, MEMORY_GATE_VERSION, MEMORY_GATE_RULE } from "./policy.js";
export { purgeProjectMemories } from "./purge-project.js";
export { defaultPrefs, completePrefs, isCompletePrefs, consumerAccess, CONSUMER_LABELS, PLUGIN_DEFAULT_KINDS } from "./prefs.js";
export { recallKeywords, keywordScore, sameText, sameWords, looksLikeSecret, looksLikeInstruction } from "./text.js";
export { quotedFrom, theirWords } from "./spoken.js";


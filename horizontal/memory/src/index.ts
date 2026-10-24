export { MemoryService, applies, characterOwner, SIGNAL_THRESHOLD,
  type MemoryBackendEntry, type MemoryBackendPort, type MemoryCaller, type MemoryServicePorts, type MemoryProposal, type MemoryLearned } from "./service.js";
export { memoryErrors, type MemoryErrorCode } from "./errors.js";
export { CANDIDATE_TTL_MS } from "./shapes.js";
export { MEMORY_GATE_POLICY, MEMORY_GATE_VERSION, MEMORY_GATE_RULE } from "./policy.js";
export { purgeProjectMemories } from "./purge-project.js";
export { defaultPrefs, completePrefs, isCompletePrefs, consumerAccess, CONSUMER_LABELS, PLUGIN_DEFAULT_KINDS } from "./prefs.js";
export { memoryClassReadAllowed, memoryClassReadPossible, memoryClassFormationAllowed, type MemoryClassContext, type MemoryClassTarget } from "./class-restrictions.js";
export { recallKeywords, keywordScore, sameText, sameWords, looksLikeSecret, looksLikeInstruction } from "./text.js";
export { quotedFrom, theirWords } from "./spoken.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-service-memory",
  packagePath: "horizontal/memory",
  kind: "horizontal",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/services/memory",
  migrationGoals: ["goal-reorg-f2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["memory.recall.v1", "memory.manage.v1"],
} as const;
export type MolisWorkPackageDescriptor = typeof packageDescriptor;

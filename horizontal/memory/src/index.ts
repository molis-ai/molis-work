export { MemoryService, MemoryError, applies, characterOwner, MEMORY_GATE_POLICY, MEMORY_GATE_VERSION, MEMORY_GATE_RULE, SIGNAL_THRESHOLD,
  type MemoryBackendEntry, type MemoryBackendPort, type MemoryCaller, type MemoryErrorCode, type MemoryServicePorts, type MemoryProposal, type MemoryLearned } from "./service.js";
export { purgeProjectMemories } from "./purge-project.js";
export { defaultPrefs, completePrefs, consumerAccess, CONSUMER_LABELS, PLUGIN_DEFAULT_KINDS } from "./prefs.js";
export { recallKeywords, keywordScore, sameText, looksLikeSecret, looksLikeInstruction } from "./text.js";

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

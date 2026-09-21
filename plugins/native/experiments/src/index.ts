export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-experiments", packagePath: "plugins/native/experiments", kind: "native-plugin", maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin", migrationGoals: ["goal-reorg-f2"], ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["experiments.ui-contribution.v1", "experiments.offline-comparison.v1"],
} as const;
export * from "./types.js";
export * from "./service.js";
export * from "./metrics.js";
export * from "./manifest.js";
export * from "./ui.js";
export * from "./client.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-issues", packagePath: "plugins/native/issues", kind: "native-plugin", maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin", migrationGoals: ["goal-reorg-f2", "goal-plugin-platform-v2"],
  ssot: "docs/SSOT-MATRIX.md", capabilities: ["issues.ui-contribution.v1"],
} as const;
export type MolisWorkPackageDescriptor = typeof packageDescriptor;
export * from "./store.js";
export * from "./actions.js";
export * from "./manifest.js";
export * from "./plugin.js";
export * from "./ui.js";
export * from "./client.js";
export * from "./methods.js";

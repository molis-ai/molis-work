export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-cgs",
  packagePath: "plugins/native/cgs",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-plugin-platform-v2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export { createCgsRuntimePlugin, cgsManifest, cgsPrompts, cgsMethods } from "@adeptify/cgs-work";

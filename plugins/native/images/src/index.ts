export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-images", packagePath: "plugins/native/images", kind: "native-plugin", maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin", migrationGoals: ["goal-reorg-f2"], ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["images.ui-contribution.v1", "images.generation.v1"],
} as const;
export * from "@molis-ai/molis-work-contracts/modules/images";
export * from "./manifest.js";
export * from "./service.js";
export * from "./error.js";
export * from "./ui.js";
export * from "./client.js";
export * from "./styles.js";
export * from "./en.js";
export * from "./routes.js";

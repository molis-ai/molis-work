export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-jelly", packagePath: "plugins/native/jelly", kind: "native-plugin", maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin", migrationGoals: ["goal-reorg-f2"], ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["jelly.ui-contribution.v1", "jelly.workspace.v1"],
} as const;
export * from "@molis-ai/molis-work-contracts/modules/jelly";
export * from "./manifest.js";
export * from "./ui.js";
export * from "./client.js";
export * from "./styles.js";
export * from "./en.js";
export * from "./calendar.js";
export * from "./store.js";
export * from "./content.js";
export * from "./markdown.js";
export * from "./import.js";
export * from "./error.js";
export * from "./routes.js";
export * from "./ai.js";
export * from "./mcp.js";
export * from "./actions.js";
export * from "./command-actions.js";
export * from "./service-actions.js";

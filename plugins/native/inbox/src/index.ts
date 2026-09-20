export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-inbox",
  packagePath: "plugins/native/inbox",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["inbox.ui-contribution.v1", "inbox.http-routes.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export * from "./ui.js";
export * from "./projection.js";
export * from "./routes.js";
export { createInboxRouteHandlers } from "./route-handlers.js";
export type { InboxRouteHandlerPorts, InboxJudgmentState, InboxJudgmentChoice } from "./route-handlers.js";
export { inboxRouteErrorResponse } from "./route-error.js";
export { INBOX_PLUGIN_ID, INBOX_PROJECT_PLUGIN_ID, inboxManifest } from "./manifest.js";

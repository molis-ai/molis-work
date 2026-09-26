export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-app-server",
  packagePath: "apps/server",
  kind: "app",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/app-host",
  migrationGoals: ["goal-reorg-f2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [],
} as const;

export { gatewayFactory } from "./gateway.js";
export { configureMemberActions } from "./admin-grants.js";
export { restoreWorkAssets, readRestoredAssets } from "./assets.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-im-ui", packagePath: "packages/im-ui",
  kind: "foundation", maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/services/im",
  migrationGoals: ["goal-reorg-f2"], ssot: "docs/SSOT-MATRIX.md",
} as const;
export { renderImPage } from "./page.js";
export { IM_STYLES } from "./styles.js";
export { IM_CLIENT_SCRIPT } from "./client.js";
export { renderImHostEntry, IM_HOST_STYLES, IM_HOST_SCRIPT } from "./host.js";

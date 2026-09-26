export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-text-stats",
  packagePath: "plugins/native/text-stats",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-plugin-platform-v2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["text-stats.ui-contribution.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export {
  TEXT_STATS_RECOVERY,
  TEXT_STATS_UNAVAILABLE,
  TEXT_STATS_WAITING,
  countCodePoints,
  countLines,
  projectTextStats,
  unavailableStats,
  waitingStats,
  type TextStatsInput,
  type TextStatsPhase,
  type TextStatsSource,
  type TextStatsView,
} from "./core.js";
export {
  TEXT_STATS_INPUT_PORT,
  TEXT_STATS_PLUGIN_ID,
  TEXT_STATS_PROJECT_PLUGIN_ID,
  textStatsManifest,
} from "./manifest.js";
export {
  TEXT_STATS_UI_CONTRIBUTION_ID,
  renderTextStats,
  textStatsUiContribution,
  textStatsUiDescriptor,
  type TextStatsUiModel,
  type TextStatsUiPrimitives,
} from "./ui.js";
export { createTextStatsPlugin, type TextStatsPluginPorts } from "./plugin.js";
export { textStatsActions, TEXT_STATS_ACTIONS } from "./actions.js";

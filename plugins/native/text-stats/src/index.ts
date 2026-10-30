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
export { TEXT_STATS_MESSAGES } from "./messages.js";
export { TEXT_STATS_CLIENT_FACTORY_SCRIPT } from "./client.js";
export { TEXT_STATS_STYLES } from "./styles.js";

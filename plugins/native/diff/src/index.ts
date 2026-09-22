export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-diff",
  packagePath: "plugins/native/diff",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-plugin-platform-v2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["diff.artifact-type.v1", "diff.ui-contribution.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export {
  DIFF_CHANGESET_SCHEMA_VERSION,
  DIFF_CHANGESET_TYPE,
  parseChangeSet,
  type ChangeSet,
  type ChangeSetSource,
} from "./changeset.js";
export {
  DIFF_STEP_BUDGET,
  alignSplitRows,
  compareTexts,
  joinLines,
  reconstructSides,
  splitLines,
  textDiffRow,
  type DiffLine,
  type DiffOp,
  type SplitPair,
  type TextDiff,
  type TextDiffRow,
} from "./text-diff.js";
export {
  UnifiedDiffError,
  countChangedLines,
  hunkRows,
  parseUnifiedDiff,
  type UnifiedHunk,
} from "./unified.js";
export {
  compareChangeSet,
  compareRunChangeSet,
  compareSnapshots,
  emptyDiff,
  recoveryMessage,
  waitingMessage,
  type DiffFileEntry,
  type DiffInputGroup,
  type DiffInputSnapshot,
  type DiffMode,
  type DiffPhase,
  type DiffSide,
  type DiffView,
} from "./comparison.js";
export {
  DIFF_AFTER_INPUT_PORT,
  DIFF_BEFORE_INPUT_PORT,
  DIFF_CHANGESET_GROUP,
  DIFF_CHANGESET_INPUT_PORT,
  DIFF_GIT_GROUP,
  DIFF_GIT_INPUT_PORT,
  DIFF_PLUGIN_ID,
  DIFF_PROJECT_PLUGIN_ID,
  DIFF_SNAPSHOTS_GROUP,
  diffManifest,
} from "./manifest.js";
export {
  DIFF_UI_CONTRIBUTION_ID,
  diffUiContribution,
  diffUiDescriptor,
  renderDiff,
  type DiffUiModel,
  type DiffUiPrimitives,
} from "./ui.js";
export { createDiffPlugin, type DiffPluginPorts } from "./plugin.js";

export { DIFF_STYLES } from "./styles.js";

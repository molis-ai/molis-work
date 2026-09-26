export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-git",
  packagePath: "plugins/native/git",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-plugin-platform-v2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["git.artifact-types.v1", "git.ui-contribution.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export {
  GitStatusError,
  headLabel,
  parsePorcelainStatus,
  type GitChange,
  type GitEntryState,
  type GitHead,
  type GitStatus,
  type GitUpstream,
  type PorcelainInput,
} from "./status.js";
export {
  projectGit,
  type GitListItem,
  type GitListKind,
  type GitPhase,
  type GitProjectionInput,
  type GitView,
} from "./projection.js";
export {
  EMPTY_DRAFT,
  conflictKey,
  draftIsEmpty,
  parseStoredDrafts,
  serializeStoredDrafts,
  type GitDraft,
  type StoredDrafts,
} from "./drafts.js";
export {
  projectAcceptance,
  type AcceptanceBlock,
  type AcceptanceInput,
  type AcceptanceView,
} from "./acceptance.js";
export {
  GIT_RESULT_SCHEMA_VERSION,
  GIT_RESULT_TYPE,
  mayHaveChangedFiles,
  parseGitResult,
  type GitOperationResult,
  type GitResultOutcome,
} from "./result.js";
export {
  GIT_FILE_CHANGED_EVENT,
  gitEventTypes,
  parseGitFileChanged,
  type GitFileChanged,
} from "./events.js";
export {
  GIT_CHANGESET_OUTPUT_PORT,
  GIT_PLUGIN_ID,
  GIT_PROJECT_PLUGIN_ID,
  GIT_RESULT_OUTPUT_PORT,
  GIT_RUN_CHANGESET_INPUT_PORT,
  GIT_WORKSPACE_INPUT_PORT,
  GIT_WORKSPACE_SOURCE,
  gitManifest,
} from "./manifest.js";
export {
  GIT_UI_CONTRIBUTION_ID,
  gitUiContribution,
  gitUiDescriptor,
  renderGitChanges,
  type GitUiModel,
  type GitUiPrimitives,
} from "./ui.js";
export { createGitPlugin, type GitPluginPorts } from "./plugin.js";
export { renderGitBrowserDirectory, renderGitBrowserResult } from "./ui.js";
export { GIT_CLIENT_FACTORY_SCRIPT } from "./client.js";
export { GIT_STYLES } from "./styles.js";

export { gitActions, GIT_ACTIONS } from "./action-definitions.js";

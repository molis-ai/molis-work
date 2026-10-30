export {
  headLabel,
  projectGit,
  type GitListItem,
  type GitListKind,
  type GitPhase,
  type GitProjectionInput,
  type GitUpstream,
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
export { GIT_MESSAGES } from "./messages.js";
export { GIT_SENTENCE_TABLE, sayHostSentence, sayUpstream } from "./sentences.js";
export { GIT_STYLES } from "./styles.js";

export { gitActions, GIT_ACTIONS } from "./action-definitions.js";

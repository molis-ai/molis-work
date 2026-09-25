export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-files",
  packagePath: "plugins/native/files",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-plugin-platform-v2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["files.artifact-types.v1", "files.ui-contribution.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export {
  FILE_PATH_MAX_SEGMENTS,
  FILE_SEGMENT_MAX_LENGTH,
  FilePathError,
  parseFilePath,
  pathKey,
  pathLabel,
  samePath,
} from "./paths.js";
export {
  FILE_SNAPSHOT_MAX_INLINE_BYTES,
  FILE_SNAPSHOT_SCHEMA_VERSION,
  FILE_SNAPSHOT_TYPE,
  fileSnapshotFitsInline,
  fileSnapshotInlineBytes,
  parseFileSnapshot,
  snapshotLabel,
  type FileSnapshot,
  type FileSnapshotWorkspaceRef,
} from "./snapshot.js";
export {
  FILE_TEXT_SELECTION_SCHEMA_VERSION,
  FILE_TEXT_SELECTION_TYPE,
  parseFileTextSelection,
  parseTextSelectionRange,
  selectionCitationLabel,
  type FileTextSelection,
} from "./selection.js";
export {
  FILES_COLLECTION_SCHEMA_VERSION,
  FILES_COLLECTION_TYPE,
  parseFilesCollection,
  type FilesCollection,
  type FilesCollectionAccess,
} from "./collection.js";
export {
  entryAt,
  projectFileTree,
  pruneExpanded,
  toggleExpanded,
  type DirectoryEntry,
  type DirectoryListing,
  type FileEntryKind,
  type FileTreeInput,
  type FileTreeNode,
} from "./tree.js";
export {
  PREVIEW_SELECT_HINT,
  PREVIEW_WAITING_HINT,
  capturable,
  previewFrom,
  previewMessage,
  type FilePreview,
  type TextFileReadResult,
} from "./preview.js";
export {
  READING_POSITION_KEY,
  parseReadingPosition,
  positionApplies,
  serializeReadingPosition,
  type ReadingPosition,
} from "./position.js";
export {
  CODING_FILE_CHANGED_EVENT,
  CODING_WORKSPACE_INVALIDATED_EVENT,
  GIT_FILE_CHANGED_EVENT,
} from "./events.js";
export {
  FILES_AFTER_OUTPUT_PORT,
  FILES_BEFORE_OUTPUT_PORT,
  FILES_COLLECTION_OUTPUT_PORT,
  FILES_PLUGIN_ID,
  FILES_PROJECT_PLUGIN_ID,
  FILES_SELECTION_OUTPUT_PORT,
  FILES_WORKSPACE_INPUT_PORT,
  FILES_WORKSPACE_SOURCE,
  filesManifest,
} from "./manifest.js";
export {
  FILES_UI_CONTRIBUTION_ID,
  filesUiContribution,
  filesUiDescriptor,
  renderFilesReader,
  renderFilesTree,
  renderFilesBrowserDirectory,
  renderFilesBrowserResult,
  type FilesUiModel,
  type FilesUiPrimitives,
} from "./ui.js";
export { createFilesPlugin, type FilesPluginPorts } from "./plugin.js";
export { FILES_CLIENT_FACTORY_SCRIPT } from "./client.js";
export { FILES_STYLES } from "./styles.js";

export { filesActions, FILES_ACTIONS } from "./actions.js";

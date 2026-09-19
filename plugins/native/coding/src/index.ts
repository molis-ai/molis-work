export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-coding",
  packagePath: "plugins/native/coding",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-plugin-platform-v2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["coding.artifact-types.v1", "coding.ui-contribution.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export {
  CODING_PLUGIN_ID,
  CODING_PROJECT_PLUGIN_ID,
  codingManifest,
} from "./manifest.js";
export {
  CODING_DIRECTORY_FACES,
  CODING_SETTINGS_UI_CONTRIBUTION_ID,
  CODING_UI_CONTRIBUTION_ID,
  codingUiContribution,
  codingUiDescriptor,
  renderCodingDirectory,
  renderCodingWorkbench,
  type CodingDirectoryFace,
  type CodingUiModel,
  type CodingUiPrimitives,
  type CodingUiSurface,
} from "./ui.js";
export {
  CODING_ARTIFACT_TYPES,
  CODING_CHANGESET_TYPE,
  CODING_DIAGRAM_TYPE,
  CODING_REPORT_TYPE,
  CodingDiagramError,
  inspectDiagram,
  type CodingArtifactType,
  type CodingChangeScope,
  type CodingChangeSet,
  type CodingDiagram,
  type CodingDiagramEdge,
  type CodingDiagramNode,
  type CodingFileChange,
  type CodingFileChangeKind,
  type CodingReport,
} from "./artifacts.js";
export {
  filterSessions,
  groupByGoal,
  needsYou,
  toolAvailability,
  type CodingDirectoryFilter,
  type CodingSessionEntry,
  type CodingSessionGroup,
  type CodingSessionState,
  type CodingToolAvailability,
  type CodingToolInput,
  type CodingToolPage,
} from "./projection.js";
export {
  CodingSessionStore,
  CodingStoreError,
  migrateCodingSessions,
  toDirectoryEntries,
  type CodingSessionRecord,
  type CodingSqliteDatabase,
  type CreateCodingSessionInput,
} from "./store.js";
export {
  CODING_READER_ROLE,
  CODING_WRITER_ROLE,
  codingAgentManifest,
  codingPrompts,
} from "./roles.js";

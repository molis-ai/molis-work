export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-workspace",
  packagePath: "plugins/native/workspace",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-plugin-platform-v2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["workspace.artifact-type.v1", "workspace.ui-contribution.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export {
  WORKSPACE_HANDLE_MAX_LENGTH,
  WORKSPACE_NAME_MAX_LENGTH,
  WORKSPACE_REF_SCHEMA_VERSION,
  WORKSPACE_REF_TYPE,
  WorkspaceArtifactError,
  isOpaqueHandle,
  parseWorkspaceRef,
  workspaceScopeKey,
  type WorkspaceRef,
} from "./artifact.js";
export {
  WORKSPACE_SELECTED_EVENT,
  parseWorkspaceSelected,
  workspaceEventTypes,
  type WorkspaceSelected,
} from "./events.js";
export {
  projectWorkspace,
  type WorkspaceCandidate,
  type WorkspacePhase,
  type WorkspaceSelectionInput,
  type WorkspaceSelectionView,
} from "./selection.js";
export {
  WORKSPACE_OUTPUT_PORT,
  WORKSPACE_PLUGIN_ID,
  WORKSPACE_PROJECT_PLUGIN_ID,
  workspaceManifest,
} from "./manifest.js";
export {
  WORKSPACE_UI_CONTRIBUTION_ID,
  renderWorkspaceSource,
  workspaceUiContribution,
  workspaceUiDescriptor,
  type WorkspaceUiModel,
  type WorkspaceUiPrimitives,
} from "./ui.js";
export { createWorkspacePlugin, type WorkspacePluginPorts } from "./plugin.js";

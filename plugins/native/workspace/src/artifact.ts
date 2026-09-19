/**
 * Workspace's own Artifact type lives in Contracts.
 *
 * Files, Diff and Git all consume it, and a Plugin may not import another
 * Plugin — so the shape is a Contract and this module is the place that names
 * it as Workspace's. Re-exporting keeps the Plugin's own surface readable
 * without giving it a second, divergent definition.
 */
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
} from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

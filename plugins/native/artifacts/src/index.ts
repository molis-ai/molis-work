export { artifactReferenceUiContribution, ARTIFACT_REFERENCE_UI_CONTRIBUTION_ID, isProjectReference } from "./reference-ui.js";
export type { ArtifactReferenceUiPrimitives, ArtifactReferenceUiModel } from "./reference-ui.js";
export { artifactBrowserUiContribution, ARTIFACT_BROWSER_UI_CONTRIBUTION_ID } from "./browser-ui.js";
export type { ArtifactBrowserUiModel } from "./browser-ui.js";
export { artifactsProjectData, ARTIFACTS_HOME_STORE } from "./original-store.js";
export { artifactVersionPath, type ArtifactBrowserView, type GoalArtifactEmbed } from "./browser-view.js";
export { ARTIFACT_EN } from "./en.js";
export { ARTIFACT_GOAL_INPUT_CLIENT_SCRIPT } from "./goal-input-client.js";
export { ARTIFACT_WORKS_CLIENT_SCRIPT } from "./works-client.js";
export { ARTIFACT_HANDOFF_CLIENT_SCRIPT } from "./handoff-client.js";
export { ARTIFACT_PORT_INPUT_CLIENT_SCRIPT } from "./port-input-ui.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-artifacts",
  packagePath: "plugins/native/artifacts",
  kind: "native-plugin",
  maturity: "production",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-ar1", "goal-reorg-ar3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["artifacts.project-reference.v1", "artifacts.browser.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;
export { ARTIFACTS_PLUGIN_ID, ARTIFACTS_PROJECT_PLUGIN_ID, artifactsManifest } from "./manifest.js";
export { artifactsActions, ARTIFACT_ACTIONS, ARTIFACT_ACTION_PERMISSIONS } from "./actions.js";
export type { ArtifactFileImport, ArtifactExternalImport, ArtifactImportResult, ArtifactPluginInput } from "./actions.js";

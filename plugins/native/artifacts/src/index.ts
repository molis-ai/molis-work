export { openArtifactProjectReference, ArtifactProjectReferenceError } from "./project-reference.js";
export type { ArtifactProjectReferencePorts } from "./project-reference.js";
export { artifactReferenceUiContribution, ARTIFACT_REFERENCE_UI_CONTRIBUTION_ID, isProjectReference } from "./reference-ui.js";
export type { ArtifactReferenceUiPrimitives, ArtifactReferenceUiModel } from "./reference-ui.js";
export { readArtifactBrowser, matchArtifactBrowserRoute, exportArtifactVersion, artifactVersionPath, artifactDisplayTitle, ArtifactBrowserError } from "./browser.js";
export type { ArtifactBrowserView, ArtifactBrowserRoute } from "./browser.js";
export { requireArtifactAnalysisRecord, artifactAnalysisContext } from "./browser.js";
export { artifactBrowserUiContribution, ARTIFACT_BROWSER_UI_CONTRIBUTION_ID } from "./browser-ui.js";
export type { ArtifactBrowserUiModel } from "./browser-ui.js";
export { ARTIFACT_EN } from "./en.js";
export { importArtifactDocument, ArtifactImportError, DOCUMENT_ARTIFACT_TYPE, DOCUMENT_IMPORT_MAX_BYTES, EXTERNAL_DOCUMENT_SOURCES } from "./document-import.js";
export type { ArtifactDocumentImportPorts, ImportedArtifactDocument, ExternalDocumentSource } from "./document-import.js";
export { renderArtifactImportSurface, ARTIFACT_IMPORT_STYLES } from "./import-ui.js";
export type { ArtifactImportUiModel } from "./import-ui.js";
export { ARTIFACT_IMPORT_CLIENT_SCRIPT } from "./import-client.js";
export { createPluginArtifactClient, PluginArtifactAccessError } from "./plugin-client.js";
export { readGoalArtifactEmbeds, type GoalArtifactEmbed } from "./goal-context.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-artifacts",
  packagePath: "plugins/native/artifacts",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-ar1", "goal-reorg-ar3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["artifacts.project-reference.v1", "artifacts.browser.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;
export { ARTIFACTS_PLUGIN_ID, ARTIFACTS_PROJECT_PLUGIN_ID, artifactsManifest } from "./manifest.js";
export { artifactsActions, ARTIFACT_ACTIONS, ARTIFACT_ACTION_PERMISSIONS, createArtifactActionHandlers } from "./actions.js";
export type { ArtifactActionPorts, ArtifactFileImport, ArtifactExternalImport, ArtifactImportResult } from "./actions.js";

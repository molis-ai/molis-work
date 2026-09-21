export { installMolisWorkHome } from "./installer/home.js";
export { MolisWorkHomeInstallError } from "./installer/home-contract.js";
export type { MolisWorkHomeInstallOptions, MolisWorkHomeInstallResult, MolisWorkHomeInstallStatus, MolisWorkHomeInstallStep } from "./installer/home-contract.js";
export { computeBuildSourceDigest, writeMolisWorkBuildManifest, digestPaths } from "./installer/fingerprint.js";
export type { MolisWorkBuildManifest } from "./installer/fingerprint.js";
export { RuntimeIntegrationService } from "./installer/runtime-integration.js";
export { RuntimeIntegrationError, SUPPORTED_RUNTIME_IDS, isSupportedRuntimeId } from "./installer/runtime-integration-contract.js";
export type { SupportedRuntimeId, RuntimeIntegrationAction, RuntimeConnectionState, RuntimeIntegrationDetection, RuntimeIntegrationChange, RuntimeIntegrationPlan, RuntimeIntegrationConfirmation, RuntimeIntegrationResultStatus, RuntimeIntegrationResult, RuntimeIntegrationValidationContext, RuntimeIntegrationServiceOptions } from "./installer/runtime-integration-contract.js";
export { runtimeGoalTreeDecisionAuthority } from "./runtime-decision.js";
export { openWorkSessionRegistry } from "./session-registry.js";
export { RuntimeSessionHost } from "./runtime-session.js";
export { RuntimeProjectConnection } from "./runtime-project-connection.js";
export { createRuntimePanelSessionLinker } from "./runtime-panel-session.js";
export { runtimeContextHostFromEnvironment, runtimeSessionHostSignalsFromEnvironment, sessionSignalsForHost } from "./runtime-context.js";
export type { MolisWorkRuntimeContextHost } from "./runtime-context.js";
export { prepareLocalProjectStorage } from "./project-storage.js";
export { PluginHostExecutor } from "./plugin-executor.js";
export { createPluginPlatform } from "./plugin-platform.js";
export type { PluginPlatform, PluginPlatformDatabase, PluginPlatformOptions } from "./plugin-platform.js";
export type { PluginHostExecutorOptions } from "./plugin-executor.js";
export { runPluginDevelopment } from "./plugin-development.js";
export type { LocalProjectStoragePreparation } from "./project-storage.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-app-local-host",
  packagePath: "apps/local-host",
  kind: "app",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/app-host",
  migrationGoals: ["goal-reorg-f2","goal-reorg-ap2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["local-host.client.v1", "local-host.single-writer.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export * from "./local-host.js";
export { MolisWorkWebServiceManager } from "./installer/web-service.js";
export { MolisWorkWebServiceError, type MolisWorkWebServiceAction, type MolisWorkWebServiceState, type MolisWorkWebServiceDetection, type MolisWorkWebServicePlan, type MolisWorkWebServiceResult, type MolisWorkWebServiceManagerOptions } from "./installer/web-service-contract.js";
export { MolisWorkUninstallService } from "./installer/uninstall.js";
export { MolisWorkUninstallError, type MolisWorkUninstallPlan, type MolisWorkUninstallResult, type MolisWorkUninstallServiceOptions, type MolisWorkUninstallChange, type UninstallProjectAccess } from "./installer/uninstall-contract.js";
export { resolveWebControlToken, WEB_CONTROL_TOKEN_RELATIVE_PATH } from "./web-control-token.js";
export { createMolisWorkRuntimePayload, type MolisWorkRuntimePayloadOptions } from "./installer/runtime-payload.js";
export { createMolisWorkNpmPackageDirectory } from "./installer/npm-package.js";
export { readPersonalPlanningMethodPacks } from "./personal-planning-methods.js";

export { migrateLocalProjectDatabase } from "./project-migrations.js";
export { migrateFeedTables, migrateInfoflowContractV2 } from "./feed-migrations.js";

export { LocalProjectDatabase } from "./project-database.js";

export * from "./goal-project-application.js";

export * from "./web-locale.js";

export { createLocalHostWorkbenchRenderer } from "./workbench-renderer.js";

export { CATALOG_SCHEMA_VERSION, CATALOG_OWNER, isOwnedCatalogOwner, MolisWorkProjectCatalogError, catalogSchemaCompatibilityError, type MolisWorkProjectCatalogErrorDetails } from "./project-catalog-contract.js";
export { initializeProjectDatabase, readManagedBoard, validateManagedBoard, assertProjectHasNoActiveWork } from "./managed-project-database.js";

export { ManagedProjectFiles } from "./managed-project-files.js";
export { ManagedProjectDeletion, type ProjectDeletionCleanupPorts } from "./managed-project-deletion.js";
export { DemoProjectLifecycle, type DemoProjectSeedPort } from "./demo-project-lifecycle.js";
export { exists } from "./project-file-paths.js";
export type { CreateMolisWorkProjectInput, ManageMolisWorkDemoProjectInput, MolisWorkDemoProjectResult } from "./project-catalog-contract.js";

export { initializeCatalog, assertOwnedCatalog, migrateCatalog, type CatalogDesktopSchema } from "./catalog-migrations.js";

export * from "./project-catalog.js";
export { seedDemoBoard, DEMO_BOARD_ID } from "./demo-seed.js";
export {
  seedDemoPluginSurfaces,
  seedDemoProjectExtras,
  enableDemoProjectPlugins,
  DEMO_GITHUB_SOURCE_ID,
  DEMO_GMAIL_SOURCE_ID,
  DEMO_CORE_ARTIFACT_ID,
} from "./demo-plugin-seed.js";

export { hydrateFeedItemContent, hydrateFeedSnapshotContent } from "./feed-content.js";

export { createLocalFeedApplication, withLocalFeedJudgments } from "./feed-application.js";
export { assembleHostBehaviorCatalog, hostAllowedBehaviorIds, liveHostAllowedBehaviorIds, liveHostBehaviorCatalog, liveHostFunctionAuthoringCatalog, SYSTEM_BEHAVIORS } from "./behavior-catalog.js";
export { createFunctionsJudgmentPort, withFunctionsService, readFunctionScenesView } from "./functions-host.js";

export { createFeedSourceRuntime, type FeedSourceRuntime } from "./feed-source-runtime.js";
export { createIntelligenceCollectAdapter, type IntelligenceCollectRequest, type IntelligenceCollectResult, type IntelligenceCollectAdapter } from "./feed-intelligence-client.js";

export { createLocalFeedSourceService, listFeedSourceCatalog } from "./feed-source-service.js";
export type { FeedSourceService, RegisterFeedSourceInput, UpdateFeedSourceInput, ConfigureFeedSourceScheduleInput, FeedSourceSyncResult, FeedSourceCatalogView } from "@molis-ai/molis-work-plugin-feed";

export * from "./connector-credentials.js";
export * from "./github-oauth.js";

export * from "./gmail-oauth.js";

export { createGithubConnector } from "./github-connector.js";
export { createGmailConnector } from "./gmail-connector.js";
export { createCatalogConnector } from "./catalog-connector.js";
export { OfficialIntegrationRegistry, type OfficialProviderFactory } from "./official-integrations.js";

export { createLocalFeedConnectorSync } from "./feed-connector-sync.js";

export { createLocalFeedConnectorService } from "./feed-connector-service.js";

export { createLocalFeedSourceScheduler } from "./feed-source-scheduler.js";

export { createLocalFeedGoalPromotion } from "./feed-goal-promotion.js";

export { handleFeedNativePluginHttp, type FeedNativePluginHttpOptions } from "./feed-native-plugin-http.js";
export { handleInboxNativePluginHttp, type InboxNativePluginHttpOptions } from "./inbox-native-plugin-http.js";
export { handleHomeDockJudgmentHttp, type HomeDockHttpOptions } from "./home-dock-http.js";
export { handleScheduleNativePluginHttp, type ScheduleNativePluginHttpOptions } from "./schedule-native-plugin-http.js";
export { handleShelfNativePluginHttp } from "./shelf-native-plugin-http.js";
export { handleFunctionsNativePluginHttp } from "./functions-native-plugin-http.js";
export { handleFormNativePluginHttp } from "./form-native-plugin-http.js";
export { handlePagesNativePluginHttp } from "./pages-native-plugin-http.js";
export { handleDatasetNativePluginHttp } from "./dataset-native-plugin-http.js";
export { handlePptNativePluginHttp } from "./ppt-native-plugin-http.js";
export { handleLingguangNativePluginHttp } from "./lingguang-native-plugin-http.js";

export { createLocalArtifactHttp, renderGoalArtifactContext } from "./artifact-native-plugin-http.js";

export * from "./onboarding.js";

export { createLocalHostCapsule } from "./capsule.js";

export { attachMolisWorkPtySocket, type MolisWorkPtySocketHandlers } from "./pty-socket.js";

export { buildMolisWorkWebView, cachedMolisWorkWebView, type MolisWorkWebViewCache, type WebViewOptions } from "./web-view.js";
export { rewriteNativePluginApiPath, withRewrittenPluginApi } from "./native-plugin-api.js";
export { hostCompleteText, type HostCompleteText } from "./host-complete-text.js";
export { bindScheduledTaskRunner, scheduleServiceFor, scheduleViewFingerprint } from "./schedule-runtime.js";
export { createHostScheduledTaskRunner } from "./schedule-task-runner.js";

export { sendLocalWebJson, readLocalWebBody, authorizeLocalWebRequest, type LocalMutationState } from "./web-http.js";
export { createLocalWebAssets } from "./web-assets.js";

export * from "./web-session.js";
export { reconcileLegacySessionCatalog } from "./session-migration.js";
export { handleLocalRuntimeSettingsHttp, serviceProcessId } from "./web-runtime-settings.js";
export { handleLocalMcpSettingsHttp } from "./web-mcp-settings.js";
export { assembleMcpCatalog, findAssembledMcpTool, listMcpSettingsEntries } from "./mcp-catalog.js";
export {
  createNativeMcpPluginAdapters,
  dispatchNativeMcpPluginTool,
  nativeMcpPluginSources,
} from "./mcp-native-plugins.js";
export { readMcpToolPreference, writeMcpToolPreference } from "./mcp-settings-store.js";
export * from "./web-project-settings.js";
export * from "./web-project-presentation.js";
export { importV3Board } from "./board-v3-import.js";
export * from "./project-host.js";
export { importV3Capability, projectResumeFactsCapability, trashedGoalsCapability, initializeBoardCapability, snapshotBoardCapability, createGoalCapability, createGoalIntentCapability } from "@molis-ai/molis-work-plugin-goals";
export type { CreateGoalCapabilityInput, ImportV3CapabilityInput } from "@molis-ai/molis-work-plugin-goals";
export { runLocalPluginDevelopment } from "./local-plugin-development.js";
export { createLocalOnboardingHttp } from "./web-onboarding.js";
export { createLocalPanelHttp } from "./web-panel.js";
export { createLocalWorkSessionHttp } from "./web-work-session.js";
export { handleLocalProjectReferenceHttp } from "./web-project-reference.js";
export { createLocalPlanningHttp } from "./web-planning.js";
export { createLocalGoalsReadHttp } from "./web-goals-read.js";
export { createLocalWebServerFactory } from "./web-server.js";
export type { WebServerOptions } from "./web-types.js";
export type { LocalWebPlatform } from "./web-composition.js";
export { createLocalUninstallService } from "./local-uninstall.js";
export { LocalMcpServer } from "./mcp-server.js";
export type { MolisWorkMcpAudience, MolisWorkMcpToolCallContext } from "./mcp-server.js";
export { runV1Cli } from "./cli-project.js";
export type { V1CliOptions } from "./cli-project.js";
export { runLocalCli } from "./cli-host.js";
export type { LocalCliOptions } from "./cli-host.js";
export {
  DIRECTORY_ENTRY_LIMIT,
  TEXT_FILE_MAX_BYTES,
  listWorkspaceDirectory,
  readWorkspaceTextFile,
  type WorkspaceReadPorts,
} from "./workspace-files.js";
export {
  GIT_STATUS_MAX_BUFFER,
  isGitRepository,
  readGitStatus,
  type GitStatusResult,
} from "./git-status.js";
export {
  ModelProviderError,
  ModelProviderStore,
  addPromptCacheColumn,
  createModelProviderTables,
  modelCredentialRef,
  type ModelProviderSqlite,
  type ModelProviderStoreOptions,
  type ModelSecretPort,
} from "./model-provider-store.js";
export {
  composeAgentHost,
  workspaceRefFor,
  type WorkspaceLookupPorts,
  type AgentHostComposition,
  type AgentHostCompositionOptions,
} from "./agent-host-composition.js";
export { handleAgentReviewHttp, type AgentReviewHttpPorts } from "./agent-review-http.js";
export {
  codingDirectoryPanel,
  diffStagePanel,
  filesDirectoryPanel,
  gitDirectoryPanel,
  releaseCodingSurface,
  workspaceDirectoryPanel,
  type CodingSurfacePorts,
} from "./coding-surface.js";
export { createGitWorktreePort, GitWorktreeError, type GitWorktreePort } from "./git-worktrees.js";

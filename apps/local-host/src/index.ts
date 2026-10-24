export { installMolisWorkHome } from "./installer/home.js";

export type { MolisWorkHomeInstallOptions, MolisWorkHomeInstallResult, MolisWorkHomeInstallStatus, MolisWorkHomeInstallStep } from "./installer/home-contract.js";
export { computeBuildSourceDigest, writeMolisWorkBuildManifest, digestPaths } from "./installer/fingerprint.js";
export type { MolisWorkBuildManifest } from "./installer/fingerprint.js";
export { RuntimeIntegrationService } from "./installer/runtime-integration.js";
export { SUPPORTED_RUNTIME_IDS, isSupportedRuntimeId } from "./installer/runtime-integration-contract.js";
export type { SupportedRuntimeId, RuntimeIntegrationAction, RuntimeConnectionState, RuntimeIntegrationDetection, RuntimeIntegrationChange, RuntimeIntegrationPlan, RuntimeIntegrationConfirmation, RuntimeIntegrationResultStatus, RuntimeIntegrationResult, RuntimeIntegrationValidationContext, RuntimeIntegrationServiceOptions } from "./installer/runtime-integration-contract.js";
export { RuntimeProjectConnection } from "./runtime-project-connection.js";
export { createRuntimePanelSessionLinker } from "./runtime-panel-session.js";
export { runtimeContextHostFromEnvironment, runtimeSessionHostSignalsFromEnvironment } from "./runtime-context.js";
export type { MolisWorkRuntimeContextHost } from "./runtime-context.js";
export { prepareLocalProjectStorage } from "./project-storage.js";
export { PluginHostExecutor } from "./plugin-executor.js";
export { HomePluginHost, type HomePluginEntry, type HomePluginPlatform } from "./home-plugins.js";
export { handleCharactersHttp, type CharactersInvoke } from "./characters-http.js";
export { charactersProvider, type CharactersProject } from "./characters-host.js";
export { collectHomeAggregate, homeAggregatePorts, type HomeAggregateAnswer, type HomeAggregateIssue, type HomeAggregatePorts, type HomeAggregateResult } from "./home-aggregate.js";
export { openPluginDatabase } from "./plugin-database.js";
export { openPluginProjectLibrary, type ProjectLibrary } from "./plugin-project-library.js";
export { createPluginPlatform } from "./plugin-platform.js";
export { dispatchDeclaredPluginRoutes, type DeclaredPluginRoutes } from "./plugin-route-operations.js";
export { bindDeclaredDefaults } from "./plugin-default-bindings.js";
export { homeStores } from "./home-stores.js";
export { readMaterialLocalPage } from "./material-local-page.js";
export { isHostEndpointPort, trackHostChildEndpoint, trackHostPort } from "./host-endpoints.js";
export { ORIGINAL_FILE_MAX_BYTES, readOriginalFile, registerOriginalFile, releaseOriginalFile } from "./material-original-files.js";
export type { PluginPlatform, PluginPlatformDatabase, PluginPlatformEntry, PluginPlatformOptions } from "./plugin-platform.js";
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
export { type MolisWorkWebServiceAction, type MolisWorkWebServiceState, type MolisWorkWebServiceDetection, type MolisWorkWebServicePlan, type MolisWorkWebServiceResult, type MolisWorkWebServiceManagerOptions } from "./installer/web-service-contract.js";
export { MolisWorkUninstallService } from "./installer/uninstall.js";
export { type MolisWorkUninstallPlan, type MolisWorkUninstallResult, type MolisWorkUninstallServiceOptions, type MolisWorkUninstallChange, type UninstallProjectAccess } from "./installer/uninstall-contract.js";
export { resolveWebControlToken, WEB_CONTROL_TOKEN_RELATIVE_PATH } from "./web-control-token.js";
export { createMolisWorkRuntimePayload, type MolisWorkRuntimePayloadOptions } from "./installer/runtime-payload.js";
export { createMolisWorkNpmPackageDirectory } from "./installer/npm-package.js";
export { readPersonalPlanningMethodPacks } from "./personal-planning-methods.js";


export { LocalProjectDatabase } from "./project-database.js";
export { isProjectPluginDatabaseRefusal, openProjectPluginDatabases } from "./project-plugin-databases.js";
export { PROJECT_DATABASE_BASELINE } from "./project-database-schema.js";

export * from "./goal-project-application.js";
export { openProjectVersionStores, type ProjectVersionStores } from "./project-version-stores.js";

export * from "./web-locale.js";

export { createLocalHostWorkbenchRenderer } from "./workbench-renderer.js";

export { CATALOG_SCHEMA_VERSION, CATALOG_OWNER, isOwnedCatalogOwner, catalogSchemaCompatibilityError } from "./project-catalog-contract.js";
export { initializeProjectDatabase, validateManagedProject } from "./managed-project-database.js";

export { ManagedProjectFiles } from "./managed-project-files.js";
export { ManagedProjectDeletion, type ProjectDeletionCleanupPorts } from "./managed-project-deletion.js";
export { ProjectDeletionService, type ProjectDeletionPorts } from "./project-deletion-service.js";
export { ProjectDeletedHooks, projectDeletedHooksFor, type ProjectDeletedOwner, type ProjectDeletedPort } from "./project-deleted-hooks.js";
export { DemoProjectLifecycle, type DemoProjectSeedPort } from "./demo-project-lifecycle.js";
export { exists } from "./project-file-paths.js";
export type { CreateMolisWorkProjectInput, ManageMolisWorkDemoProjectInput, MolisWorkDemoProjectResult } from "./project-catalog-contract.js";

export { initializeCatalog, assertOwnedCatalog, assertCurrentCatalog, type CatalogDesktopSchema } from "./catalog-schema.js";

export * from "./project-catalog.js";
export { seedDemoBoard, DEMO_PROJECT_ID } from "./demo-seed.js";
export {
  seedDemoPluginSurfaces,
  seedDemoHomeSamples,
  enableDemoProjectPlugins,
  DEMO_GITHUB_SOURCE_ID,
  DEMO_GMAIL_SOURCE_ID,
  DEMO_CORE_ARTIFACT_ID,
} from "./demo-plugin-seed.js";

export { hydrateFeedItemContent, hydrateFeedSnapshotContent } from "./feed-content.js";

export { createLocalFeedApplication } from "./feed-application.js";
export { liveHostFunctionAuthoringCatalog } from "./behavior-catalog.js";
export { withFunctionsService } from "./functions-host.js";

export { createFeedSourceRuntime, type FeedSourceRuntime } from "./feed-source-runtime.js";
export { createIntelligenceCollectAdapter, type IntelligenceCollectRequest, type IntelligenceCollectResult, type IntelligenceCollectAdapter } from "./search-intelligence-client.js";

export { createLocalFeedSourceService, listFeedSourceCatalog } from "./feed-source-service.js";
export type { FeedSourceService, RegisterFeedSourceInput, UpdateFeedSourceInput, ConfigureFeedSourceScheduleInput, FeedSourceSyncResult, FeedSourceCatalogView } from "@molis-ai/molis-work-plugin-feed";

export { withConnectorConnections } from "./connector-connection-store.js";
export { connectLocalMcp } from "./connector-local-mcp-setup.js";
export { installManagedConnectorTool, removeManagedConnectorTool } from "./connector-tool-install.js";
export { retainConnectorSetupsForSession } from "./connector-setup-retain.js";
export { connectorManagementActions, CONNECTOR_MANAGEMENT_READ, CONNECTOR_MANAGEMENT_WRITE } from "./connector-management-actions.js";
export { connectorUsagesAction } from "./connector-usage-actions.js";
export { connectorPluginSlotActions } from "./connector-plugin-slot-actions.js";
export { createPluginConnectionsPort, pluginSlotScope } from "./connector-plugin-requests.js";
export { connectorRecordActions, CONNECTOR_RECORDS_READ } from "./connector-record-actions.js";
export { connectorSetupAction } from "./connector-setup.js";
export { connectorSetupExecuteAction } from "./connector-setup-execute.js";
export { connectorSetupIntentAction } from "./connector-setup-intent.js";
export { holdConnectorAuthorizationsForSession } from "./connector-authorization-status.js";
export { alchemistPulseGithub } from "./alchemist-pulse-github.js";
export { larkMcpLaunch, type LarkMcpLaunch, type LarkMcpLaunchInput } from "./lark-mcp-launch.js";
export * from "./github-oauth.js";

export * from "./gmail-oauth.js";

export { createGithubConnector } from "./github-connector.js";
export { createGmailConnector } from "./gmail-connector.js";
export { createCatalogConnector } from "./catalog-connector.js";
export { OfficialIntegrationRegistry, type OfficialProviderFactory } from "./official-integrations.js";

export { createLocalFeedConnectorSync } from "./feed-connector-sync.js";

export { feedConnectorAuthStatus } from "./feed-connector-auth.js";

export { createLocalFeedSourceScheduler } from "./feed-source-scheduler.js";

export { createLocalFeedGoalPromotion } from "./feed-goal-promotion.js";

export { handleFeedNativePluginHttp, type FeedNativePluginHttpOptions } from "./feed-native-plugin-http.js";
export { handleInboxNativePluginHttp, type InboxNativePluginHttpOptions } from "./inbox-native-plugin-http.js";
export { handleHomeDockJudgmentHttp, type HomeDockHttpOptions } from "./home-dock-http.js";
export { handleFunctionsHttp } from "./functions-http.js";

export { createLocalArtifactHttp, renderGoalArtifactContext } from "./artifact-native-plugin-http.js";

export * from "./onboarding.js";

export { createLocalHostCapsule } from "./capsule.js";

export { attachMolisWorkPtySocket } from "./pty-socket.js";

export { buildMolisWorkWebView, cachedMolisWorkWebView, type MolisWorkWebViewCache, type WebViewOptions } from "./web-view.js";
export { developerMode } from "./developer-mode.js";
export { rewriteNativePluginApiPath, withRewrittenPluginApi } from "./native-plugin-api.js";
export { hostCompleteText, hostTextGeneration, textModelAvailability, textModelMissing, type HostCompleteText, type HostTextGeneration, type HostTextOptions, type HostTextRequestOptions } from "./host-complete-text.js";
// Context-driven interaction: the judgment service and the readers of what a page claims, for the tests that drive them (new tests import the entry).
export { createContextualJudgmentService, type ContextualJudgmentPorts, type ContextualJudgmentService } from "./contextual/judgment-service.js";
export { readJudgeRequest, readLanding } from "./contextual/contextual-request.js";
export { handleContextualHttp } from "./contextual/contextual-http.js";
export { draftRequest } from "./contextual/contextual-draft.js";
export { createChosen, undoCreated, type ContextualCreated, type UndoOwner } from "./contextual/contextual-create.js";
export { intakeKey } from "./contextual/contextual-choice.js";
export { draftIntake, type DraftInput, type DraftModel, type DraftPorts } from "./drafting/draft-service.js";
export type { DraftTarget } from "./drafting/draft-data.js";
export { scheduleServiceFor } from "./project-clock.js";

export { sendLocalWebJson, sendUnhandledWebError, readLocalWebBody, authorizeLocalWebRequest, type LocalMutationState } from "./web-http.js";
export { createLocalWebAssets } from "./web-assets.js";

export { handleLocalRuntimeSettingsHttp, serviceProcessId } from "./web-runtime-settings.js";
export { assembleMcpCatalog, findAssembledMcpTool } from "./mcp-catalog.js";
export { readMcpToolPreference } from "./mcp-settings-store.js";
export * from "./web-project-settings.js";
export * from "./web-project-presentation.js";
export * from "./project-host.js";
export { projectActionAvailability } from "./project-action-availability.js";
export { runLocalPluginDevelopment, developInPrivateHost } from "./local-plugin-development.js";
export { createLocalOnboardingHttp } from "./web-onboarding.js";
export { createLocalPanelHttp } from "./web-panel.js";
export { handleLocalProjectReferenceHttp } from "./web-project-reference.js";
export { readProjectReference } from "./project-file-reference.js";
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
export { ModelProviderStore, createModelProviderTables, type ModelProviderSqlite, type ModelProviderStoreOptions, type ModelSecretPort } from "./model-provider-store.js";
export { MINIMAX_ANTHROPIC_BASE_URL, MODEL_PROVIDER_TEMPLATES, modelProviderTemplate } from "./model-provider-templates.js";
export {
  composeAgentHost,
  workspaceRefFor,
  type WorkspaceLookupPorts,
  type AgentHostComposition,
  type AgentHostCompositionOptions,
} from "./agent-host-composition.js";
export { ASSISTANT_QUESTION_TYPES, CODING_QUESTION_TYPES, hostQuestionTypes, hostReferenceKinds, pluginReferenceKinds, projectReferenceKinds } from "./agent-question-surfaces.js";
export { referenceKindsPort } from "./agent-reference-kinds.js";
export { handleAgentReviewHttp, handleUnscopedAgentReviews, type AgentReviewHttpPorts } from "./agent-review-http.js";
export { renderProjectRuntimeStages, type ProjectPluginSurfacePorts } from "./project-plugin-stages.js";
export { handleProjectPluginHttp, type ProjectPluginHttpPorts } from "./project-plugin-http.js";
export { ensureProjectPlugins, projectPluginProblem, releaseProjectPlugins } from "./project-plugins.js";
export { observeReviewSettlements, reviewSettlementForwarder, type AgentWritePlaces, type ObserveReviewSettlements, type ReviewSettlement } from "./review-settlement-events.js";
export { createGitWorktreePort, type GitWorktreePort } from "./workspace-git-worktrees.js";
export { readWriterIntegration, prepareWriterIntegration } from "./workspace-git-integration.js";
export { draftText } from "./model-draft.js";

export { ensureSystemAgentService } from "./system-agent-service.js";
export { LocalActionGatewayClient } from "./action-gateway.js";

export { createSearchEvidenceRuntime, type SearchEvidenceRuntime } from "./search-evidence-runtime.js";
// Home stores' one current schema each (repository-anti-corruption §4.1); compared with the stores' fixtures by tests/home-store-baselines.test.ts.
export { CONNECTORS_BASELINE } from "./connectors-store.js";
export { CONTEXT_ONBOARDING_BASELINE } from "./context-onboarding-store.js";
// An onboarding round run with the caller's own ports (a stub model), for checking the page while it organizes.
export { startContextJourney, waitContextJourney } from "./context-onboarding-service.js";
export { AGENT_DEFINITIONS_BASELINE } from "./agent-definitions/agent-definitions.js";
export { homeAgentDefinitions } from "./agent-definitions/builtin-registrations.js";
export { PLACEMENT_BASELINE } from "./placement-actions.js";
export { placementCallPorts } from "./placement-call.js";
export { ALCHEMIST_SEARCH_BASELINE, createAlchemistSearchPort } from "./alchemist-search.js";
export { ASSISTANT_STORE_BASELINE, ASSISTANT_STORE_NAME, AssistantStore } from "./assistant/assistant-store.js";
export { AssistantService } from "./assistant/assistant-service.js";
// The Home's one Assistant as the Host composes it, its person clients included: what a check of who it calls as runs against.
export { assistantServiceFor, closeAssistantService, type AssistantHttpPorts } from "./assistant/assistant-http.js";
export { assistantSurroundings, repositoryName } from "./assistant/assistant-surroundings.js";
export { AssistantFollowUps, AssistantFollowUpRecords, FOLLOW_UP_KIND, type AssistantFollowUpPorts } from "./assistant/assistant-followups.js";
export { agentQuestionHtml, questionErrors } from "./agent-question-card.js";
export { CARD_RESULT_OPEN, cardOutcomeSteps, interactionNextSteps, NEXT_STEP, type NextStepCard, type NextStepReview, type OutcomeCard } from "./agent-next-steps.js";
export { withPluginInteraction } from "./plugin-interaction-answer.js";
export { pluginInteraction } from "./plugin-interaction.js";
export { assistantCardHtml } from "./assistant/assistant-card-view.js";
export { assistantStepRow, drawAssistantReply } from "./assistant/assistant-view-html.js";
export { assistantOutcomeSteps } from "./assistant/assistant-outcome.js";
export { deliveryNote, deliveryNoteHtml, deliverySteps, isOpenable, type DeliveryNote } from "./assistant/assistant-delivery.js";
export { assistantAuthority } from "./assistant/assistant-authority.js";
export { purgeAssistantProject } from "./assistant/assistant-project-purge.js";
export { logMemoryLearning, prologueMemoryBackend } from "./memory/memory-host.js";
export { ComputerRecords } from "./computer/computer-records.js";
export { ComputerDesk } from "./computer/computer-desk.js";
export { ComputerSettings } from "./computer/computer-settings.js";
export { ComputerDriver, type DeskContext } from "./computer/computer-driver.js";
export { desktopTaskComplete, type DesktopTaskFacts, type DesktopTaskWanted } from "./computer/task-outcome.js";
export { helperFailure, isRefused } from "./computer/computer-errors.js";
export {
  COMPUTER_RECORD_SOURCE_ID,
  computerRecordFileSource,
  handleUnscopedComputerFiles,
  recordsOwnedBy,
} from "./computer/computer-record-source.js";
export {
  SELF_APPROVAL_QUIET_MS,
  confirmArrivedTooSoon,
  refuseCapture,
  refuseDespiteWindowText,
  refuseLanding,
  refuseSelfApproval,
  reviewProjectFor,
  type ComputerRoundHolder,
} from "./computer/computer-policy.js";
export { ASSISTANT_RULES_PROVIDER } from "./assistant/assistant-rule-actions.js";
export { projectOrNull } from "./catalog-lookup.js";
export { createProjectArrivalHttp } from "./project-arrival-http.js";
export { handleAttentionHttp, type AttentionSources } from "./attention-http.js";
export { handleBrowserHttp } from "./browser/browser-http.js";
export { homeBackgroundTasks, type HomeBackgroundTaskRow } from "./home-background-tasks.js";
export { startWebProjectSchedulers } from "./web-project-schedulers.js";
export { hostLog, captureHostLog, logPreviewFailure, logSearchIndexFailure, repeatingFailure, type HostLogEntry, type HostLogField, type HostLogLevel } from "./host-log.js";

export { assistantConnectionCheckers } from "./assistant/assistant-connection-authority.js";

export { connectorLocalActions } from "./connector-local-actions.js";

export { connectorCliActions } from "./connector-cli-actions.js";

export { directoryForHome, DIRECTORY_READ_PERMISSION, type DirectoryGrantService } from "./plugin-directory-service.js";
export { HOST_SERVICE_PERMISSIONS } from "./plugin-service-permissions.js";

export { pluginPagesFor } from "./plugin-page-authority.js";

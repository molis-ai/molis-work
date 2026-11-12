/** Public entry exports; Runtime lifecycle implementation remains in index.ts. */
export { SqlitePluginPrivateStorage, PLUGIN_PRIVATE_STORAGE_SCHEMA_SQL, privateValueReplicaOwner, validatePrivateValueReplication, installPrivateValueReplicationJournal } from "./private-storage.js";
export type { PluginPrivateStorageDatabase } from "./private-storage.js";
export { SqlitePluginRuntimeRepository, readPluginRuntimeRecords, PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL } from "./repository.js";
export { alwaysOnAgreed, consentStands, leaveRefusal } from "./always-on-rules.js";
export { MemoryPluginConsentLedger, PLUGIN_TRUST_SCHEMA_SQL, SqlitePluginConsentLedger, readProjectReachSubject } from "./consent-ledger.js";
export type { PluginConsentEntry, PluginConsentLedger } from "./consent-ledger.js";
export { HOST_BUILD_TRUST, UNSIGNED_TRUST, assertConsentsDeclared, assertHomeScopeAllowed, assertLocalToolsAllowed, assertScopeFitsRuntime, assertPluginTrust, assertTrustFitsDefinition, assertTrustFitsExecution, consentGranter, consentSubject, declarationsNeedingConsent, hostBuildConsents, isHostTrust, type InProcessAdmission } from "./trust-rules.js";
export type { PluginRuntimeDatabase } from "./repository.js";
export { PLUGIN_PROJECT_DATABASES_SCHEMA_SQL, PROJECT_ROOT_REFERENCE, inspectPluginProjectSchema, inspectPluginProjectDatabase, openPluginProjectDatabase, listPluginProjectDatabases, pluginProjectDatabaseErrors, type PluginProjectDatabaseRecord, type PluginProjectSchemaInspector, type PluginSchemaObject, type PluginSchemaShape } from "./project-database.js";
export { SANDBOX_HOME_SCHEMA_LIMITS, assertPluginHomeSchema, assertPluginHomeSnapshotSchema, inspectPluginHomeSchema } from "./project-database.js";
export {
  PLUGIN_UPGRADE_NONDETERMINISTIC_FUNCTIONS, assertPluginUpgradeStepsAdmitted, pluginProjectTablesVersion, pluginUpgradeErrors, pluginUpgradeSteps, upgradePluginHomeLibrary, upgradePluginProjectTables,
  type PluginUpgradeExecution, type PluginUpgradeInspector, type PluginUpgradeResult, type PluginUpgradeStatement, type PluginUpgradeStepStatements,
} from "./plugin-upgrade-steps.js";
export { PLUGIN_STATEMENT_SQLITE_VERSION, pluginStatementGuard, type PluginStatementMode } from "./project-database-statements.js";
export {
  createPluginRuntimeReleaseArtifact,
  MemoryPluginRuntimeReleaseArtifactRepository,
  SqlitePluginRuntimeReleaseArtifactRepository, PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL, readPluginReleaseManifest,
} from "./release-artifacts.js";
export type {
  PluginRuntimeReleaseArtifact,
  PluginRuntimeReleaseArtifactDatabase,
  PluginRuntimeReleaseArtifactRepository,
} from "./release-artifacts.js";

export { assertPluginActionCurrent, assertPluginReadCurrent, assertCapturedPluginActionCurrent, inPluginInstance, markPluginActionChecked, pluginActionBeforeEffect, reservePluginInvocationPlace, pluginSceneEffectPassed, currentPluginAction, currentPluginInvocation, insideOpenPluginCall, lastBegunPluginInvocation, pluginInvocationReadOnly, outsidePluginAction, runInPluginAction, withPluginPermissionChecks, assertPluginRoutePermissions } from "./action-scope.js";
export type { PluginInstance } from "./action-scope.js";
export { inertAfterStop, StoppedServiceCalls, type StoppedServiceCall } from "./stopped-services.js";
export { createPluginOwnerFilesClient } from "./owner-files-service.js";
export type { PluginOwnerFilesGate } from "./owner-files-service.js";
export { createPluginBackgroundClient } from "./background-service.js";
export { createPluginModelClient, pluginModelErrors } from "./model-service.js";
export { createPluginModelConfigurationClient } from "./model-configuration.js";
export type { PluginModelConfigurationPort } from "./model-configuration.js";
export { createPluginImageGenerationClient } from "./image-generation.js";
export type { PluginImageGenerationPort, PluginImageGenerationGate, PluginImageGenerationDispatch } from "./image-generation.js";
export { createPluginLocalToolsClient } from "./local-tools.js";
export type { PluginLocalToolsPort, PluginLocalToolsGate } from "./local-tools.js";
export { createPluginProjectsClient } from "./projects.js";
export type { PluginProjectsPort, PluginProjectsGate } from "./projects.js";
export type { PluginModelDispatch, PluginModelGate, PluginModelPort } from "./model-service.js";
export { MemoryPluginRuntimeRepository } from "./memory-repository.js";
export { NativePluginExecutor } from "./native-executor.js";
export { pluginManifestDigest } from "./identity.js";
export { loadDevelopmentLocalePacks, loadDevelopmentPlugin } from "./development-loader.js";
export { assertPluginLocales, inspectPluginLocales, refuseLocaleProblems, pluginLocaleFilePaths, pluginLocaleReader, type PluginLocaleManifest, type PluginLocaleRead, type PluginLocaleReader } from "./locale-packs.js";
export { assertContributionMatchesManifest, offeredManifest, viewContributionId, type RedemptionScope } from "./contribution.js";
export { bindRuntimeSyncCollection } from './sync-binding.js';
export type { RuntimeSyncCollection, RuntimeSyncAuthority } from './sync-binding.js';
export { resolvePluginActivation } from "./resolution.js";
export { PluginEventBus } from "./events.js";
export { PluginHostEvents } from "./host-events.js";
export type { HostEventInput, HostEventRecipient, PluginHostEventsLifecycle } from "./host-events.js";
export type { PluginActiveInstance, PluginHostLifecycle } from "./lifecycle.js";
export { buildEventContract } from "./event-contract.js";
export type { PluginEventContract, PluginEventSubscription } from "./event-contract.js";
export { MemoryPluginEventsRepository, SqlitePluginEventsRepository, PLUGIN_EVENTS_SCHEMA_SQL } from "./event-repository.js";
export type { PluginEventsDatabase } from "./event-repository.js";
export { PluginNotificationQueue, PLUGIN_NOTIFICATIONS_SCHEMA_SQL, pluginNotificationId } from "./notification-queue.js";
export type { PluginNotificationRow, PluginNotificationsDatabase } from "./notification-queue.js";
export { PLUGIN_ROUTE_PREFIX, PluginRouteRouter, pluginRouteMatcher } from "./routes.js";
export { INSTANCE_WATCH_INTERVAL_MS, type InstanceWatchTimers } from "./instance-watch.js";
export type { PluginRouteDispatchInput, PluginRouteMatch } from "./routes.js";
export { createPluginInputsClient, createPluginOutputsClient, pluginRequiredPorts, portArtifactId } from "./services.js";
export type { PluginWiringServicesInput } from "./services.js";
export { PluginInputGraph } from "./wiring.js";
export type { PluginArtifactReaderPort, PluginInputFailure } from "./wiring.js";
export { MemoryPluginWiringRepository, SqlitePluginWiringRepository, PLUGIN_WIRING_SCHEMA_SQL } from "./wiring-repository.js";
export { planWiringReassignment, reassignWiringSource, type WiringReassignmentPlan } from "./wiring-reassignment.js";
export { planRetiredInstalls, retireInstalls, type RetiredInstallPlan, type RetiredPlugin } from "./retired-install.js";
export { applyPrivateValueAdoption, applyPrivateValueMove, planPrivateValueAdoption, planPrivateValueMove, type PrivateValueAdoptionPlan, type PrivateValueChange, type PrivateValueMove } from "./private-value-adoption.js";
export type { PluginWiringDatabase } from "./wiring-repository.js";
export { PluginSupervisor } from "./supervisor.js";
export type {
  PluginSupervisorEntry,
  PluginUpgradeCandidate,
  PluginSupervisorReport,
  PluginSupervisorState,
  PluginSupervisorStatus,
} from "./supervisor.js";
export type {
  PluginCapabilityProvider,
  PluginResolution,
  PluginResolutionDiagnostic,
  PluginResolutionDiagnosticCode,
  PluginResolutionInput,
} from "./resolution.js";
export { pluginPublisherIdentity, assertPluginPackagePath, parsePluginPackage, pluginPackageSigningBytes, signPluginPackage, verifyPluginPackage, verifyPluginPackageSignature } from "./package-verification.js";

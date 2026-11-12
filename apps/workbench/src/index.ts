export { renderMolisWorkArrivalStylesheet, workbenchClientSource } from "./page-assets.js";
export { renderUpgradeOpeningPage } from "./arrival/upgrade-opening.js";
export type { WorkbenchAppearancePorts } from "./appearance-document.js";
export type { SideViewDocumentInput } from "./side-view-document.js";
export { PAGE_PLUGINS_WITHOUT_SELECTION } from "./page-plugin-visibility.js";
export { renderHomePluginPage } from "./home-plugin-page.js";
export { homeToolKeysScript } from "./home-plugin-navigation.js";
export { CLIENT_SCRIPT, MORE_STYLES, RESPONSIVE_STYLES, STYLES } from "./browser-assets.js";
export { ASSISTANT_RECEIPTS_FACTORY_SCRIPT } from "./scripts/client/assistant-send.js";
export { PANE_MESSAGES_SCRIPT, SIDE_FORWARD_SCRIPT } from "./scripts/client/pane-messages.js";
export { CONTEXT_ACTIONS_FACTORY_SCRIPT } from "./scripts/client/context-actions.js";
export { CARD_TARGET_ASK_SCRIPT } from "./scripts/client/context-card-target.js";
export { ASSISTANT_WORK_OBJECTS_FACTORY_SCRIPT } from "./scripts/client/assistant-work-objects.js";
export { ASSISTANT_STEP_ROW_FACTORY_SCRIPT, ASSISTANT_THREAD_REPLY_SCRIPT } from "./scripts/client/assistant-step-row.js";
export type { MolisWorkOnboardingRenderOptions } from "./onboarding-renderer.js";
export { onboardingIntentFrame, onboardingPlanningHint, type OnboardingIntentFrame } from "./onboarding-intent.js";
export type { WebProjectNavigation, WebSettingsSection } from "./settings-navigation.js";
export { listPluginSettingsNavItems, findPluginSettingsNavItem, pluginSettingsDataAction, pluginSettingsNavItemsFrom } from "./plugin-settings-catalog.js";
export type { ChooserArrival } from "./arrival/chooser.js";
export { composeProjectBrief, currentBriefGoal, summarizeProjectBrief, type BriefEvent, type BriefGoal, type ProjectBriefInput, type ProjectBriefModel, type ProjectBriefSummary } from "./arrival/project-brief.js";
export type { WebSettingsProject, WebInstallationDiagnostics, WebPeriodicTask, MolisWorkSettingsView } from "./settings-view.js";
export type { CapabilitiesView, CapabilitySection } from "./capabilities.js";
export { renderMcpAccessRows, type McpAccessModel, type McpAccessEntry } from "./mcp-access.js";
export type { MolisWorkWebView, PreparedStageView } from "./page-view.js";
export type { PluginRestartOffer, UnavailablePluginStage } from "./unavailable-plugin-stage.js";
export { createWorkbenchLocale, DEFAULT_WEB_LOCALE, LOCALE_COOKIE, LOCALE_SWITCH_STYLES, WEB_LOCALES, webLanguage, type WebLocale, type WebLocalePreference } from "./i18n.js";
export { WORKBENCH_LANGUAGES, workbenchPlatformText } from "./platform-languages.js";
export { workbenchLanguageResource } from "./language-resource.js";
export { installCatalogTextScope } from "./plugin-text.js";
export {
  artifactWorkbench,
  createArtifactReferenceRenderer,
  createWorkbenchUiHost,
  mountContributionsOf,
  renderPluginSettingsContribution,
  renderWorkbenchDocument,
  WORKBENCH_UI_SLOTS,
} from "./ui-composition.js";
export { renderWorkbenchRefreshDocument } from "./document-shell.js";
export type { ProjectSettingsFoldId } from "./project-settings-folds.js";
export { createWorkbenchRenderer, type WorkbenchRendererPorts, type WorkbenchRenderer } from "./renderer.js";
export { renderMolisWorkBarSpecimen, renderMolisWorkPrimitiveCatalog } from "./primitive-catalog.js";
export { renderEnvironmentSection, renderEnvironmentSpecimen } from "./environment-specimens.js";
export { parseConditionFrame, renderMolisWorkConditionsSpecimen } from "./condition-frame.js";
export { renderMolisWorkNavigationSpecimen } from "./navigation-specimens.js";
export { parseAssistantFrame, renderMolisWorkAssistantSpecimen, type AssistantFrameOptions } from "./assistant-board-frame.js";
export { assistantBoardSamples } from "./assistant-board-samples.js";
export { renderAssistantNoticeText, renderAssistantSavedText } from "./assistant-text-html.js";
export { readAssistantReviewWords } from "./assistant-review-html.js";
export { createCapsuleWorkbench, type CapsuleRendererPorts } from "./capsule.js";
export { BUILTIN_PLUGIN_CATALOG, OWN_DIRECTORY_SURFACES, manifestFor, pluginMarketCards, pluginTabGlyphs, pluginTabTitles, islandEntries, railEntries, settingsEntries, sideOpenedPlugins, creatableKinds, homeStarts, builtinPluginDirectory, pluginDirectoryFor, dockDefaultPins, extendPluginIds } from "./plugin-catalog.js";
export { clientPluginDirectory, isPersonalPlugin, renderPluginDirectoryData, renderPluginTabTitlesData, sanitizePluginDirectory, scriptJson, type PluginDirectoryEntry } from "./plugin-directory.js";
export { declaredStageContributionId, stageContributionId, stageDataAction, stageObjectAction, stageSurfaceDescriptors, stageDataInput, renderStagePage, withoutPagePublisher, type RenderedStagePage } from "./declared-stages.js";
export { pluginWorkbenchPacks, pluginWorkbenchStyles } from "./plugin-workbench.js";
export type { BuiltinPluginWorkbenchPack } from "./plugin-workbench.js";
export { renderAgentReviewRecovery } from "./agent-review-recovery.js";
export {
  isDecidable,
  leakedMarkup,
  renderAgentReviewSurface,
  reviewPhase,
  type AgentReviewPrimitives,
  type AgentReviewRow,
} from "./agent-review-surface.js";
export {
  formatContext,
  renderModelSettingsDocument,
  type ModelSettingsModel,
  type ModelTemplateChoice,
  type ModelSettingsPrimitives,
} from "./settings-models.js";

export { deferredSurfaceClients, pluginOnDemandStylesheet, pluginSurfaceClients, pluginWorkbenchClientAsset } from "./plugin-workbench.js";
export { pluginPageClients, pluginSettingsClients, pluginSettingsStyleLinks, pluginSettingsStyles } from "./plugin-workbench.js";
export { SETTINGS_DIRECTORY_FACTORY_SCRIPT } from "./scripts/client/settings-directory.js";
// The return trips' checks and their one writer (specs/draft-and-return §2), for the unit tests of S-return-trip-*.
export {
  RETURN_TRIP_RULES, createReturnOwner, needOfAddress, placeOf, readReturnTrips, returnGo, returnLanding, returnLink, returnRelay, returnTrip, startReturnWindow,
  type ReturnTrip, type ReturnOwnerEnv, type ReturnStorage, type ReturnPlaceRoot,
} from "./browser/return-trips.js";
export { HOME_MODEL_SETTINGS_CLIENT_SCRIPT } from "./scripts/home-model-settings.js";
export {
  GLOBAL_SETTINGS_QUERY_EXTRAS,
  HOME_SETTINGS_QUERY_EXTRAS,
  PROJECT_ID_HASH_SECTION,
  PROJECT_SETTINGS_QUERY_EXTRAS,
  SETTINGS_ADDRESS_DEFAULTS,
  SETTINGS_ADDRESS_HASHES,
} from "./settings-address-params.js";
export { selectorNames, splitPluginStylesheet } from "./plugin-styles.js";
export { renderMolisWorkCapabilitiesClientScript } from "./scripts/capabilities-client.js";
export { writeCheckerFromFields, writeCheckerFieldsOf, writeCheckersAfter } from "./scripts/write-checkers.js";
export { connectorSwitchLeft } from "./scripts/connector-replacement.js";
export { renderMolisWorkKnowledgeClientScript } from "./settings-knowledge.js";
export { renderMolisWorkKitClientScript } from "./settings-kit.js";
export { renderCharacters, renderCharactersSettingsEntry } from "./characters/ui.js";
export { renderMolisWorkCharactersClientScript } from "./characters/client-asset.js";

export { assistantTextHtml, assistantReviewHtml } from "./scripts/client/assistant-island.js";
export { connectionNeedHtml, isConnectionLoginUrl, type ConnectionNeedView } from "./connection-need-card.js";

export {PERSONAL_ACCOUNT_CLIENT_SCRIPT} from './scripts/personal-account.js';
export {renderPersonalAccountEntry,renderAccountSameOriginEntry} from './arrival/shell.js';
export { renderPluginFrameClientScript, renderPluginFrameSurface } from "./plugin-frame.js";
export { renderPluginDocumentShell } from "./plugin-document-shell.js";
export { renderOwnerUnavailablePage } from "./owner-unavailable.js";
export { renderOwnerUnavailableCard, type OwnerUnavailableCard, type OwnerUnavailableReason } from "./owner-unavailable-card.js";
export { renderRunningSettings } from "./settings-running.js";
export { renderUpdateSettings, type SettingsRollbackPoint, type SettingsUpdateView } from "./settings-update.js";
export { hostSettingsSectionLabel } from "./settings-sections.js";
export { renderPickerExtend, renderPluginMarket, renderPluginRail } from "./immersive-shell.js";
export { artifactReferenceUiContribution, isProjectReference, artifactBrowserUiContribution } from "./artifacts/index.js";

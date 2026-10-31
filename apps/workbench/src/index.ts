export type { SideViewDocumentInput } from "./side-view-document.js";
export { createWorkbenchGoalsPageRenderer } from "./shell-page-renderer.js";
export { PAGE_PLUGINS_WITHOUT_SELECTION } from "./page-plugin-visibility.js";
export { renderWorkbenchPlanningRequest } from "./goals-planning-request.js";
export type { WorkbenchPlanningPageOwners } from "./goals-planning-request.js";
export type { WorkbenchShellPageView, WorkbenchShellPageOwners } from "./shell-page-renderer.js";
export { renderHomePluginPage } from "./home-plugin-page.js";
export { homeToolKeysScript, renderHomePluginNavigation, type HomePluginNavigationEntry } from "./home-plugin-navigation.js";
export { createWorkbenchGoalsFragmentRenderer, type GoalsFragmentRenderers } from "./goals-fragment-renderer.js";
export {
  renderWorkbenchGoalsReadRoute, renderWorkbenchGoalsReadRequest, renderWorkbenchGoalsPageRequest,
  type GoalsReadRenderers, type WorkbenchGoalPageSelection,
} from "./goals-document-routes.js";
export { CLIENT_SCRIPT, MORE_STYLES, RESPONSIVE_STYLES, STYLES } from "./browser-assets.js";
export { EN } from "./i18n/en.js";
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
export type { MolisWorkWebView } from "./page-view.js";
export type { PluginRestartOffer, UnavailablePluginStage } from "./unavailable-plugin-stage.js";
export { createWorkbenchLocale, inWordsOf, LOCALE_COOKIE, LOCALE_SWITCH_STYLES, registerPluginMessages, unregisterPluginMessages, WEB_LOCALES, withPluginWords, type WebLocale } from "./i18n.js";
export {
  artifactWorkbench,
  createArtifactReferenceRenderer,
  createWorkbenchGoalsContextRenderer,
  createWorkbenchGoalsDialogsRenderer,
  createWorkbenchGoalsDocumentRenderer,
  createWorkbenchGoalsFactorsRenderer,
  createWorkbenchGoalsMomentumRenderer,
  createWorkbenchGoalsPlanningRenderer,
  createWorkbenchGoalsPolicyRenderer,
  createWorkbenchGoalsRelationRenderer,
  createWorkbenchGoalsStatusRenderer,
  createWorkbenchGoalsTreeRenderer,
  createWorkbenchUiHost,
  renderPluginSettingsContribution,
  renderWorkbenchDocument,
  WORKBENCH_UI_SLOTS,
} from "./ui-composition.js";
export { createWorkbenchFeedProjectionRenderer } from "./feed-projection-ui.js";
export type { ProjectSettingsFoldId } from "./project-settings-folds.js";
export { createWorkbenchRenderer, type WorkbenchRendererPorts, type WorkbenchRenderer } from "./renderer.js";
export { renderMolisWorkBarSpecimen, renderMolisWorkPrimitiveCatalog } from "./primitive-catalog.js";
export { parseConditionFrame, renderMolisWorkConditionsSpecimen } from "./condition-frame.js";
export { parseAssistantFrame, renderMolisWorkAssistantSpecimen, type AssistantFrameOptions } from "./assistant-board-frame.js";
export { assistantBoardSamples } from "./assistant-board-samples.js";
export { createCapsuleWorkbench, type CapsuleRendererPorts } from "./capsule.js";
export type { CapsuleGoalItem, CapsuleSnapshot, CapsuleState, CapsuleStateKind, CapsuleTab, CapsuleTabKind } from "./capsule-view.js";
export { BUILTIN_PLUGIN_CATALOG, OWN_DIRECTORY_SURFACES, manifestFor, pluginMarketCards, pluginTabGlyphs, pluginTabTitles, islandEntries, railEntries, settingsEntries, sideOpenedPlugins, creatableKinds, homeStarts, builtinPluginDirectory, pluginDirectoryFor, dockDefaultPins, extendPluginIds } from "./plugin-catalog.js";
export { clientPluginDirectory, renderPluginDirectoryData, sanitizePluginDirectory, scriptJson, type PluginDirectory, type PluginDirectoryEntry } from "./plugin-directory.js";
export { declaredStageContributionId, stageContributionId, stageDataAction } from "./declared-stages.js";
export { pluginWorkbenchPacks, pluginWorkbenchStyles } from "./plugin-workbench.js";
export type { BuiltinPluginWorkbenchPack } from "./plugin-workbench.js";
export {
  isDecidable,
  leakedMarkup,
  renderAgentReviewSurface,
  renderAgentReviewRecovery,
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
export { pluginSettingsStyleLinks } from "./plugin-workbench.js";
export { SETTINGS_DIRECTORY_FACTORY_SCRIPT } from "./scripts/client/settings-directory.js";
export { selectorNames, splitPluginStylesheet } from "./plugin-styles.js";
export { renderMolisWorkCapabilitiesClientScript } from "./scripts/capabilities-client.js";
export { writeCheckerFromFields, writeCheckerFieldsOf, writeCheckersAfter } from "./scripts/write-checkers.js";
export { renderMolisWorkKnowledgeClientScript } from "./settings-knowledge.js";
export { renderCharacters, renderCharactersSettingsEntry } from "./characters/ui.js";
export { renderMolisWorkCharactersClientScript } from "./characters/client-asset.js";

export { assistantTextHtml, assistantReviewHtml } from "./scripts/client/assistant-island.js";

export { renderPluginFrameClientScript, renderPluginFrameSurface } from "./plugin-frame.js";
export { renderPluginDocumentShell } from "./plugin-document-shell.js";
export { renderPluginStoreUnavailablePage } from "./plugin-store-unavailable.js";

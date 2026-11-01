import { escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderHint, renderIconSprite, THEME_BOOTSTRAP_SCRIPT as BASE_THEME_BOOTSTRAP_SCRIPT, VISUAL_FOUNDATION_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";
import { shownPagePlugins } from "./page-plugin-visibility.js";
import { creatableKinds, pluginDirectoryFor } from "./plugin-catalog.js";
import { renderTerminalPane } from "./terminal/pane.js";
import type { FeedSupplementalEntry } from "./feed-projection-ui.js";
import { GOALS_PLUGIN_ID, type GoalsDocumentView as WebGoalView } from "@molis-ai/molis-work-plugin-goals";
import { composePlanningMethodPacks } from "@molis-ai/molis-work-plugin-goals/module";
import { createGoalsPage } from "@molis-ai/molis-work-plugin-goals/page";
import { createWorkbenchGoalsPageRenderer } from "./shell-page-renderer.js";
import { inWordsOf, withPluginWords } from "./i18n.js";
import { createWorkbenchOnboardingRenderer } from "./onboarding-renderer.js";
import {
  renderMolisWorkArrivalStylesheet as renderArrivalCss,
  renderMolisWorkSettingsStylesheet as renderSettingsCss,
  renderMolisWorkWorkbenchClientScript as renderWorkbenchClient,
  renderMolisWorkWorkbenchStylesheet as renderWorkbenchCss,
} from "./page-assets.js";
import type { MolisWorkWebView } from "./page-view.js";
import { createWorkbenchProjectChooserRenderer } from "./arrival/chooser.js";
import { createWorkbenchProjectSettingsPages } from "./project-settings-pages.js";
import { controlTokenMeta, createRendererHelpers, type RendererLocale } from "./renderer-helpers.js";
import { createWorkbenchSettingsNavigation } from "./settings-navigation.js";
import { createWorkbenchSettingsRenderer } from "./settings-renderer.js";
import { createWorkbenchStageRenderers } from "./stage-renderers.js";
import { createArtifactReferenceRenderer, renderWorkbenchContribution, renderWorkbenchDocument } from "./ui-composition.js";
import { renderSideViewDocument as renderSideView, type SideViewDocumentInput } from "./side-view-document.js";
export interface WorkbenchRendererPorts {
  locale: RendererLocale;
  desktop: { appendDesktopQueryToLocalHrefs(html: string): string; withDesktopQuery(path: string): string; bootstrapScript: string };
}

/** Compose application pages from registered UI owners; request and desktop state belong to the Host. */
export function createWorkbenchRenderer(ports: WorkbenchRendererPorts) {
  const { L, currentLocale, htmlLang, dateTimeLocale, listJoin, localeSwitchHref, clientI18nScript } = ports.locale, goalsL = inWordsOf(GOALS_PLUGIN_ID, L);
  const { appendDesktopQueryToLocalHrefs, withDesktopQuery, bootstrapScript: NATIVE_DESKTOP_BOOTSTRAP_SCRIPT } = ports.desktop;
  const { formatDate, renderList, prefixLocalLinks } = createRendererHelpers({ L, dateTimeLocale, appendDesktopQueryToLocalHrefs });
  const stages = createWorkbenchStageRenderers({ L, dateTimeLocale, prefixLocalLinks });
  const { goals, documents, planningRenderer } = createGoalsPage<MolisWorkWebView>({
    mount: renderWorkbenchContribution, L, goalsL, currentLocale, listJoin, formatDate, renderList, prefixLocalLinks,
    renderReference: createArtifactReferenceRenderer({ escape: escapeHtml, icon, text: L }),
    creatableKinds: view => creatableKinds(shownPagePlugins(view), pluginDirectoryFor(view.plugin_directory)),
    inPluginWords: withPluginWords, renderTerminalPane, renderHint,
  });

  const THEME_BOOTSTRAP_SCRIPT = `${BASE_THEME_BOOTSTRAP_SCRIPT}${NATIVE_DESKTOP_BOOTSTRAP_SCRIPT}`;

  const { settingsContextHref, renderProjectSwitcher, renderDesktopProjectChrome, renderSettingsNavigation, renderProjectSettingsNavigation } = createWorkbenchSettingsNavigation({ L, escapeHtml, icon, withDesktopQuery });

  const projectChooserRenderer = createWorkbenchProjectChooserRenderer({ L, escapeHtml, icon, withDesktopQuery, htmlLang, renderIconSprite, controlTokenMeta, clientI18nScript, themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT, visualFoundationClientScript: VISUAL_FOUNDATION_CLIENT_SCRIPT, dateTimeLocale });

  const { renderMolisWorkProjectIndex, renderProjectBrief: renderMolisWorkProjectBrief } = projectChooserRenderer;

  const renderMolisWorkSettings = createWorkbenchSettingsRenderer({
    L, escapeHtml, icon, currentLocale, localeSwitchHref, htmlLang, controlTokenMeta, clientI18nScript, renderIconSprite,
    withDesktopQuery, settingsContextHref, renderSettingsNavigation,
    themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT, visualFoundationClientScript: VISUAL_FOUNDATION_CLIENT_SCRIPT,
  });

  const renderMolisWorkOnboarding = createWorkbenchOnboardingRenderer({
    L, escapeHtml, htmlLang, controlTokenMeta, withDesktopQuery, clientI18nScript, icon, renderIconSprite,
    nativeDesktopBootstrapScript: NATIVE_DESKTOP_BOOTSTRAP_SCRIPT,
  });

  const { renderMolisWorkProjectSettingsHub, renderMolisWorkProjectGeneralSettings, renderMolisWorkProjectSettings, renderMolisWorkProjectGuidanceSettings, renderMolisWorkPlanningLibrary, renderMolisWorkPlanningMethodPage, renderMolisWorkPlanningSettings } = createWorkbenchProjectSettingsPages({
    L, escapeHtml, formatDate, icon, htmlLang, listJoin, controlTokenMeta, clientI18nScript, renderIconSprite, withDesktopQuery,
    themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT, visualFoundationClientScript: VISUAL_FOUNDATION_CLIENT_SCRIPT,
    navigation: { settingsContextHref, renderProjectSettingsNavigation, renderSettingsNavigation }, renderProjectPolicyDocument: goals.renderProjectPolicyDocument, composePlanningMethodPacks, planningRenderer,
  });

  const { renderMolisWorkWeb, renderMolisWorkRefreshFragment } =
    createWorkbenchGoalsPageRenderer<WebGoalView, MolisWorkWebView, FeedSupplementalEntry>({
      L, escapeHtml, icon, htmlLang, controlTokenMeta, themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT,
      renderIconSprite, clientI18nScript, dataJson: documents.dataJson, prefixLocalLinks, renderWorkbenchDocument,
      renderGoalDocument: documents.renderGoalDocument, renderTrashGoalDocument: documents.renderTrashGoalDocument,
      goalsDocumentRenderer: documents.goalsDocumentRenderer, goalsTreeRenderer: goals.goalsTreeRenderer,
      renderGoalProposals: (view) => goals.renderGoalTreeProposalList(view.snapshot.goal_tree_proposals, view),
      renderCreateDialog: documents.renderCreateDialog, renderGoalTrashDialog: documents.renderGoalTrashDialog,
      renderMomentumPlaceholder: goals.renderMomentumPlaceholder, renderGoalKanban: goals.renderGoalKanban, renderTuiPane: documents.renderTuiPane,
      renderDesktopProjectChrome, renderProjectSwitcher,
      renderFeedNativePluginSurface: stages.renderFeedNativePluginSurface, stageModel: stages.declaredStageModel,
    });
  return {
    renderMolisWorkProjectIndex,
    renderMolisWorkProjectBrief,
    renderMolisWorkSettings,
    renderPersistedFeedItemDetail: stages.renderPersistedFeedItemDetail,
    renderFeedWorkbenchFragment: stages.renderFeedWorkbenchFragment,
    renderInboxWorkbenchFragment: stages.renderInboxWorkbenchFragment,
    declaredStageFragment: stages.declaredStageFragment,
    renderGoalDocumentFragment: documents.renderGoalDocumentFragment,
    renderMolisWorkMomentumFragment: documents.renderMolisWorkMomentumFragment,
    renderMolisWorkOnboarding,
    renderMolisWorkProjectSettingsHub,
    renderMolisWorkProjectGeneralSettings,
    renderMolisWorkProjectSettings,
    renderMolisWorkProjectGuidanceSettings,
    renderMolisWorkPlanningLibrary,
    renderMolisWorkPlanningMethodPage,
    renderMolisWorkPlanningSettings,
    renderMolisWorkWorkbenchStylesheet: (): string => renderWorkbenchCss(),
    renderMolisWorkArrivalStylesheet: (): string => renderArrivalCss(),
    renderMolisWorkSettingsStylesheet: (): string => renderSettingsCss(),
    renderMolisWorkWorkbenchClientScript: (): string => renderWorkbenchClient(),
    renderMolisWorkWeb,
    renderMolisWorkRefreshFragment,
    declaredStageModel: stages.declaredStageModel,
    /** One plugin tab of the side panel, or null when that view is not declared by a plugin enabled here. */
    renderSideViewDocument: (input: Omit<SideViewDocumentInput, "lang" | "headHtml" | "clientI18nScript" | "themeBootstrapScript" | "translate"> & { controlToken: string }): string | null =>
      renderSideView({ ...input, lang: htmlLang(), headHtml: controlTokenMeta(input.controlToken), clientI18nScript: clientI18nScript(), themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT, translate: L }),
  };
}

export type WorkbenchRenderer = ReturnType<typeof createWorkbenchRenderer>;

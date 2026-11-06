import { escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderIconSprite, THEME_BOOTSTRAP_SCRIPT as BASE_THEME_BOOTSTRAP_SCRIPT, VISUAL_FOUNDATION_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";
import { createWorkbenchGoalsPageRenderer } from "./shell-page-renderer.js";
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
import { renderWorkbenchDocument } from "./ui-composition.js";
import { renderSideViewDocument as renderSideView, type SideViewDocumentInput } from "./side-view-document.js";
export interface WorkbenchRendererPorts {
  locale: RendererLocale;
  desktop: { appendDesktopQueryToLocalHrefs(html: string): string; withDesktopQuery(path: string): string; bootstrapScript: string };
}

/** Compose application pages from registered UI owners; request and desktop state belong to the Host. */
export function createWorkbenchRenderer(ports: WorkbenchRendererPorts) {
  const { L, currentLocale, htmlLang, dateTimeLocale, listJoin, localeSwitchHref, clientI18nScript } = ports.locale;
  const { appendDesktopQueryToLocalHrefs, withDesktopQuery, bootstrapScript: NATIVE_DESKTOP_BOOTSTRAP_SCRIPT } = ports.desktop;
  const helpers = createRendererHelpers({ L, dateTimeLocale, appendDesktopQueryToLocalHrefs });
  const { prefixLocalLinks } = helpers;
  const THEME_BOOTSTRAP_SCRIPT = `${BASE_THEME_BOOTSTRAP_SCRIPT}${NATIVE_DESKTOP_BOOTSTRAP_SCRIPT}`;

  const { settingsContextHref, renderProjectSwitcher, renderDesktopProjectChrome, renderSettingsNavigation, renderProjectSettingsNavigation } = createWorkbenchSettingsNavigation({ L, escapeHtml, icon, withDesktopQuery });
  const stages = createWorkbenchStageRenderers({ L, dateTimeLocale, currentLocale, listJoin, helpers, withDesktopQuery, settingsContextHref });

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
    L, escapeHtml, icon, htmlLang, controlTokenMeta, clientI18nScript, renderIconSprite, withDesktopQuery,
    themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT, visualFoundationClientScript: VISUAL_FOUNDATION_CLIENT_SCRIPT,
    navigation: { renderProjectSettingsNavigation, renderSettingsNavigation }, renderSettingsContent: stages.declaredSettingsSurface,
  });

  const { renderMolisWorkWeb } =
    createWorkbenchGoalsPageRenderer<MolisWorkWebView>({
      L, escapeHtml, icon, htmlLang, controlTokenMeta, themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT,
      renderIconSprite, clientI18nScript, prefixLocalLinks, renderWorkbenchDocument,
      renderDesktopProjectChrome, renderProjectSwitcher,
      stageModel: stages.declaredStageModel,
    });
  return {
    renderMolisWorkProjectIndex,
    renderMolisWorkProjectBrief,
    renderMolisWorkSettings,
    stageFragmentModel: stages.stageFragmentModel,
    declaredStageFragment: stages.declaredStageFragment,
    declaredPageSurface: stages.declaredPageSurface,
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
    declaredStageModel: stages.declaredStageModel,
    /** One plugin tab of the side panel, or null when that view is not declared by a plugin enabled here. */
    renderSideViewDocument: (input: Omit<SideViewDocumentInput, "lang" | "headHtml" | "clientI18nScript" | "themeBootstrapScript" | "translate"> & { controlToken: string }): string | null =>
      renderSideView({ ...input, lang: htmlLang(), headHtml: controlTokenMeta(input.controlToken), clientI18nScript: clientI18nScript(), themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT, translate: L }),
  };
}

export type WorkbenchRenderer = ReturnType<typeof createWorkbenchRenderer>;

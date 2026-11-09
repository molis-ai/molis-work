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
import { createWorkbenchDocumentRenderer } from "./document-shell.js";
import { renderSideViewDocument as renderSideView, type SideViewDocumentInput } from "./side-view-document.js";
import type { WorkbenchAppearancePorts } from "./appearance-document.js";
export interface WorkbenchRendererPorts {
  locale: RendererLocale;
  desktop: { appendDesktopQueryToLocalHrefs(html: string): string; withDesktopQuery(path: string): string; bootstrapScript: string };
  /** The installation account owner registers every editable page before it can receive input. */
  accountRegistration?: boolean;
  appearance?: WorkbenchAppearancePorts;
}

/** Compose application pages from registered UI owners; request and desktop state belong to the Host. */
export function createWorkbenchRenderer(ports: WorkbenchRendererPorts) {
  const { readText, currentLocale, htmlLang, dateTimeLocale, listJoin, localeSwitchHref } = ports.locale;
  const { appendDesktopQueryToLocalHrefs, withDesktopQuery, bootstrapScript: NATIVE_DESKTOP_BOOTSTRAP_SCRIPT } = ports.desktop;
  const helpers = createRendererHelpers({ readText, dateTimeLocale, appendDesktopQueryToLocalHrefs });
  const { prefixLocalLinks } = helpers;
  const THEME_BOOTSTRAP_SCRIPT = `${BASE_THEME_BOOTSTRAP_SCRIPT}${NATIVE_DESKTOP_BOOTSTRAP_SCRIPT}`;
  const accountRegistration = ports.accountRegistration ?? false;

  const { settingsContextHref, renderProjectSwitcher, renderDesktopProjectChrome, renderSettingsNavigation, renderProjectSettingsNavigation } = createWorkbenchSettingsNavigation({ readText, escapeHtml, icon, withDesktopQuery });
  const stages = createWorkbenchStageRenderers({ readText, dateTimeLocale, currentLocale, listJoin, helpers, withDesktopQuery, settingsContextHref });

  const projectChooserRenderer = createWorkbenchProjectChooserRenderer({ readText, escapeHtml, icon, withDesktopQuery, htmlLang, renderIconSprite, controlTokenMeta, themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT, visualFoundationClientScript: VISUAL_FOUNDATION_CLIENT_SCRIPT, dateTimeLocale, accountRegistration, appearance: ports.appearance });

  const { renderMolisWorkProjectIndex, renderProjectBrief: renderMolisWorkProjectBrief } = projectChooserRenderer;

  const renderMolisWorkSettings = createWorkbenchSettingsRenderer({
    readText, escapeHtml, icon, currentLocale, localeSwitchHref, htmlLang, controlTokenMeta, renderIconSprite,
    withDesktopQuery, settingsContextHref, renderSettingsNavigation, accountRegistration, appearance: ports.appearance,
    themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT, visualFoundationClientScript: VISUAL_FOUNDATION_CLIENT_SCRIPT,
  });

  const renderMolisWorkOnboarding = createWorkbenchOnboardingRenderer({
    readText, escapeHtml, htmlLang, controlTokenMeta, withDesktopQuery, icon, renderIconSprite,
    nativeDesktopBootstrapScript: NATIVE_DESKTOP_BOOTSTRAP_SCRIPT, accountRegistration, appearance: ports.appearance,
  });

  const { renderMolisWorkProjectSettingsHub, renderMolisWorkProjectGeneralSettings, renderMolisWorkProjectSettings, renderMolisWorkProjectGuidanceSettings, renderMolisWorkPlanningLibrary, renderMolisWorkPlanningMethodPage, renderMolisWorkPlanningSettings } = createWorkbenchProjectSettingsPages({
    readText, escapeHtml, icon, htmlLang, controlTokenMeta, renderIconSprite, withDesktopQuery, accountRegistration,
    themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT, visualFoundationClientScript: VISUAL_FOUNDATION_CLIENT_SCRIPT,
    navigation: { renderProjectSettingsNavigation, renderSettingsNavigation }, renderSettingsContent: stages.declaredSettingsSurface, appearance: ports.appearance,
  });

  const { renderMolisWorkWeb } =
    createWorkbenchGoalsPageRenderer<MolisWorkWebView>({
      readText, escapeHtml, icon, htmlLang, controlTokenMeta, themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT,
      renderIconSprite, prefixLocalLinks, renderWorkbenchDocument: createWorkbenchDocumentRenderer(accountRegistration),
      renderDesktopProjectChrome, renderProjectSwitcher,
      stageModel: stages.declaredStageModel, appearance: ports.appearance,
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
    renderSideViewDocument: (input: Omit<SideViewDocumentInput, "lang" | "headHtml" | "themeBootstrapScript" | "translate"> & { controlToken: string }): string | null =>
      renderSideView({ ...input, accountRegistration, lang: htmlLang(), headHtml: controlTokenMeta(input.controlToken), themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT, translate: readText, appearance: ports.appearance?.current() }),
  };
}

export type WorkbenchRenderer = ReturnType<typeof createWorkbenchRenderer>;

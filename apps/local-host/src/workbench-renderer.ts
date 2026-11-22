import { localEnvironmentName } from "./active-release-profile.js";
import { installHostUiText, projectTextPacks, registeredBuiltinText } from "./ui-text-provider.js";
import { INSTALLED_PLUGIN_BUNDLE, INSTALLED_PLUGIN_PAGE_CLASS, createWorkbenchRenderer, renderInstalledPluginBody, renderPluginDocumentShell, hostSettingsSectionLabel, renderMolisWorkArrivalStylesheet, renderOwnerUnavailablePage, renderPluginFrameSurface, renderUpgradeOpeningPage, renderWorkbenchRefreshDocument,
  type OwnerUnavailableCard, type PluginDirectoryEntry, type UnavailablePluginStage, type WorkbenchRenderer, type WorkbenchRendererPorts } from "@molis-ai/molis-work-app-workbench";
import type { SurfaceInstallationRef } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { installedStagePath } from "./installed-stage-identity.js";
import { readText, currentLocale, htmlLang, dateTimeLocale, listJoin, localeSwitchHref } from "./web-locale.js";

/** Bind Workbench to this Host's request scope; Desktop supplies its own optional-shell behavior. */
export function createLocalHostWorkbenchRenderer(desktop: WorkbenchRendererPorts["desktop"], accountRegistration=false, appearance?: WorkbenchRendererPorts["appearance"], projectDeletionLabels?: WorkbenchRendererPorts["projectDeletionLabels"]): WorkbenchRenderer {
  installHostUiText();
  return createWorkbenchRenderer({
    locale: { readText, currentLocale, htmlLang, dateTimeLocale, listJoin, localeSwitchHref },
    desktop, accountRegistration, appearance, projectDeletionLabels, environmentName: localEnvironmentName,
    catalogTextPacks(manifest) {
      const reader = registeredBuiltinText(manifest), locale = currentLocale();
      return reader ? projectTextPacks(reader, locale, reader.available.includes(locale)) : [];
    },
  });
}

/**
 * An installed package's stage in the workbench: a work surface that frames the package's own page and loads only when opened. The
 * agent-built plugins of a project and the signed packages installed in the Home are drawn with this one markup; `prefix` is the
 * route the page is served under. `icon` is the icon its Manifest's stage view picked: the tab strip draws the tab with it, and a
 * package that picked none keeps the shell's default. `installation` binds the page to the exact installation this section shows.
 */
export function installedStageSection(input: { pluginId: string; surface: string; label: string; prefix: string; installation: SurfaceInstallationRef; icon?: string }): string {
  return renderPluginFrameSurface(renderInstalledPluginBody(input.pluginId), input.surface, input.label, true, false, INSTALLED_PLUGIN_BUNDLE, undefined, undefined, undefined, false, {
    owner: input.pluginId, page: installedStagePath(input.prefix, input.pluginId, input.installation), icon: input.icon,
  });
}

/**
 * The pages the Host draws outside a project's workbench (upgrade-continuity U3): the card for a part an upgrade stopped, the opening
 * page the maintenance listener answers while a Home upgrades, and the arrival styles that page uses. Bound here, the one place the
 * Host takes the workbench's renderers, so neither the listener nor the page recovery reaches into the workbench on its own.
 */
export const hostRecoveryPages = { ownerUnavailablePage: renderOwnerUnavailablePage, upgradeOpeningPage: renderUpgradeOpeningPage,
  arrivalStylesheet: renderMolisWorkArrivalStylesheet, settingsSectionLabel: hostSettingsSectionLabel };
export { renderWorkbenchRefreshDocument };
/** The installed package page's drawing, for the Host's installed-plugin routes (`installed-plugin-http.ts`). */
export { INSTALLED_PLUGIN_BUNDLE, INSTALLED_PLUGIN_PAGE_CLASS, renderInstalledPluginBody, renderPluginDocumentShell };
export type { PluginDirectoryEntry, UnavailablePluginStage };
export type { OwnerUnavailableCard };

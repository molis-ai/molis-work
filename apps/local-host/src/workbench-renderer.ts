import { installHostUiText, projectTextPacks, registeredBuiltinText } from "./ui-text-provider.js";
import { createWorkbenchRenderer, renderPluginFrameSurface, type WorkbenchRenderer, type WorkbenchRendererPorts } from "@molis-ai/molis-work-app-workbench";
import type { SurfaceInstallationRef } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { installedPluginBody } from "./installed-stage-section.js";
import { installedStagePath } from "./installed-stage-identity.js";
import { readText, currentLocale, htmlLang, dateTimeLocale, listJoin, localeSwitchHref } from "./web-locale.js";

/** Bind Workbench to this Host's request scope; Desktop supplies its own optional-shell behavior. */
export function createLocalHostWorkbenchRenderer(desktop: WorkbenchRendererPorts["desktop"], accountRegistration=false, appearance?: WorkbenchRendererPorts["appearance"], projectDeletionLabels?: WorkbenchRendererPorts["projectDeletionLabels"]): WorkbenchRenderer {
  installHostUiText();
  return createWorkbenchRenderer({
    locale: { readText, currentLocale, htmlLang, dateTimeLocale, listJoin, localeSwitchHref },
    desktop, accountRegistration, appearance, projectDeletionLabels,
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
  return renderPluginFrameSurface(installedPluginBody(input.pluginId), input.surface, input.label, true, false, "plugin-builder", undefined, undefined, undefined, false, {
    owner: input.pluginId, page: installedStagePath(input.prefix, input.pluginId, input.installation), icon: input.icon,
  });
}

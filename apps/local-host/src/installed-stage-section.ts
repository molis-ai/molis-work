import { renderPluginFrameSurface } from "@molis-ai/molis-work-app-workbench";
import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import { FRAME_QUERY } from "./plugin-builder-surface.js";
import type { InstalledRelease } from "./installed-release.js";

/** The id under which the workbench opens an installed package's stage: the build it was installed from. */
export const installedStageSurface = (release: Pick<InstalledRelease, "buildId">): string => "app-" + release.buildId;

/**
 * An installed package's stage in the workbench: a work surface that frames the package's own page and loads only when opened. The
 * agent-built plugins of a project and the signed packages installed in the Home are drawn with this one markup; `prefix` is the
 * route the page is served under. `icon` is the icon its Manifest's stage view picked: the tab strip draws the tab with it, and a
 * package that picked none keeps the shell's default.
 */
export function installedStageSection(input: { pluginId: string; surface: string; label: string; prefix: string; icon?: string }): string {
  return renderPluginFrameSurface(installedPluginBody(input.pluginId), input.surface, input.label, true, false, "plugin-builder", undefined, undefined, undefined, false, {
    owner: input.pluginId, page: input.prefix + "/plugins/" + encodeURIComponent(input.pluginId) + "?" + FRAME_QUERY, icon: input.icon,
  });
}

export const installedPluginBody = (pluginId: string): string => '<main class="as-preview-page" data-installed-plugin="' + escapeHtml(pluginId) + '"></main>';

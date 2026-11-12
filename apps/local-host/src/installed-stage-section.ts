import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { SurfaceInstallationRef } from "@molis-ai/molis-work-contracts/services/surface-composition";
import type { InstalledRelease } from "./installed-release.js";
import { installedStagePath } from "./installed-stage-identity.js";

/** The id under which the workbench opens an installed package's stage: the build it was installed from. */
export const installedStageSurface = (release: Pick<InstalledRelease, "buildId">): string => "app-" + release.buildId;

/** A Runtime view of an installed package frames the page of the exact installation that drew it. */
export function installedStageFrame(input: { pluginId: string; label: string; prefix: string; installation: SurfaceInstallationRef }): string {
  return '<iframe src="' + escapeHtml(installedStagePath(input.prefix, input.pluginId, input.installation)) + '" title="' + escapeHtml(input.label)
    + '" loading="lazy" style="display:block;width:100%;height:100%;border:0;background:#fff"></iframe>';
}

export const installedPluginBody = (pluginId: string): string => '<main class="as-preview-page" data-installed-plugin="' + escapeHtml(pluginId) + '"></main>';

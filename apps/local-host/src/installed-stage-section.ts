import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import { FRAME_QUERY } from "./plugin-builder-surface.js";
import type { InstalledRelease } from "./installed-release.js";

/** The id under which the workbench opens an installed package's stage: the build it was installed from. */
export const installedStageSurface = (release: Pick<InstalledRelease, "buildId">): string => "app-" + release.buildId;

/**
 * An installed package's stage in the workbench: a work surface that frames the package's own page and loads only when opened. The
 * agent-built plugins of a project and the signed packages installed in the Home are drawn with this one markup; `prefix` is the
 * route the page is served under.
 */
export function installedStageSection(input: { pluginId: string; surface: string; label: string; prefix: string }): string {
  return '<section class="desktop-work-surface pb-surface" data-work-surface="' + input.surface + '" data-work-surface-label="' + escapeHtml(input.label) + '" data-installed-plugin="' + escapeHtml(input.pluginId) + '" hidden>'
    + '<iframe src="' + escapeHtml(input.prefix + "/plugins/" + input.pluginId + "?" + FRAME_QUERY) + '" title="' + escapeHtml(input.label) + '" loading="lazy" style="display:block;width:100%;height:100%;border:0;background:#fff"></iframe></section>';
}

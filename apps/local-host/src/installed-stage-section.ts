import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { InstalledRelease } from "./installed-release.js";

/** The id under which the workbench opens an installed package's stage: the build it was installed from. */
export const installedStageSurface = (release: Pick<InstalledRelease, "buildId">): string => "app-" + release.buildId;

export const installedPluginBody = (pluginId: string): string => '<main class="as-preview-page" data-installed-plugin="' + escapeHtml(pluginId) + '"></main>';

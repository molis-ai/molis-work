import type { PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { sandboxPackageBuildId } from "@molis-ai/molis-work-plugin-sdk";
import { projectDirectoryWords } from "@molis-ai/molis-work-ui-host";
import type { PluginDirectoryEntry, UnavailablePluginStage } from "./workbench-renderer.js";
import { escapeHtml, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
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

/** A damaged install keeps its surface key. If its Manifest cannot be verified, only the Host's recovery card is placed there. */
export function installedRepairStage({ record, manifest }: { record: PluginInstanceRecord; manifest?: PluginManifest },
  scope: SurfaceInstallationRef["scope"], prefix: string): { directory: PluginDirectoryEntry; unavailable: UnavailablePluginStage } | undefined {
  if (manifest && (manifest.kind !== "app" || !manifest.ui.views?.some(view => view.slot === "stage"))) return;
  const pluginId = record.plugin_id;
  const surface = scope === "home" ? pluginId : installedStageSurface({ buildId: sandboxPackageBuildId(pluginId, record.publisher_signature) });
  const { install_id, installation_generation, version, manifest_digest } = record;
  const words = manifest ? projectDirectoryWords(manifest) : { name: pluginId, ui: { views: [{ view_id: "recovery", slot: "stage" as const, title: pluginId }] } };
  return {
    directory: { id: surface, plugin_id: pluginId, chosen: false, ...(scope === "home" ? { home: true } : {}), ...words },
    unavailable: {
      scope, surface, label: words.name, reason: uiText.text("workbench.unavailable-plugin-stage.package-damaged"),
      packageRepair: { plugin_id: pluginId, target: { install_id, installation_generation, version, manifest_digest },
        needsFile: !manifest, uninstallHref: prefix + "/settings/plugins?installation=" + encodeURIComponent(install_id) },
    },
  };
}

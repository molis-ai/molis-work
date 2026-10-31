import { renderPluginDocumentShell } from "@molis-ai/molis-work-app-workbench";
import { inDesignOrder } from "@molis-ai/molis-work-plugin-builder";
import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { InstalledRelease } from "./installed-release.js";
import { pluginPagesFor } from "./plugin-page-authority.js";

/**
 * The page a signed package installed in the Home draws its stage with, framed by the workbench (`?frame=workbench`): the same
 * renderer a project's installed plugin uses, with every call going to the package's own sandboxed process through the Home's
 * route. The page is opened under the person's authority over the package's Home activation, with no project (BL-713, S-15).
 */
export function renderHomePackageDocument(input: { home: string; actorId: string; release: InstalledRelease; controlToken: string }): string {
  const { release } = input, pluginId = release.pluginId;
  const view = { contract: release.design.contract, nodes: inDesignOrder(release.design, release.nodes), presentation: release.design.presentation,
    connected: release.design.contract.operations.map(item => item.id) };
  return renderPluginDocumentShell({ id: pluginId, plugin_id: pluginId, bundle: "plugin-builder", title: release.design.title,
    html: '<main class="as-preview-page" data-installed-plugin="' + escapeHtml(pluginId) + '"></main>', project_id: "", route_prefix: "", control_token: input.controlToken,
    page: { mode: "installed", plugin_id: pluginId, call: "/api/plugins/" + pluginId + "/call", view },
    authorization: pluginPagesFor(input.home).open(pluginId, null, input.actorId) });
}

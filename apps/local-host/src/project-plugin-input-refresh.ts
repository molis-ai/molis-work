import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { FILES_PLUGIN_ID } from "@molis-ai/molis-work-plugin-files";
import type { ProjectPluginRouteHooks } from "./project-plugin-http.js";

/** Files hands its snapshots on as process items (artifact-positioning A2); either declaration list can name them. */
function readsFilesOutputs(platform: { supervisor: { manifest(pluginId: string): PluginManifest | undefined } }, pluginId: string): boolean {
  const files = platform.supervisor.manifest(FILES_PLUGIN_ID), consumer = platform.supervisor.manifest(pluginId);
  const outputs = [...files?.artifacts.produces ?? [], ...files?.process_items?.produces ?? []];
  return [...consumer?.artifacts.consumes ?? [], ...consumer?.process_items?.consumes ?? []].some(input =>
    outputs.some(output => output.artifact_type_id === input.artifact_type_id && output.schema_version === input.schema_version));
}

/**
 * What the Host still does around a project's plugin route (project-plugin-http.ts): a consumer of Files' outputs reads them
 * fresh first. It goes once a change of the project's workspace settings also tells Files to look again (BL-521, with BL-366): the
 * hook then has nothing left to do, and this file with it.
 */
export const filesOutputsRefresh: ProjectPluginRouteHooks = ({ platform, pluginId, ports }) => ({
  async beforeDispatch(router) {
    // Existing workspace outputs need a settings refresh before their consumers
    // read them. Unrelated plugins must not cause Files reads or publications.
    if (!readsFilesOutputs(platform, pluginId)) return;
    await router.dispatch({ method: "GET", pathname: `/api/plugins/${FILES_PLUGIN_ID}/state`, actor_id: ports.actorId, query: {} });
    await platform.wiring.drain();
  },
});

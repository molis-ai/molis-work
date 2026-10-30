import type { ActionDefinition, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { stageDataAction } from "@molis-ai/molis-work-app-workbench";
import { PLATFORM_PLUGIN_REGISTRATIONS, runsOnlyInHome } from "./plugin-registry.js";
import { optionalPluginQuery } from "./web-view.js";

/**
 * The answers of the declared stage reads of the project plugins a page shows (T-133, PG-060): for each one whose stage-opening view
 * declares `stage_data`, that action, called with no input as the person in the project, through the client `bind` gives for that one
 * action (the Host's carries only the action's own permissions and reaches only it: `bindLocalWebAction`). No plugin is named here. A
 * plugin that is not there to answer (not enabled, not offered, refused) has no key, and its stage is drawn without `data`; any other
 * failure is the page's to show.
 */
export async function declaredStageData(shown: readonly string[], bind: (action: ActionDefinition) => BoundActionClient): Promise<Record<string, unknown>> {
  const showing = new Set(shown);
  const reads = PLATFORM_PLUGIN_REGISTRATIONS.flatMap(entry => {
    const action = showing.has(entry.project_plugin_id) && !runsOnlyInHome(entry) ? stageDataAction(entry.manifest) : undefined;
    return action ? [{ id: entry.project_plugin_id, action }] : [];
  });
  const answers = await Promise.all(reads.map(async ({ id, action }) => [id, await optionalPluginQuery(bind(action), action, {})] as const));
  return Object.fromEntries(answers.filter(([, answer]) => answer !== undefined));
}

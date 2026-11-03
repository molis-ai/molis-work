import type { ActionDefinition, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { stageDataAction, stageDataInput } from "@molis-ai/molis-work-app-workbench";
import { stageRequestParams, type DeclaredPageRouteMatch } from "@molis-ai/molis-work-plugin-sdk";
import { PLATFORM_PLUGIN_REGISTRATIONS, runsOnlyInHome } from "./plugin-registry.js";
import { optionalPluginQuery } from "./web-view.js";

/**
 * The answers of the declared stage reads of the project plugins a page shows (T-133, PG-060): for each one whose stage-opening view
 * declares `stage_data`, that action, called as the person in the project with the request parameters the view names in
 * `stage_data.input` (`declaredStageRequests`; none, when it names none), through the client `bind` gives for that one action (the
 * Host's carries only the action's own permissions and reaches only it: `bindLocalWebAction`). No plugin is named here. A plugin that is
 * not there to answer (not enabled, not offered, refused) has no key, and its stage is drawn without `data`; any other failure is the
 * page's to show.
 */
export async function declaredStageData(shown: readonly string[], bind: (action: ActionDefinition) => BoundActionClient,
  requests: Readonly<Record<string, Readonly<Record<string, string>>>> = {}): Promise<Record<string, unknown>> {
  const showing = new Set(shown);
  const reads = PLATFORM_PLUGIN_REGISTRATIONS.flatMap(entry => {
    const action = showing.has(entry.project_plugin_id) && !runsOnlyInHome(entry) ? stageDataAction(entry.manifest) : undefined;
    return action ? [{ id: entry.project_plugin_id, action }] : [];
  });
  const answers = await Promise.all(reads.map(async ({ id, action }) => [id, await optionalPluginQuery(bind(action), action, requests[id] ?? {})] as const));
  return Object.fromEntries(answers.filter(([, answer]) => answer !== undefined));
}

/**
 * What each shown plugin's stage is given of the request (T-116): the parameters its `stage_data.input` names, taken from the match of the
 * page route that plugin's own Manifest declares, by project plugin id. Another plugin's route, an unmatched path and a match with a refused
 * parameter give nothing; a parameter the stage does not name, or the route does not declare, is never here. No plugin is named.
 */
export function declaredStageRequests(shown: readonly string[], match: DeclaredPageRouteMatch | null,
  entries: readonly PluginRegistration[] = PLATFORM_PLUGIN_REGISTRATIONS): Record<string, Readonly<Record<string, string>>> {
  const showing = new Set(shown);
  const requests: Record<string, Readonly<Record<string, string>>> = {};
  for (const entry of entries) {
    const input = showing.has(entry.project_plugin_id) && !runsOnlyInHome(entry) ? stageDataInput(entry.manifest) : undefined;
    if (!input || !match || match.rejected || match.plugin_id !== entry.manifest.plugin_id) continue;
    requests[entry.project_plugin_id] = stageRequestParams(input, match.params);
  }
  return requests;
}

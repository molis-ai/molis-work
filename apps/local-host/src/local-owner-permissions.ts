import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { CHARACTER_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/characters";
import { CHARACTER_ACTION_PERMISSIONS } from "@molis-ai/molis-work-module-characters";
import { WORK_ACTION_PERMISSIONS, WORK_PLUGIN_ID } from "@molis-ai/molis-work-plugin-work";
import { HOME_ACTION_PERMISSIONS } from "./home-actions.js";
import { HOME_TALK_PERMISSIONS } from "./home-talk-actions.js";
import { CONNECTOR_ACCOUNT_PERMISSIONS } from "./connector-account-actions.js";
import { CONNECTOR_MANAGEMENT_READ, CONNECTOR_MANAGEMENT_WRITE } from "./connector-management-actions.js";
import { connectorRecordActions } from "./connector-record-actions.js";
import { informationActions } from "./information-actions.js";
import { PERSONAL_PLANNING_PERMISSIONS } from "./personal-planning-actions.js";
import { ASSISTANT_RULES_PROVIDER } from "./assistant/assistant-rule-actions.js";
import { HOST_PROVIDER_ID } from "./local-host.js";
import { EXTERNAL_MCP_PERMISSION } from "./mcp-tool-actions.js";
import { NATIVE_CONTENT_PERMISSIONS } from "./content-action-providers.js";
import { SEARCH_PERMISSIONS, SEARCH_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/search";
import { PLACEMENT_PERMISSIONS, PLACEMENT_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/placement";
import { MEMORY_PERMISSIONS, MEMORY_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/memory";
import { KNOWLEDGE_PERMISSIONS, KNOWLEDGE_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/knowledge";

const asks = (definitions: Iterable<{ readonly action?: { readonly permissions: readonly string[] } }>) =>
  [...definitions].flatMap(definition => definition.action?.permissions ?? []);

/**
 * What the person at this computer holds over each provider the Host registers itself, by the provider id it registers under
 * (PG-007 stage 4). A provider the Host registers with no entry here gives the person nothing, whatever permissions its actions
 * ask: holding `artifact:write` over Characters is not holding it over every Host action that asks for it.
 *
 * The Host's own native plugins hold what their manifest actions declare — a native plugin that declares a new action needs no
 * change here. A plugin the Plugin Runtime assembles is not the Host's own, whatever its `kind`: its actions reach the person only
 * through its running installation's grants (`localWebActionContext`). The Home ones carry `runtime` in the catalog and are left
 * out here; the project ones have no catalog mark yet, and their providers name an installation, which is judged by grants alone.
 */
function ownerProviders(): ReadonlyMap<string, readonly string[]> {
  const entries: Array<readonly [string, readonly string[]]> = [
    ...BUILTIN_PLUGIN_CATALOG.filter(entry => entry.manifest.kind === "native" && !entry.runtime)
      .map(entry => [entry.manifest.plugin_id, asks(entry.manifest.actions ?? [])] as const),
    ["system.home", [...HOME_ACTION_PERMISSIONS, ...HOME_TALK_PERMISSIONS]],
    ["system.connectors", [...CONNECTOR_ACCOUNT_PERMISSIONS, CONNECTOR_MANAGEMENT_READ, CONNECTOR_MANAGEMENT_WRITE, ...connectorRecordActions.read.action.permissions]],
    ["system.information", asks(Object.values(informationActions))],
    ["system.functions", ["functions:invoke", "functions:manage"]],
    ["system.project-workspaces", ["projects:settings"]],
    [HOST_PROVIDER_ID, ["projects:settings"]],
    [CHARACTER_PLUGIN_ID, CHARACTER_ACTION_PERMISSIONS],
    [WORK_PLUGIN_ID, WORK_ACTION_PERMISSIONS],
    ["io.molis.work.goals.home", PERSONAL_PLANNING_PERMISSIONS],
    [ASSISTANT_RULES_PROVIDER, ["model:invoke"]],
    [SEARCH_PROVIDER_ID, SEARCH_PERMISSIONS],
    [KNOWLEDGE_PROVIDER_ID, [...KNOWLEDGE_PERMISSIONS, "model:invoke"]],
    [PLACEMENT_PROVIDER_ID, PLACEMENT_PERMISSIONS],
    [MEMORY_PROVIDER_ID, MEMORY_PERMISSIONS],
  ];
  const providers = new Map<string, readonly string[]>();
  for (const [provider, permissions] of entries) providers.set(provider, [...new Set([...providers.get(provider) ?? [], ...permissions])]);
  return providers;
}

let providers: ReadonlyMap<string, readonly string[]> | undefined;

/**
 * What the person holds over the Host-registered provider `providerId`. An external MCP server's tools register one provider per
 * connection (`system.connectors#mcp:<connection>`) or per plugin and server (`<plugin>#mcp:<server>`): the person holds the
 * external MCP permission over those, and nothing else.
 */
export function localOwnerPermissionsOver(providerId: string): readonly string[] {
  providers ??= ownerProviders();
  return providers.get(providerId) ?? (providerId.includes("#mcp:") ? [EXTERNAL_MCP_PERMISSION] : []);
}

/**
 * Every permission the person may carry on a call bound for them: the cap a route narrows further. Holding one here reaches no
 * Host-registered action by itself; which provider it is held over is `localOwnerPermissionsOver`'s to say.
 */
export const LOCAL_OWNER_PERMISSIONS: readonly string[] = [...new Set([
  ...NATIVE_CONTENT_PERMISSIONS, EXTERNAL_MCP_PERMISSION, ...[...ownerProviders().values()].flat(),
])];

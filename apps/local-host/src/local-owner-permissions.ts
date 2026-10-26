import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { CHARACTER_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/characters";
import { CHARACTER_ACTION_PERMISSIONS } from "@molis-ai/molis-work-module-characters";
import { HOME_ACTION_PERMISSIONS, HOME_PROVIDER_ID } from "./home-actions.js";
import { CONNECTOR_ACCOUNT_PERMISSIONS, CONNECTOR_PROVIDER_ID } from "./connector-account-actions.js";
import { CONNECTOR_MANAGEMENT_READ, CONNECTOR_MANAGEMENT_WRITE } from "./connector-management-actions.js";
import { connectorRecordActions } from "./connector-record-actions.js";
import { PLUGIN_CONSENT_PERMISSIONS, PLUGIN_CONSENT_PROVIDER_ID } from "./installed-plugin-consent-actions.js";
import { PLUGIN_INSTALL_PERMISSIONS, PLUGIN_INSTALL_PROVIDER_ID } from "./plugin-install-actions.js";
import { informationActions, INFORMATION_PROVIDER_ID } from "./information-actions.js";
import { PERSONAL_PLANNING_PERMISSIONS, PERSONAL_PLANNING_PROVIDER_ID } from "./personal-planning-actions.js";
import { ASSISTANT_RULES_PROVIDER, ASSISTANT_RULE_ACTIONS, ASSISTANT_FOLLOW_UP_ACTIONS } from "./assistant/assistant-rule-actions.js";
import { assistantThreadActions } from "./assistant/assistant-thread-actions.js";
import { FUNCTIONS_PROVIDER_ID, functionsActions, functionAuthoringActions, functionContextActions } from "@molis-ai/molis-work-module-functions";
import { projectWorkspaceActions } from "@molis-ai/molis-work-contracts/modules/projects";
import { PROJECT_WORKSPACE_PROVIDER_ID } from "./project-workspace-actions.js";
import { HOST_PROVIDER_ID } from "./local-host.js";
import { EXTERNAL_MCP_PERMISSION } from "./mcp-tool-actions.js";
import { NATIVE_CONTENT_PERMISSIONS } from "./content-action-providers.js";
import { SEARCH_PERMISSIONS, SEARCH_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/search";
import { PLACEMENT_PERMISSIONS, PLACEMENT_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/placement";
import { MEMORY_PERMISSIONS, MEMORY_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/memory";
import { KNOWLEDGE_PERMISSIONS, KNOWLEDGE_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/knowledge";
import { ARTIFACT_ACTION_PERMISSIONS, ARTIFACTS_PROVIDER_ID } from "@molis-ai/molis-work-module-artifacts";

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
    ...PLATFORM_PLUGIN_REGISTRATIONS.filter(entry => entry.manifest.kind === "native" && !entry.runtime)
      .map(entry => [entry.manifest.plugin_id, asks(entry.manifest.actions ?? [])] as const),
    [ARTIFACTS_PROVIDER_ID, ARTIFACT_ACTION_PERMISSIONS],
    [HOME_PROVIDER_ID, HOME_ACTION_PERMISSIONS],
    [CONNECTOR_PROVIDER_ID, [...CONNECTOR_ACCOUNT_PERMISSIONS, CONNECTOR_MANAGEMENT_READ, CONNECTOR_MANAGEMENT_WRITE, ...connectorRecordActions.read.action.permissions]],
    [PLUGIN_CONSENT_PROVIDER_ID, PLUGIN_CONSENT_PERMISSIONS],
    [PLUGIN_INSTALL_PROVIDER_ID, PLUGIN_INSTALL_PERMISSIONS],
    [INFORMATION_PROVIDER_ID, asks(Object.values(informationActions))],
    [FUNCTIONS_PROVIDER_ID, asks([...Object.values(functionsActions), ...Object.values(functionAuthoringActions), ...Object.values(functionContextActions)])],
    [PROJECT_WORKSPACE_PROVIDER_ID, asks(Object.values(projectWorkspaceActions))],
    [CHARACTER_PLUGIN_ID, CHARACTER_ACTION_PERMISSIONS],
    [PERSONAL_PLANNING_PROVIDER_ID, PERSONAL_PLANNING_PERMISSIONS],
    [ASSISTANT_RULES_PROVIDER, asks([...Object.values(ASSISTANT_RULE_ACTIONS), ...Object.values(ASSISTANT_FOLLOW_UP_ACTIONS), ...Object.values(assistantThreadActions)])],
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
 * What the person holds over the Host-registered provider `providerId`, for an action that asks `asked`. The Host's own provider
 * (`HOST_PROVIDER_ID`, what `registerAction` uses when a definition names no provider: workspace reads, Git reviews, writer
 * folders, the Agent Host) is only ever registered by Host code, so the person holds what each of its actions asks; the route's cap
 * still narrows it. An external MCP server's tools register one provider per connection (`system.connectors#mcp:<connection>`) or
 * per plugin and server (`<plugin>#mcp:<server>`): the person holds the external MCP permission over those, and nothing else.
 */
export function localOwnerPermissionsOver(providerId: string, asked: readonly string[] = []): readonly string[] {
  if (providerId === HOST_PROVIDER_ID) return asked;
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

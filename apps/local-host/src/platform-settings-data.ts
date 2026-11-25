import type { MolisWorkSettingsView, PlatformSettingsPage, WebSettingsProject } from "@molis-ai/molis-work-app-workbench";
import { renderCharacters } from "@molis-ai/molis-work-app-workbench";
import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import { readRollbackHold, readRollbackPoint } from "./installer/home-rollback.js";
import { openedAgentDefinitions } from "./agent-definitions/agent-definitions.js";
import { agentDisplayModel } from "./agent-definitions/display-words.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { listConnectorConnectionViews } from "./connector-connection-views.js";
import { functionsConnectionStatus } from "./judgment-rules-host.js";
import { mcpAccessPageModel } from "./mcp-action-access.js";
import { withModelChecks } from "./model-provider-checks.js";
import { modelTemplatePageData } from "./model-provider-setup.js";
import { modelAddressFromTemplate, modelKeyHint } from "./model-provider-templates.js";
import { PERSONAL_SPACE_PROJECT_ID } from "./personal-space.js";
import { mergePluginDirectories, pagePluginDirectory, runningPluginDirectory } from "./plugin-directory.js";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { runningProjectPlatform } from "./project-plugins.js";
import { selectedTypeSafeConnection } from "./typesafe-connection.js";
import { callDiagnosticsView } from "./web-call-diagnostics.js";
import type { CatalogRequestContext } from "./web-catalog-routes.js";
import { connectorSettingsView } from "./web-connector-settings.js";
import { currentLocale, inLanguagePreview } from "./web-locale.js";
import { webSearchSettingsView } from "./web-search-http.js";

/** What a platform settings page is asked with: the request, and the project its settings were opened from. */
interface SettingsPageRequest {
  readonly ctx: CatalogRequestContext;
  readonly projects: readonly WebSettingsProject[];
  readonly contextProject: WebSettingsProject | null;
}
type SettingsPageData = (page: SettingsPageRequest) => Partial<MolisWorkSettingsView> | Promise<Partial<MolisWorkSettingsView>>;

/**
 * Settings › 角色 (docs/design/role-scope, plan C): the person's default and their own roles, read in the personal space where every
 * Characters action already answers; a project's default and members are in that project's settings. System and plugin roles are
 * listed here too.
 */
const charactersSettings: SettingsPageData = ({ ctx: { serverOptions: { homeDirectory: home } } }) => ({ plugin_settings_html: renderCharacters({ route_prefix: `/projects/${PERSONAL_SPACE_PROJECT_ID}`, scope: "personal", primitives: { escape: escapeHtml },
    ...(home && inLanguagePreview() ? { agent_display_model: agentDisplayModel(openedAgentDefinitions(home)?.registrations() ?? [], currentLocale() ?? undefined, "role") } : {}) }) });

/** 设置 › 更新 (U3 §5.4): read only, no store opened. */
function updateView(home: string) {
  const held = readRollbackHold(home);
  return { point: readRollbackPoint(home), held: held ? { held_version: held.held_version, rolled_back_from: held.rolled_back_from.version } : null };
}

/** The plugins the context project runs, when it is open here; a settings page starts none to list them. */
async function projectDirectory(host: MolisWorkLocalHost, project: WebSettingsProject | null) {
  if (!project) return [];
  return host.withProject(molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }), async runtime => {
    const platform = await runningProjectPlatform(runtime.store, runtime.project_id);
    return platform ? runningPluginDirectory(platform.supervisor) : [];
  }).catch(() => []);   // a project that cannot be read now adds no plugin; the Home's and the market's stay
}

/**
 * What the Host reads for each platform settings page, beside what every settings page has (`PLATFORM_SETTINGS_REGISTRY` in the workbench
 * lists the pages). A page that needs nothing of its own has no entry; the settings route asks the opened page's and no other's.
 */
export const PLATFORM_SETTINGS_DATA: Readonly<Partial<Record<PlatformSettingsPage, SettingsPageData>>> = {
  authorizations: ({ ctx: { url } }) => url.searchParams.get("view") === "project-rules" ? { show_project_approval_rules: true } : {},
  characters: charactersSettings,
  connectors: async ({ ctx: { localHost, serverOptions: { homeDirectory }, url }, contextProject }) => ({
    plugin_directory: mergePluginDirectories(await projectDirectory(localHost, contextProject), await pagePluginDirectory(localHost.homePlugins)),
    ...await connectorSettingsView(localHost, homeDirectory, url, contextProject
      ? molisWorkHostProjectReference({ databasePath: contextProject.database_path, projectId: contextProject.project_id }) : undefined),
    ...(homeDirectory ? { functions_settings: {
      settings: functionsConnectionStatus(homeDirectory),
      connections: listConnectorConnectionViews(homeDirectory, "typesafe"),
      selected_connection_id: selectedTypeSafeConnection(homeDirectory)?.connection_id,
    } } : {}),
  }),
  diagnostics: ({ ctx: { localHost, url, composition } }) => ({ ...callDiagnosticsView(localHost.callLog, url), periodic_tasks: composition.periodicTasks.list() }),
  mcp: async ({ ctx: { serverOptions: { homeDirectory }, localHost, url, runtimeIntegrations, composition }, projects }) => homeDirectory ? {
    mcp_access: await mcpAccessPageModel({ home: homeDirectory, host: localHost, url, clients: runtimeIntegrations.clientDescriptors(), projects: [...projects], withCatalog: composition.withCatalog }),
  } : {},
  models: async ({ ctx: { serverOptions: { homeDirectory }, url, composition } }) => ({ model_settings: await composition.withCatalog({ homeDirectory }, catalog => {
    const connections = homeDirectory ? listConnectorConnectionViews(homeDirectory, "model-api") : [];
    const providers = catalog.models.list(), templates = modelTemplatePageData(url.searchParams);
    const selected = url.searchParams.get("provider");
    const shown = templates.draft_provider ?? providers.find((provider) => provider.provider_id === selected) ?? providers[0];
    // Which key each provider holds, read in one pass over the connections rather than one open per provider and connection.
    const refs = connections.length ? withConnectorConnections(homeDirectory!, (store) =>
      new Map(connections.map((connection) => [store.require(connection.connection_id).credential_ref, connection.connection_id])), "required") : new Map<string | null, string>();
    return {
      // Each provider's last real check, so the page says "checked at …" or "never checked" rather than guessing (PF-A04).
      providers, health: withModelChecks(homeDirectory, providers, catalog.models.health()), connections,
      selected_connection_ids: Object.fromEntries(providers.map((provider) => [provider.provider_id, refs.get(provider.credential_ref) ?? ""])),
      selected_provider_id: selected,
      ...(shown ? {
        key_hint: modelKeyHint(shown.base_url, templates.draft_template_id),
        address_from_template: modelAddressFromTemplate(shown.base_url, templates.draft_template_id),
      } : {}),
      ...templates,
    };
  }) }),
  prompts: ({ ctx: { serverOptions: { homeDirectory } } }) => homeDirectory && inLanguagePreview()
    ? { agent_display_model: agentDisplayModel(openedAgentDefinitions(homeDirectory)?.registrations() ?? [], currentLocale() ?? undefined) } : {},
  runtimes: async ({ ctx: { runtimeIntegrations } }) => ({ runtimes: await runtimeIntegrations.detectAll() }),
  update: ({ ctx: { serverOptions: { homeDirectory } } }) => homeDirectory ? { update: updateView(homeDirectory) } : {},
  "web-search": async ({ ctx: { serverOptions: { homeDirectory }, localHost } }) => homeDirectory ? { web_search: await webSearchSettingsView(localHost) } : {},
};

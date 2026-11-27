import { resolveActionProviderId } from "@molis-ai/molis-work-plugin-runtime";
import { assertStageInstallation, installedStageIdentity } from "./installed-stage-identity.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { projectPluginJudge } from "./project-action-availability.js";
import { refusedOwner } from "./web-owner-unavailable.js";
import type { CapabilitySection, DynamicPluginSettingsNavItem, MolisWorkSettingsView, PlatformSettingsPage, WebSettingsProject } from "@molis-ai/molis-work-app-workbench";
import { findPluginSettingsNavItem, platformSettingsAt, pluginSettingsDataAction, renderCharacters, renderPluginSettingsContribution } from "@molis-ai/molis-work-app-workbench";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SettingsDeclaration, SettingsValues } from "@molis-ai/molis-work-contracts/platform/settings";
import type { SettingsPageContext, SettingsPageModel } from "@molis-ai/molis-work-contracts/platform/ui";
import { actionErrorBody, actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { capabilitiesView } from "./web-capabilities.js";
import { installedPluginManifest } from "./plugin-installation-directory.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { runningProjectPlatform } from "./project-plugins.js";
import { shownProjectPlugins } from "./plugin-registry.js";
import { readLocalWebBody, sendLocalWebJson as sendJson } from "./web-http.js";
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
import { mergePluginDirectories, pagePluginDirectory, runningPluginDirectory } from "./plugin-directory.js";
import { selectedTypeSafeConnection } from "./typesafe-connection.js";
import { callDiagnosticsView } from "./web-call-diagnostics.js";
import { connectorSettingsView } from "./web-connector-settings.js";
import { webSearchSettingsView } from "./web-search-http.js";
import { currentLocale, inLanguagePreview, readText } from "./web-locale.js";
import { PERSONAL_SPACE_PROJECT_ID } from "./personal-space.js";
import type { LocalWebComposition } from "./web-composition.js";
import type { CatalogRequestContext } from "./web-catalog-routes.js";

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

interface DiscoveredDynamicSettingsPlugin extends DynamicPluginSettingsNavItem {
  readonly manifest: PluginManifest;
  readonly declaration: SettingsDeclaration;
  readonly scope: "home" | "project";
  readonly record: PluginInstanceRecord;
  assertCurrent(): void;
  readonly readAction: ActionDefinition;
  readonly writeAction: ActionDefinition;
}

/**
 * Discover running plugins declaring general `settings_entries` (without a custom `settings-page` UI view),
 * covering both built-in, fixture, and signed third-party sandbox packages uniformly (PEQ-05, P1-1).
 */
async function discoverDynamicSettingsPlugins(
  localHost: MolisWorkLocalHost,
  contextProject: WebSettingsProject | null,
  shownInProject: (pluginId: string) => boolean = () => true,
): Promise<DiscoveredDynamicSettingsPlugin[]> {
  const found: DiscoveredDynamicSettingsPlugin[] = [];
  const register = (manifest: PluginManifest | undefined, scope: "home" | "project", record: PluginInstanceRecord, current: () => PluginInstanceRecord | null) => {
    if (!manifest?.settings_entries?.entries.length) return;
    if (manifest.ui?.views?.some(view => view.slot === "settings")) return;
    const readAction = manifest.actions?.find(a => a.capability_id === manifest.settings_entries!.read.capability_id && a.version === manifest.settings_entries!.read.version);
    const writeAction = manifest.actions?.find(a => a.capability_id === manifest.settings_entries!.write.capability_id && a.version === manifest.settings_entries!.write.version);
    if (!readAction || !writeAction || readAction.action.scope !== scope || writeAction.action.scope !== scope) return;
    const providerId = resolveActionProviderId(record);
    const installation = installedStageIdentity(scope, record);
    found.push({
      section_id: manifest.plugin_id + "~" + scope + "~" + record.install_id,
      plugin_id: manifest.plugin_id,
      label: manifest.name + " · " + readText(scope === "home" ? "workbench.settings-assistant.personal" : "workbench.settings-assistant.current-project"),
      manifest,
      declaration: manifest.settings_entries,
      scope,
      record,
      assertCurrent: () => assertStageInstallation(scope, current(), installation),
      readAction: { ...readAction, provider_id: providerId },
      writeAction: { ...writeAction, provider_id: providerId },
    });
  };
  if (localHost.homePlugins) {
    try {
      await localHost.homePlugins.ready();
      for (const record of localHost.homePlugins.installations(false, true)) {
        if (record.state !== "running") continue;
        register(localHost.homePlugins.manifest(record.plugin_id), "home", record, () => localHost.homePlugins?.installation(record.install_id) ?? null);
      }
    } catch { /* Home plugin host unavailable or preview-only */ }
  }
  if (contextProject) {
    const projectRef = molisWorkHostProjectReference({ databasePath: contextProject.database_path, projectId: contextProject.project_id });
    try {
      await bindLocalWebActions(localHost, projectRef, LOCAL_OWNER_PERMISSIONS).discover();
      await localHost.withProject(projectRef, async runtime => {
        const platform = await runningProjectPlatform(runtime.store, runtime.project_id);
        if (!platform) return;
        for (const record of platform.runtime.list()) {
          // A plugin hidden in this project has no settings here, as it has no place in the project's pages.
          if (record.state !== "running" || !shownInProject(record.plugin_id)) continue;
          const manifest = installedPluginManifest(runtime.store.db, record.install_id)?.manifest ?? platform.supervisor.manifest(record.plugin_id);
          register(manifest, "project", record, () => platform.runtime.get(record.install_id));
        }
      });
    } catch { /* Project plugin runtime unavailable */ }
  }
  return found;
}

function renderDynamicPluginSettingsHtml(
  plugin: DiscoveredDynamicSettingsPlugin,
  values: SettingsValues,
  projectId: string | null,
): string {
  const byKey = new Map(values.values.map(item => [item.key, item]));
  const rows = plugin.declaration.entries.map(entry => {
    const current = byKey.get(entry.key);
    const title = "literal" in entry.title ? entry.title.literal : (entry.title.fallback ?? entry.key);
    const summary = entry.summary ? ("literal" in entry.summary ? entry.summary.literal : (entry.summary.fallback ?? "")) : "";
    const valueText = current?.state === "ok" ? (typeof current.value === "string" ? current.value : JSON.stringify(current.value)) : (current?.reason ?? "");
    const source = current?.state === "ok" ? current.source : "unavailable";
    const defaultLayer = entry.layers[0] ?? (plugin.scope === "project" ? "project" : "personal");
    const revision = current?.state === "ok" ? current.layer_revisions?.[defaultLayer] ?? current.revision : "";
    const options = entry.schema.enum;
    const field = options?.length ? `<select name="value" data-format="json">${options.map(option => `<option value="${escapeSettingsHtml(JSON.stringify(option))}"${current?.state === "ok" && JSON.stringify(current.value) === JSON.stringify(option) ? " selected" : ""}>${escapeSettingsHtml(typeof option === "string" ? option : JSON.stringify(option))}</option>`).join("")}</select>`
      : entry.schema.type === "boolean" ? `<input name="value" type="checkbox"${current?.state === "ok" && current.value === true ? " checked" : ""}>`
      : entry.schema.type === "string" ? `<input name="value" type="text" value="${escapeSettingsHtml(valueText)}">`
      : `<textarea name="value" data-format="json">${escapeSettingsHtml(valueText)}</textarea>`;
    return `<div class="settings-row" data-plugin-setting-key="${escapeSettingsHtml(entry.key)}" data-plugin-setting-revision="${escapeSettingsHtml(revision)}" data-plugin-setting-layer="${escapeSettingsHtml(defaultLayer)}">
      <div class="settings-row-copy"><strong>${escapeSettingsHtml(title)}</strong>${summary ? `<p>${escapeSettingsHtml(summary)}</p>` : ""}<span class="settings-row-meta">${escapeSettingsHtml(source)}</span></div>
      <div class="settings-row-control">${current?.state === "ok" ? `<form data-plugin-setting-editor aria-label="${escapeSettingsHtml(title)}"><label><span class="sr-only">${escapeSettingsHtml(title)}</span>${field}</label><button type="submit" class="mw-btn mw-btn--secondary">${escapeSettingsHtml(readText("workbench.settings.apply"))}</button><output aria-live="polite"></output></form>` : `<span data-plugin-setting-value>${escapeSettingsHtml(valueText)}</span>`}</div>
    </div>`;
  }).join("");
  return `<section class="settings-section" data-dynamic-plugin-settings="${escapeSettingsHtml(plugin.plugin_id)}" data-plugin-install-id="${escapeSettingsHtml(plugin.record.install_id)}" data-manifest-digest="${escapeSettingsHtml(plugin.record.manifest_digest)}" data-installation-generation="${escapeSettingsHtml(plugin.record.installation_generation)}" data-plugin-scope="${plugin.scope}" data-dynamic-plugin-project="${escapeSettingsHtml(projectId ?? "")}">
    <header class="settings-section-header"><h1>${escapeSettingsHtml(plugin.label)}</h1></header>
    <div class="settings-card">${rows}</div>
  </section>`;
}

/** Whether a project plugin is enabled in the project the settings were opened from (the same judge the project's actions use). */
async function projectShownJudge(composition: LocalWebComposition, homeDirectory: string | undefined, project: WebSettingsProject | null): Promise<(pluginId: string) => boolean> {
  if (!project || !homeDirectory) return () => true;
  return composition.withCatalog({ homeDirectory }, catalog => {
    const judge = projectPluginJudge(catalog, project.project_id, homeDirectory);
    return (pluginId: string) => judge(pluginId) !== false;
  });
}

/** A project's plugins as the settings show them; what they show is the Host's to say (W5-02 B1): without a project, the personal plugins. */
async function pluginMembership(composition: LocalWebComposition, homeDirectory: string | undefined, projectId: string | null): Promise<{
  plugins: readonly string[] | undefined; hidden: readonly string[] | undefined; shown: readonly string[];
}> {
  if (!projectId || !homeDirectory) return { plugins: undefined, hidden: undefined, shown: shownProjectPlugins([]) };
  return composition.withCatalog({ homeDirectory }, (catalog) => {
    const { plugins, hidden } = catalog.projectPluginMembership(projectId);
    return { plugins, hidden, shown: shownProjectPlugins(plugins, hidden) };
  });
}

/** The settings and capability pages: one GET route, the page the address names, with the facts of the project it was opened from. */
export async function handleSettingsPage(ctx: CatalogRequestContext): Promise<boolean> {
  const { request, response, url, serverOptions, webService, controlToken, localHost, composition } = ctx;
  const { PAGE_CSP, isDesktopShellRequest, projectSettings } = composition;
  const { renderMolisWorkSettings } = composition.workbenchRenderer;
  const opened = request.method === "GET" ? platformSettingsAt(url.pathname) : null;
  if (!opened) return false;
  const { page: section, rules } = opened;
  const capabilitySection = opened.section.root === "/capabilities/" ? opened.section.id as CapabilitySection : undefined;
  // A page that is not the project list still opens while the catalog is refused for its version (U3 §2.4), with no project to pick;
  // a page whose own facts are in the catalog (the models) meets the same refusal and gets its card.
  const projects = await projectSettings.settingsProjects(serverOptions.homeDirectory).catch((error: unknown) => {
    if (refusedOwner(serverOptions.homeDirectory, error)?.block.kind === "projects") return [];
    throw error;
  });
  const contextProjectId = url.searchParams.get("project");
  const contextProject = contextProjectId
    ? projects.find((project) => project.project_id === contextProjectId) ?? null
    : null;
  // The view keeps every partition (a page opened from the personal space resolves and labels it); the installation counts the
  // person's projects only (S-personal-partition-reserved).
  const personProjects = projects.filter((project) => project.project_id !== PERSONAL_SPACE_PROJECT_ID);
  if (capabilitySection && capabilitySection !== "access" && contextProjectId && !contextProject) {
    sendJson(response, 404, { error: "找不到所选项目，请返回能力库重新选择。" });
    return true;
  }
  const capabilities = capabilitySection && serverOptions.homeDirectory ? await capabilitiesView({ section: capabilitySection, url,
    homeDirectory: serverOptions.homeDirectory, host: localHost, withCatalog: composition.withCatalog }) : undefined;
  const page = await PLATFORM_SETTINGS_DATA[section]?.({ ctx, projects, contextProject }) ?? {};
  const membership = await pluginMembership(composition, serverOptions.homeDirectory, contextProject?.project_id ?? null);
  const dynamicPlugins = await discoverDynamicSettingsPlugins(localHost, contextProject, await projectShownJudge(composition, serverOptions.homeDirectory, contextProject));
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": PAGE_CSP,
  });
  response.end(renderMolisWorkSettings({
    section,
    capabilities: capabilities ? { ...capabilities, rules } : undefined,
    ...(dynamicPlugins.length ? { dynamic_plugin_settings: dynamicPlugins.map(({ section_id, plugin_id, label }) => ({ section_id, plugin_id, label })) } : {}),
    context_project: contextProject,
    enabled_plugins: membership.plugins,
    hidden_plugins: membership.hidden,
    shown_plugins: membership.shown,
    runtimes: [],
    projects,
    web_service: await webService.detect(),
    diagnostics: composition.installationDiagnostics(personProjects.length),
    ...page,
  }, controlToken, isDesktopShellRequest(request, url)));
  return true;
}

/** One route for every plugin's settings page (built-in UI contributions AND dynamically discovered `settings_entries` plugins). */
export async function handlePluginSettingsPage(ctx: CatalogRequestContext): Promise<boolean> {
  const { request, response, url, serverOptions, webService, controlToken, localHost, composition, agentRuntimes } = ctx;
  const { PAGE_CSP, isDesktopShellRequest, projectSettings } = composition;
  const { renderMolisWorkSettings } = composition.workbenchRenderer;
  if (request.method === "POST" && url.pathname === "/api/settings/plugin-entries/write" && serverOptions.homeDirectory) {
    if (pluginPageRequest(request)) { sendJson(response, 403, { error: "插件页面不能代本人修改其他插件设置" }); return true; }
    try {
      const body = await readLocalWebBody(request);
      const pluginId = typeof body.plugin_id === "string" ? body.plugin_id : "";
      const projectId = typeof body.project_id === "string" && body.project_id ? body.project_id : null;
      const projects = await projectSettings.settingsProjects(serverOptions.homeDirectory).catch(() => [] as WebSettingsProject[]);
      const contextProject = projectId ? projects.find(p => p.project_id === projectId) ?? null : null;
      const dynamicPlugins = await discoverDynamicSettingsPlugins(localHost, contextProject, await projectShownJudge(composition, serverOptions.homeDirectory, contextProject));
      const target = dynamicPlugins.find(item => item.plugin_id === pluginId && item.scope === body.scope
        && item.record.install_id === body.plugin_install_id && item.record.installation_generation === body.installation_generation && item.record.manifest_digest === body.manifest_digest);
      if (!target || projectId && !contextProject) throw new ActionError("actions.provider_changed", "这份插件设置已变化，请重新打开");
      const projectRef = target.scope === "project" && contextProject
        ? molisWorkHostProjectReference({ databasePath: contextProject.database_path, projectId: contextProject.project_id })
        : undefined;
      const writeInput = {
        key: body.key, layer: body.layer, change: body.change, expected_revision: body.expected_revision, request_id: body.request_id,
        ...(body.recovery !== undefined ? { recovery: body.recovery } : {}),
      };
      const result = await bindLocalWebActions(localHost, projectRef, LOCAL_OWNER_PERMISSIONS, { assertCurrent: target.assertCurrent }).invoke(target.writeAction, writeInput);
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, actionHttpStatus(error), actionErrorBody(error));
    }
    return true;
  }
  const rawSlug = url.pathname.match(/^\/settings\/([^/]+)$/)?.[1];
  let pluginSettingsSlug: string | undefined;
  try { pluginSettingsSlug = rawSlug ? decodeURIComponent(rawSlug) : undefined; } catch { return false; }
  if (!(request.method === "GET" && pluginSettingsSlug && serverOptions.homeDirectory)) return false;
  const pluginSettings = findPluginSettingsNavItem(pluginSettingsSlug);
  const projects = await projectSettings.settingsProjects(serverOptions.homeDirectory).catch((error: unknown) => {
    if (refusedOwner(serverOptions.homeDirectory, error)?.block.kind === "projects") return [];
    throw error;
  });
  const contextProjectId = url.searchParams.get("project");
  const contextProject = contextProjectId
    ? projects.find((project) => project.project_id === contextProjectId) ?? null
    : null;
  // The view keeps every partition (a page opened from the personal space resolves and labels it); the installation counts the
  // person's projects only (S-personal-partition-reserved).
  const personProjects = projects.filter((project) => project.project_id !== PERSONAL_SPACE_PROJECT_ID);
  const dynamicPlugins = await discoverDynamicSettingsPlugins(localHost, contextProject, await projectShownJudge(composition, serverOptions.homeDirectory, contextProject));
  const matching = dynamicPlugins.filter(item => item.section_id === pluginSettingsSlug || item.plugin_id === pluginSettingsSlug);
  if (!pluginSettings && matching.length > 1) { sendJson(response, 409, { error: "请从设置菜单选择要打开的插件安装" }); return true; }
  const dynamicTarget = pluginSettings ? undefined : matching[0];
  if (!pluginSettings && !dynamicTarget) return false;
  let plugin_settings_html: string;
  let sectionId: string;
  if (pluginSettings) {
    // One route for every plugin's settings page (W5-02 PR-D, PG-072): the platform's facts in one shape, and the answer of the read
    // action the page's Manifest view declares (`settings_data`). The Host knows no plugin here; the page renders what it is given.
    const context: SettingsPageContext = {
      projects: projects.map((project) => ({ project_id: project.project_id, name: project.display_name })),
      project: contextProject ? { project_id: contextProject.project_id, name: contextProject.display_name, href: `/projects/${encodeURIComponent(contextProject.project_id)}/` } : null,
      runtimes: pluginSettings.settings_runtimes ? await agentRuntimes() : [],
    };
    const dataAction = pluginSettingsDataAction(pluginSettings.contribution_id);
    const data = dataAction ? await bindLocalWebActions(localHost, undefined, LOCAL_OWNER_PERMISSIONS).invoke(dataAction, {}) : undefined;
    const model: SettingsPageModel = { context, data, primitives: { escape: escapeSettingsHtml, text: readText } };
    plugin_settings_html = renderPluginSettingsContribution(pluginSettings.contribution_id, model);
    sectionId = pluginSettings.section_id;
  } else {
    const projectRef = dynamicTarget!.scope === "project" && contextProject
      ? molisWorkHostProjectReference({ databasePath: contextProject.database_path, projectId: contextProject.project_id })
      : undefined;
    const values = await bindLocalWebActions(localHost, projectRef, LOCAL_OWNER_PERMISSIONS, { assertCurrent: dynamicTarget!.assertCurrent }).invoke(dynamicTarget!.readAction, { keys: dynamicTarget!.declaration.entries.map(entry => entry.key) }) as SettingsValues;
    plugin_settings_html = renderDynamicPluginSettingsHtml(dynamicTarget!, values, contextProject?.project_id ?? null);
    sectionId = dynamicTarget!.section_id;
  }
  const membership = await pluginMembership(composition, serverOptions.homeDirectory, contextProject?.project_id ?? null);
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": PAGE_CSP,
  });
  response.end(renderMolisWorkSettings({
    section: sectionId,
    plugin_settings_html,
    ...(dynamicPlugins.length ? { dynamic_plugin_settings: dynamicPlugins.map(({ section_id, plugin_id, label }) => ({ section_id, plugin_id, label })) } : {}),
    context_project: contextProject,
    enabled_plugins: membership.plugins,
    hidden_plugins: membership.hidden,
    shown_plugins: membership.shown,
    runtimes: [],
    projects,
    web_service: await webService.detect(),
    diagnostics: composition.installationDiagnostics(personProjects.length),
  }, controlToken, isDesktopShellRequest(request, url)));
  return true;
}

function escapeSettingsHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

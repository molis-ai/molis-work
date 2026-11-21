import { readRollbackHold, readRollbackPoint } from "./installer/home-rollback.js";
import { projectPluginJudge } from "./project-action-availability.js";
import { refusedOwner } from "./web-owner-unavailable.js";
import type { CapabilitySection, DynamicPluginSettingsNavItem, WebSettingsProject, WebSettingsSection } from "@molis-ai/molis-work-app-workbench";
import { findPluginSettingsNavItem, pluginSettingsDataAction, renderCharacters, renderPluginSettingsContribution } from "@molis-ai/molis-work-app-workbench";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SettingsDeclaration, SettingsValues } from "@molis-ai/molis-work-contracts/platform/settings";
import type { SettingsPageContext, SettingsPageModel } from "@molis-ai/molis-work-contracts/platform/ui";
import { actionErrorBody, actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { mcpAccessPageModel } from "./mcp-action-access.js";
import { functionsConnectionStatus } from "./judgment-rules-host.js";
import { capabilitiesView } from "./web-capabilities.js";
import { callDiagnosticsView } from "./web-call-diagnostics.js";
import { connectorSettingsView } from "./web-connector-settings.js";
import { webSearchSettingsView } from "./web-search-http.js";
import { listConnectorConnectionViews } from "./connector-connection-views.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { modelTemplatePageData } from "./model-provider-setup.js";
import { withModelChecks } from "./model-provider-checks.js";
import { modelAddressFromTemplate, modelKeyHint } from "./model-provider-templates.js";
import { selectedTypeSafeConnection } from "./typesafe-connection.js";
import { installedPluginManifest } from "./plugin-installation-directory.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { runningProjectPlatform } from "./project-plugins.js";
import { shownProjectPlugins } from "./plugin-registry.js";
import { readLocalWebBody, sendLocalWebJson as sendJson } from "./web-http.js";
import { readText, currentLocale, inLanguagePreview } from "./web-locale.js";
import { PERSONAL_SPACE_PROJECT_ID } from "./personal-space.js";
import { openedAgentDefinitions } from "./agent-definitions/agent-definitions.js";
import { agentDisplayModel } from "./agent-definitions/display-words.js";
import type { LocalWebComposition } from "./web-composition.js";
import type { CatalogRequestContext } from "./web-catalog-routes.js";

interface DiscoveredDynamicSettingsPlugin extends DynamicPluginSettingsNavItem {
  readonly manifest: PluginManifest;
  readonly declaration: SettingsDeclaration;
  readonly scope: "home" | "project";
  readonly provider_id: string;
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
  const found = new Map<string, DiscoveredDynamicSettingsPlugin>();
  const register = (manifest: PluginManifest | undefined, scope: "home" | "project", providerId: string) => {
    if (!manifest?.settings_entries?.entries.length) return;
    if (manifest.ui?.views?.some(view => view.slot === "settings")) return;
    const modelKey = manifest.settings_entries.model_configuration?.key;
    const nonModel = manifest.settings_entries.entries.filter(entry => entry.key !== modelKey);
    if (!nonModel.length) return;
    const readAction = manifest.actions?.find(a => a.capability_id === manifest.settings_entries!.read.capability_id && a.version === manifest.settings_entries!.read.version);
    const writeAction = manifest.actions?.find(a => a.capability_id === manifest.settings_entries!.write.capability_id && a.version === manifest.settings_entries!.write.version);
    if (!readAction || !writeAction || readAction.action.scope !== scope || writeAction.action.scope !== scope) return;
    if (found.has(manifest.plugin_id)) return;
    found.set(manifest.plugin_id, {
      section_id: manifest.plugin_id,
      plugin_id: manifest.plugin_id,
      label: manifest.name,
      manifest,
      declaration: manifest.settings_entries,
      scope,
      provider_id: providerId,
      readAction: { ...readAction, provider_id: providerId },
      writeAction: { ...writeAction, provider_id: providerId },
    });
  };
  if (localHost.homePlugins) {
    try {
      await localHost.homePlugins.ready();
      for (const record of localHost.homePlugins.installations(false, true)) {
        if (record.state !== "running") continue;
        const providerId = record.publisher_trust === "host" ? record.plugin_id : record.execution === "sandbox" ? `plugin:${record.plugin_id}` : record.install_id;
        register(localHost.homePlugins.manifest(record.plugin_id), "home", providerId);
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
          const providerId = record.publisher_trust === "host" ? record.plugin_id : record.execution === "sandbox" ? `plugin:${record.plugin_id}` : record.install_id;
          register(manifest, "project", providerId);
        }
      });
    } catch { /* Project plugin runtime unavailable */ }
  }
  return [...found.values()];
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
    const revision = current?.revision ?? "";
    const defaultLayer = entry.layers[0] ?? (plugin.scope === "project" ? "project" : "personal");
    return `<div class="settings-row" data-plugin-setting-key="${escapeSettingsHtml(entry.key)}" data-plugin-setting-revision="${escapeSettingsHtml(revision)}" data-plugin-setting-layer="${escapeSettingsHtml(defaultLayer)}">
      <div class="settings-row-copy"><strong>${escapeSettingsHtml(title)}</strong>${summary ? `<p>${escapeSettingsHtml(summary)}</p>` : ""}<span class="settings-row-meta">${escapeSettingsHtml(source)}</span></div>
      <div class="settings-row-control"><span data-plugin-setting-value>${escapeSettingsHtml(valueText)}</span></div>
    </div>`;
  }).join("");
  return `<section class="settings-section" data-dynamic-plugin-settings="${escapeSettingsHtml(plugin.plugin_id)}" data-dynamic-plugin-project="${escapeSettingsHtml(projectId ?? "")}">
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
  const { request, response, url, serverOptions, runtimeIntegrations, webService, controlToken, localHost, composition } = ctx;
  const { PAGE_CSP, isDesktopShellRequest, projectSettings } = composition;
  const { renderMolisWorkSettings } = composition.workbenchRenderer;
  const settingsPageMatch = url.pathname.match(/^\/settings\/(appearance|directories|models|runtimes|assistant|authorizations|characters|prompts|kit|memory|work-records|mcp|connectors|web-search|projects|diagnostics|update|running|sync)$/);
  const capabilityPageMatch = url.pathname.match(/^\/capabilities\/(library|connections|access|history|rules)$/);
  if (!(request.method === "GET" && (settingsPageMatch || capabilityPageMatch))) return false;
  const rules = capabilityPageMatch?.[1] === "rules";
  const capabilitySection = (rules ? "library" : capabilityPageMatch?.[1]) as CapabilitySection | undefined;
  const section = (capabilitySection === "connections" ? "connectors" : capabilitySection === "access" ? "mcp" : capabilitySection ?? settingsPageMatch![1]) as WebSettingsSection;
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
  if (capabilitySection && capabilitySection !== "access" && contextProjectId && !contextProject) {
    sendJson(response, 404, { error: "找不到所选项目，请返回能力库重新选择。" });
    return true;
  }
  const characters = section === "characters" ? charactersSettings(serverOptions.homeDirectory) : undefined;
  const capabilities = capabilitySection && serverOptions.homeDirectory ? await capabilitiesView({ section: capabilitySection, url,
    homeDirectory: serverOptions.homeDirectory, host: localHost, withCatalog: composition.withCatalog }) : undefined;
  const mcp_access = section === "mcp" && serverOptions.homeDirectory ? await mcpAccessPageModel({
    home: serverOptions.homeDirectory, host: localHost, url, clients: runtimeIntegrations.clientDescriptors(), projects, withCatalog: composition.withCatalog,
  }) : undefined;
  const runtimes = section === "runtimes" ? await runtimeIntegrations.detectAll() : [];
  const modelConnections = section === "models" && serverOptions.homeDirectory
    ? listConnectorConnectionViews(serverOptions.homeDirectory, "model-api") : [];
  const model_settings = section === "models" ? await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, (catalog) => {
    const providers = catalog.models.list(), templates = modelTemplatePageData(url.searchParams);
    const selected = url.searchParams.get("provider");
    const shown = templates.draft_provider ?? providers.find((provider) => provider.provider_id === selected) ?? providers[0];
    // Which key each provider holds, read in one pass over the connections rather than one open per provider and connection.
    const refs = modelConnections.length ? withConnectorConnections(serverOptions.homeDirectory!, (store) =>
      new Map(modelConnections.map((connection) => [store.require(connection.connection_id).credential_ref, connection.connection_id])), "required") : new Map<string | null, string>();
    return {
      // Each provider's last real check, so the page says "checked at …" or "never checked" rather than guessing (PF-A04).
      providers, health: withModelChecks(serverOptions.homeDirectory, providers, catalog.models.health()), connections: modelConnections,
      selected_connection_ids: Object.fromEntries(providers.map((provider) => [provider.provider_id, refs.get(provider.credential_ref) ?? ""])),
      selected_provider_id: selected,
      ...(shown ? {
        key_hint: modelKeyHint(shown.base_url, templates.draft_template_id),
        address_from_template: modelAddressFromTemplate(shown.base_url, templates.draft_template_id),
      } : {}),
      ...templates,
    };
  }) : undefined;
  const membership = await pluginMembership(composition, serverOptions.homeDirectory, contextProject?.project_id ?? null);
  const dynamicPlugins = await discoverDynamicSettingsPlugins(localHost, contextProject, await projectShownJudge(composition, serverOptions.homeDirectory, contextProject));
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": PAGE_CSP,
  });
  response.end(renderMolisWorkSettings({
    section,
    ...(section === "prompts" && serverOptions.homeDirectory && inLanguagePreview()
      ? { agent_display_model: agentDisplayModel(openedAgentDefinitions(serverOptions.homeDirectory)?.registrations() ?? [], currentLocale() ?? undefined) } : {}),
    capabilities: capabilities ? { ...capabilities, rules } : undefined,
    ...(characters ? { plugin_settings_html: characters.html } : {}),
    ...(dynamicPlugins.length ? { dynamic_plugin_settings: dynamicPlugins.map(({ section_id, plugin_id, label }) => ({ section_id, plugin_id, label })) } : {}),
    ...(capabilitySection === "connections" && serverOptions.homeDirectory ? { functions_settings: {
      settings: functionsConnectionStatus(serverOptions.homeDirectory),
      connections: listConnectorConnectionViews(serverOptions.homeDirectory, "typesafe"),
      selected_connection_id: selectedTypeSafeConnection(serverOptions.homeDirectory)?.connection_id,
    } } : {}),
    ...(model_settings === undefined ? {} : { model_settings }),
    context_project: contextProject,
    ...(section === "authorizations" && url.searchParams.get("view") === "project-rules" ? { show_project_approval_rules: true } : {}),
    enabled_plugins: membership.plugins,
    hidden_plugins: membership.hidden,
    shown_plugins: membership.shown,
    runtimes,
    mcp_access,
    ...(section === "connectors" ? await connectorSettingsView(localHost, serverOptions.homeDirectory, url, contextProject ? molisWorkHostProjectReference({ databasePath: contextProject.database_path, projectId: contextProject.project_id }) : undefined) : {}),
    ...(section === "web-search" && serverOptions.homeDirectory ? { web_search: await webSearchSettingsView(localHost) } : {}),
    projects,
    web_service: await webService.detect(),
    ...(section === "update" && serverOptions.homeDirectory ? { update: settingsUpdateView(serverOptions.homeDirectory) } : {}),
    diagnostics: composition.installationDiagnostics(projects.length), ...(section === "diagnostics" ? { ...callDiagnosticsView(localHost.callLog, url), periodic_tasks: composition.periodicTasks.list() } : {}),
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
      const target = dynamicPlugins.find(item => item.plugin_id === pluginId);
      if (!target) { sendJson(response, 404, { error: "找不到这个插件的设置项" }); return true; }
      const projectRef = target.scope === "project" && contextProject
        ? molisWorkHostProjectReference({ databasePath: contextProject.database_path, projectId: contextProject.project_id })
        : undefined;
      const writeInput = {
        key: body.key, layer: body.layer, change: body.change, expected_revision: body.expected_revision, request_id: body.request_id,
        ...(body.recovery !== undefined ? { recovery: body.recovery } : {}),
      };
      const result = await bindLocalWebActions(localHost, projectRef, LOCAL_OWNER_PERMISSIONS).invoke(target.writeAction, writeInput);
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
  const dynamicPlugins = await discoverDynamicSettingsPlugins(localHost, contextProject, await projectShownJudge(composition, serverOptions.homeDirectory, contextProject));
  const dynamicTarget = pluginSettings ? undefined : dynamicPlugins.find(item => item.section_id === pluginSettingsSlug || item.plugin_id === pluginSettingsSlug);
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
    const values = await bindLocalWebActions(localHost, projectRef, LOCAL_OWNER_PERMISSIONS).invoke(dynamicTarget!.readAction, { keys: dynamicTarget!.declaration.entries.map(entry => entry.key) }) as SettingsValues;
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
    diagnostics: composition.installationDiagnostics(projects.length),
  }, controlToken, isDesktopShellRequest(request, url)));
  return true;
}

/**
 * Settings › 角色 (docs/design/role-scope, plan C): the person's default and their own roles, read in the personal space where every
 * Characters action already answers; a project's default and members are in that project's settings. System and plugin roles are
 * listed here too.
 */
function charactersSettings(home: string | undefined): { html: string } {
  return { html: renderCharacters({ route_prefix: `/projects/${PERSONAL_SPACE_PROJECT_ID}`, scope: "personal", primitives: { escape: escapeSettingsHtml },
    ...(home && inLanguagePreview() ? { agent_display_model: agentDisplayModel(openedAgentDefinitions(home)?.registrations() ?? [], currentLocale() ?? undefined, "role") } : {}) }) };
}

function escapeSettingsHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** 设置 › 更新 (U3 §5.4): read only, no store opened. */
function settingsUpdateView(home: string) {
  const held = readRollbackHold(home);
  return { point: readRollbackPoint(home), held: held ? { held_version: held.held_version, rolled_back_from: held.rolled_back_from.version } : null };
}

import type { ActionCallContext, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { McpAccessEntry } from "@molis-ai/molis-work-app-workbench";
import type { MolisWorkLocalHost } from "./project-host.js";
import { readMcpToolPreference, type McpActionGrant, type McpToolPreference, isMcpToolEnabled } from "./mcp-settings-store.js";
import { resolveMcpActionContext, hostActionToolName } from "./mcp-action-grants.js";

const same = (grant: McpActionGrant, view: ActionView) => grant.capability_id === view.capability_id && grant.version === view.version && grant.provider_id === view.provider.provider_id;

/** Derived management view only; declarations and grants remain with their existing owners. */
export async function readMcpActionAccess(home: string, host: MolisWorkLocalHost, caller: ActionCallContext,
  reference?: LocalHostProjectReference, scopeMissing = false, preference?: McpToolPreference) {
  const saved = preference ?? await readMcpToolPreference(home);
  const all = scopeMissing ? [] : await host.inspectActions(caller, reference);
  const context = resolveMcpActionContext(caller, all, saved);
  const current = scopeMissing ? [] : await (reference ? host.actionClient(reference) : host.homeActionClient()).discover(context);
  const catalog = all.filter(view => view.action.scope === (caller.project_id ? "project" : "home"));
  const grants = (saved.action_grants ?? []).filter(grant => grant.client_id === caller.actor_id && grant.project_id === caller.project_id);
  const entries: McpAccessEntry[] = catalog.map(view => {
    const grant = grants.find(row => same(row, view));
    const accepted = current.find(row => row.capability_id === view.capability_id && row.version === view.version && row.provider.provider_id === view.provider.provider_id);
    const changed = grant && (grant.permissions.length !== new Set(view.action.permissions).size || view.action.permissions.some(permission => !grant.permissions.includes(permission)));
    const defaultOpen = !grant && view.provider.kind === "system" && !view.action.permissions.length;
    const globalDisabled = !isMcpToolEnabled(hostActionToolName(view), true, saved.overrides);
    const status: McpAccessEntry["status"] = grant?.enabled && changed ? "stale" : grant && !grant.enabled ? "disabled"
      : grant?.enabled || defaultOpen ? accepted?.availability.available ? defaultOpen ? "public" : "enabled" : "unavailable" : "ungranted";
    const reason = status === "stale" ? "能力所需权限已变化，请查看新权限后重新授权。"
      : status === "unavailable" ? globalDisabled ? "此方法的全局开关已关闭。"
        : accepted && !accepted.availability.available ? accepted.availability.reason : "当前授权不再满足调用条件，请刷新后检查。" : undefined;
    return { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id,
      title: view.action.title, provider_title: view.provider.title, description: view.action.description, kind: view.action.kind,
      permissions: view.action.permissions, status, ...(reason ? { reason } : {}),
      can_enable: status === "ungranted" || status === "disabled" || status === "stale", can_revoke: !!grant?.enabled || defaultOpen };
  });
  for (const grant of grants.filter(grant => !catalog.some(view => same(grant, view)))) {
    entries.push({ capability_id: grant.capability_id, version: grant.version, provider_id: grant.provider_id,
      title: grant.capability_id, provider_title: grant.provider_id, description: "原授权记录已保留。", kind: "operation", permissions: grant.permissions,
      status: "missing", reason: scopeMissing ? "原项目已不存在。" : "找不到原能力、版本或提供方。", can_enable: false, can_revoke: grant.enabled });
  }
  return { client_id: caller.actor_id, project_id: caller.project_id, actions: catalog.map(view => current.find(row => row.capability_id === view.capability_id && row.version === view.version) ?? view), grants, entries };
}

export async function mcpAccessPageModel(options: {
  home: string; host: MolisWorkLocalHost; url: URL; clients: readonly { id: string; title: string }[];
  projects: readonly { project_id: string }[];
  withCatalog: import("./web-project-settings.js").LocalWebCatalogRunner;
}): Promise<import("@molis-ai/molis-work-app-workbench").McpAccessModel> {
  const { home, host, url, projects } = options;
  const preference = await readMcpToolPreference(home);
  const selected = url.searchParams.get("client");
  const clientId = (selected === "custom" ? url.searchParams.get("client_custom") : selected)?.trim() || null;
  const projectId = url.searchParams.get("project") || null;
  const clients = [...options.clients];
  for (const grant of preference.action_grants ?? []) if (!clients.some(client => client.id === grant.client_id)) clients.push({ id: grant.client_id, title: grant.client_id });
  const missingProjects = [...new Set((preference.action_grants ?? []).flatMap(grant => grant.client_id === clientId && grant.project_id && !projects.some(project => project.project_id === grant.project_id) ? [grant.project_id] : []))];
  const project = projectId ? projects.find(project => project.project_id === projectId) : undefined;
  const missing = !!projectId && !project;
  if (missing && !missingProjects.includes(projectId)) missingProjects.push(projectId);
  const record = project ? await options.withCatalog({ homeDirectory: home }, catalog => catalog.getProject(project.project_id)) : undefined;
  const reference = record ? { project_id: record.project_id, board_id: record.board_id, storage_key: record.database_path } : undefined;
  const access = clientId ? await readMcpActionAccess(home, host, { actor_id: clientId, project_id: projectId, audience: "mcp", permissions: [] }, reference, missing, preference) : null;
  return { client_id: clientId, project_id: projectId, clients, entries: access?.entries ?? [],
    query: url.searchParams.get("q") ?? "", filter: url.searchParams.get("filter") ?? "", unavailable_projects: missingProjects,
    ...(missing ? { scope_error: "所选项目已不存在。原授权记录仍保留，可在此撤销。" } : {}),
  };
}

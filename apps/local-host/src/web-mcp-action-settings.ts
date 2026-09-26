import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody } from "./web-http.js";
import { renderMcpAccessRows } from "@molis-ai/molis-work-app-workbench";
import { escapeHtml } from "@molis-ai/molis-work-design-system";
import { L } from "./web-locale.js";
import { readMcpActionAccess } from "./mcp-action-access.js";
import { actionClientAudience, createMcpActionGrant, resolveMcpActionContext } from "./mcp-action-grants.js";
import { actionGrantKey, readMcpToolPreference, writeMcpActionGrant } from "./mcp-settings-store.js";

/** Called only behind the local Web origin/control-token gate. Clients cannot authorize themselves. */
export async function handleMcpActionSettingsHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  homeDirectory: string | undefined, host: MolisWorkLocalHost, withCatalog: LocalWebCatalogRunner): Promise<boolean> {
  if (url.pathname !== "/api/settings/mcp/actions") return false;
  if (!homeDirectory) { sendJson(response, 400, { error: "缺少本机目录" }); return true; }
  if (request.method !== "GET" && request.method !== "POST") { sendJson(response, 405, { error: "不支持此方法" }); return true; }
  try {
    const input = request.method === "POST" ? await readBody(request) : Object.fromEntries(url.searchParams);
    const clientId = input.client_id;
    const projectId = input.project_id === null || input.project_id === "" || input.project_id === undefined ? null : input.project_id;
    if (typeof clientId !== "string" || !clientId.trim() || (projectId !== null && (typeof projectId !== "string" || !projectId.trim()))) {
      throw new ActionError("mcp.grant_invalid", "请选择客户端和有效范围");
    }
    const preference = await readMcpToolPreference(homeDirectory);
    if (request.method === "POST") {
      const keys = ["client_id", "project_id", "capability_id", "version", "provider_id", "enabled"];
      if (Object.keys(input).some(key => !keys.includes(key)) || typeof input.capability_id !== "string"
        || !Number.isSafeInteger(input.version) || typeof input.provider_id !== "string" || typeof input.enabled !== "boolean") {
        throw new ActionError("mcp.grant_invalid", "授权参数无效；权限必须来自能力声明");
      }
      const identity = { client_id: clientId, project_id: projectId, capability_id: input.capability_id, version: input.version as number, provider_id: input.provider_id };
      const previous = preference.action_grants?.find(grant => actionGrantKey(grant) === actionGrantKey(identity));
      if (!input.enabled && previous) {
        await writeMcpActionGrant(homeDirectory, { ...previous, enabled: false });
        sendJson(response, 200, { ...previous, enabled: false });
        return true;
      }
    }
    let scopeMissing = false;
    const project = projectId ? await withCatalog({ homeDirectory }, catalog => {
      try { return catalog.getProject(projectId); }
      catch (error) { if (request.method === "GET" && (error as { code?: string }).code === "catalog.project_not_found") { scopeMissing = true; return null; } throw error; }
    }) : null;
    const reference = project ? molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path }) : undefined;
    const caller: ActionCallContext = { actor_id: clientId, project_id: projectId, audience: actionClientAudience(clientId), permissions: [] };
    if (request.method === "GET") {
      const access = await readMcpActionAccess(homeDirectory, host, caller, reference, scopeMissing, preference);
      sendJson(response, 200, url.searchParams.get("format") === "html" ? { html: renderMcpAccessRows({ entries: access.entries,
        query: url.searchParams.get("q") ?? "", filter: url.searchParams.get("filter") ?? "" }, { L, escapeHtml: value => escapeHtml(String(value ?? "")) }) } : access);
      return true;
    }
    const all = await host.inspectActions(caller, reference);
    const catalog = all.filter(view => view.action.scope === (projectId ? "project" : "home"));
    const service = reference ? host.actionClient(reference) : host.homeActionClient();
    const identity = { client_id: clientId, project_id: projectId, capability_id: input.capability_id as string, version: input.version as number, provider_id: input.provider_id as string };
    const selected = catalog.find(view => view.capability_id === identity.capability_id && view.version === identity.version && view.provider.provider_id === identity.provider_id);
    if (!selected) throw new ActionError("actions.missing", "能力、版本或提供方已失效，请刷新目录");
    if (!input.enabled && (selected.provider.kind !== "system" || selected.action.permissions.length)) throw new ActionError("mcp.grant_missing", "没有这项授权记录");
    const grant = createMcpActionGrant(clientId, projectId, selected, input.enabled as boolean);
    if (!grant.enabled) { await writeMcpActionGrant(homeDirectory, grant); sendJson(response, 200, grant); return true; }
    const proposed = { ...preference, action_grants: [...(preference.action_grants ?? []).filter(row => actionGrantKey(row) !== actionGrantKey(grant)), grant] };
    const accepted = await service.discover(resolveMcpActionContext(caller, all, proposed));
    const state = accepted.find(view => view.capability_id === grant.capability_id && view.version === grant.version)?.availability;
    if (!state?.available) throw new ActionError(state && !state.available ? state.code : "mcp.grant_unavailable", state && !state.available ? state.reason : "能力尚不可用，请检查权限和方法开关");
    await writeMcpActionGrant(homeDirectory, grant);
    sendJson(response, 200, grant);
  } catch (error) {
    sendJson(response, error instanceof ActionError && error.code === "actions.missing" ? 404 : 400,
      { error: error instanceof Error ? error.message : "授权配置失败", ...(error instanceof ActionError ? { code: error.code } : {}) });
  }
  return true;
}

import { reviewSourceSummary } from "./agent-review-http.js";
import { ASSISTANT_PERSONAL_OWNER } from "@molis-ai/molis-work-contracts/services/assistant";
import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentAuthorizationActions } from "@molis-ai/molis-work-contracts/services/agent-host";
import { authorizationSettingsControl } from "./authorization-settings-control.js";
import { invokeAuthorizationManagement, type AuthorizationManagementPorts } from "./authorization-management.js";
import type { WebRequestContext } from "./web-route-table.js";
import { molisWorkHostProjectReference } from "./project-host.js";
import { webManagementAuthenticated } from "./web-sessions.js";
import { readLocalWebBody, respondLocalWebRefusal, sendLocalWebJson } from "./web-http.js";

export async function handleAuthorizationManagementHttp(context: WebRequestContext): Promise<boolean> {
  const { request, response, url, serverOptions, localHost: host } = context;
  const history = url.pathname === "/api/settings/authorizations/reviews";
  if (!history && url.pathname !== "/api/settings/authorizations") return false;
  const home = serverOptions.homeDirectory, assistant = host.assistantStore;
  const control = authorizationSettingsControl(request, response, host, serverOptions.assertAccountCurrent);
  try {
    control.assertCurrent();
    if (!webManagementAuthenticated(request)) {
      throw new ActionError("actions.forbidden", "只有本机授权管理入口能读取这些记录");
    }
    if (!home || !assistant) throw new ActionError("actions.service_unavailable", "授权管理暂时不可用");
    const list = await context.composition.withCatalog({ homeDirectory: home }, catalog => catalog.listProjects());
    const projects = new Map(list.map(project => [project.project_id, molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path })]));
    const projectId = url.searchParams.get("project") || null;
    if (projectId && !projects.has(projectId)) throw new ActionError("actions.missing", "找不到这份授权所在的项目");
    if (history) {
      if (request.method !== "GET") { sendLocalWebJson(response, 405, { error: "不支持此方法" }); return true; }
      if (!url.searchParams.has("project")) throw new ActionError("actions.input_invalid", "请选择要查看的项目或个人空间");
      await context.agentReady();
      const queue = context.agentHost.reviews, scope = projectId ?? ASSISTANT_PERSONAL_OWNER;
      await queue.refresh(scope);
      const candidates = queue.list(scope).reverse();
      const rows = candidates.slice(0, 100).map(review => reviewSourceSummary({
        request: review, receipt: queue.receipt(review.review_id) ?? undefined,
      }));
      control.assertCurrent();
      sendLocalWebJson(response, 200, { rows, omitted: Math.max(candidates.length - rows.length, 0) });
      return true;
    }
    const ports: AuthorizationManagementPorts = { host, home, assistant, projects, contextProject: projectId,
      clientNames: context.runtimeIntegrations.clientDescriptors(), agents: async () => { await context.agentReady(); return context.agentHost; } };
    const run = async <Input, Output>(definition: ActionDefinition<Input, Output>, input: unknown) => {
      const answer = await invokeAuthorizationManagement({ host, request, entry: ports, assertCurrent: control.assertCurrent }, definition, input as Input);
      control.assertCurrent();
      sendLocalWebJson(response, 200, answer);
    };
    if (request.method === "POST") await run(agentAuthorizationActions.change, await readLocalWebBody(request));
    else if (request.method === "GET" && url.searchParams.has("id")) await run(agentAuthorizationActions.read, {
      owner: url.searchParams.get("owner"), id: url.searchParams.get("id"),
    });
    else if (request.method === "GET") {
      const owners = url.searchParams.getAll("owner"), client = url.searchParams.get("client");
      await run(agentAuthorizationActions.list, { ...(owners.length ? { owners } : {}), ...(client ? { client_id: client } : {}),
        ...(url.searchParams.has("project") ? { project_id: projectId } : {}) });
    } else { sendLocalWebJson(response, 405, { error: "不支持此方法" }); }
  } catch (error) {
    if (!response.destroyed) respondLocalWebRefusal({ respond: (status, body) => sendLocalWebJson(response, status, body) }, error);
  }
  return true;
}

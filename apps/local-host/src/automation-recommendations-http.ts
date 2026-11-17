import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { automationRecommendationActions as actions } from "@molis-ai/molis-work-contracts/services/automation-recommender";
import { authorizationSettingsControl } from "./authorization-settings-control.js";
import { invokeAutomationRecommendation } from "./automation-recommendations.js";
import { webManagementAuthenticated } from "./web-sessions.js";
import { readLocalWebBody, respondLocalWebRefusal, sendLocalWebJson } from "./web-http.js";
import type { ProjectRequestContext } from "./web-project-context.js";

export async function handleAutomationRecommendationsHttp(context: ProjectRequestContext): Promise<boolean> {
  const { request, response, url, hostReference, localHost: host, serverOptions } = context;
  const root = "/api/automation/recommendations";
  if (url.pathname !== root && url.pathname !== root + "/preference" && url.pathname !== root + "/save") return false;
  const control = authorizationSettingsControl(request, response, host, serverOptions.assertAccountCurrent);
  try {
    control.assertCurrent();
    if (!webManagementAuthenticated(request)) throw new ActionError("actions.forbidden", "请从当前项目的本机页面打开建议");
    const scan = url.pathname === root;
    if (request.method !== (scan ? "GET" : "POST")) { sendLocalWebJson(response, 405, { error: "不支持此方法" }); return true; }
    if (!serverOptions.homeDirectory || !context.options.project) throw new ActionError("actions.missing", "请先选择一个项目");
    const input = scan ? {} : await readLocalWebBody(request);
    const entry = await host.automationRecommendationEntry(hostReference, scan);
    const run = async <Input, Output>(definition: ActionDefinition<Input, Output>) => {
      const result = await invokeAutomationRecommendation({ host: { actionClient: host.projectCatalogActions.passiveClient, homeActionClient: () => host.homeActionClient() },
        request, reference: hostReference, entry, assertCurrent: control.assertCurrent }, definition, input as Input);
      control.assertCurrent();
      sendLocalWebJson(response, 200, result);
    };
    if (scan) await run(actions.scan);
    else if (url.pathname.endsWith("/preference")) await run(actions.preference);
    else await run(actions.save);
  } catch (error) {
    if (!response.destroyed) respondLocalWebRefusal({ respond: (status, body) => sendLocalWebJson(response, status, body) }, error);
  }
  return true;
}

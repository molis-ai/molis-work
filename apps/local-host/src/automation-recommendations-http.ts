import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { automationRecommendationActions as actions } from "@molis-ai/molis-work-contracts/services/automation-recommender";
import { authorizationSettingsControl } from "./authorization-settings-control.js";
import { invokeAutomationRecommendation } from "./automation-recommendations.js";
import { webManagementAuthenticated } from "./web-sessions.js";
import { readLocalWebBody, respondLocalWebRefusal, sendLocalWebJson } from "./web-http.js";
import type { ProjectRequestContext } from "./web-project-context.js";
import type { AutomationOfferHooks } from "./automation-proactive.js";

/**
 * The project's suggestions as the page asks for them (the report, a preference, saving it), and — only from a project page that has the
 * Assistant (`assistant`) — the Assistant's own look (`/offer`) and the person's switch for it (`/offers`).
 */
export async function handleAutomationRecommendationsHttp(context: ProjectRequestContext, assistant?: AutomationOfferHooks): Promise<boolean> {
  const { request, response, url, hostReference, localHost: host, serverOptions } = context;
  const root = "/api/automation/recommendations";
  const paths: Record<string, { method: string; definition: ActionDefinition<never, unknown>; scan: boolean }> = {
    [root]: { method: "GET", definition: actions.scan as ActionDefinition<never, unknown>, scan: true },
    [root + "/preference"]: { method: "POST", definition: actions.preference as ActionDefinition<never, unknown>, scan: false },
    [root + "/save"]: { method: "POST", definition: actions.save as ActionDefinition<never, unknown>, scan: false },
    ...(assistant ? { [root + "/offer"]: { method: "POST", definition: actions.offer as ActionDefinition<never, unknown>, scan: true } } : {}),
  };
  const offers = url.pathname === root + "/offers";
  const route = offers ? { method: request.method === "POST" ? "POST" : "GET", definition: (request.method === "POST" ? actions.setOffers : actions.offers) as ActionDefinition<never, unknown>, scan: false }
    : Object.hasOwn(paths, url.pathname) ? paths[url.pathname]! : undefined;
  if (!route) return false;
  const control = authorizationSettingsControl(request, response, host, serverOptions.assertAccountCurrent);
  try {
    control.assertCurrent();
    if (!webManagementAuthenticated(request)) throw new ActionError("actions.forbidden", "请从当前项目的本机页面打开建议");
    if (request.method !== route.method) { sendLocalWebJson(response, 405, { error: "不支持此方法" }); return true; }
    if (!serverOptions.homeDirectory || !context.options.project) throw new ActionError("actions.missing", "请先选择一个项目");
    const input = route.method === "GET" || route.definition === actions.offer ? {} : await readLocalWebBody(request);
    const entry = await host.automationRecommendationEntry(hostReference, route.scan, assistant);
    const result = await invokeAutomationRecommendation({ host: { actionClient: host.projectCatalogActions.passiveClient, homeActionClient: () => host.homeActionClient() },
      request, reference: hostReference, entry, assertCurrent: control.assertCurrent }, route.definition, input as never);
    control.assertCurrent();
    sendLocalWebJson(response, 200, result);
  } catch (error) {
    if (!response.destroyed) respondLocalWebRefusal({ respond: (status, body) => sendLocalWebJson(response, status, body) }, error);
  }
  return true;
}

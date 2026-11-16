import type { IncomingMessage, ServerResponse } from "node:http";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { acceptanceActions } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { handlePersonActionRoutes } from "./person-action-http.js";
import type { MolisWorkLocalHost } from "./project-host.js";

/** What the requirement column asks for: the state of one object's requirements, the person's accept or return, and the person's own change of what is asked. */
const ROUTES = new Map<string, ActionDefinition>([
  ["read", acceptanceActions.read as ActionDefinition],
  ["decide", acceptanceActions.decide as ActionDefinition],
  ["requirements", acceptanceActions.set as ActionDefinition],
]);

/** The workbench's own doors to requirements and acceptance in one project, as the person (S-acceptance-person-decides): a plugin's page is refused. */
export function handleAcceptanceHttp(request: IncomingMessage, response: ServerResponse, url: URL, host: MolisWorkLocalHost, project: LocalHostProjectReference): Promise<boolean> {
  return handlePersonActionRoutes(request, response, url, host, project, { prefix: "/api/acceptance", routes: ROUTES, refusal: "插件页面不能代本人认可、退回或修改要求" });
}

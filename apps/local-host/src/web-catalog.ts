import type { IncomingMessage, ServerResponse } from "node:http";
import type { WebProjectNavigation } from "@molis-ai/molis-work-app-workbench";
import type { AgentRuntimeDescriptor } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MolisWorkLocalHost } from "./project-host.js";
import type { RuntimeIntegrationService } from "./installer/runtime-integration.js";
import type { MolisWorkWebServiceManager } from "./installer/web-service.js";
import type { WebServerOptions } from "./web-types.js";
import type { LocalWebComposition } from "./web-composition.js";
import type { ProjectDeletionPorts } from "./project-deletion-service.js";
import { sendLocalWebJson as sendJson } from "./web-http.js";
import { L } from "./web-locale.js";
import { dispatchCatalogRoutes } from "./web-catalog-routes.js";

/** The catalog's pages and settings: what the Host answers with no project open. The addresses are `CATALOG_ROUTES`, tried in order. */
export async function handleLocalCatalogWebRequest(
  request: IncomingMessage, response: ServerResponse, url: URL, serverOptions: WebServerOptions,
  runtimeIntegrations: RuntimeIntegrationService, webService: MolisWorkWebServiceManager, controlToken: string,
  localHost: MolisWorkLocalHost, projects: WebProjectNavigation[], composition: LocalWebComposition,
  deletionPorts: ProjectDeletionPorts,
  agentRuntimes: () => Promise<readonly AgentRuntimeDescriptor[]> = async () => [],
): Promise<void> {
  if (await dispatchCatalogRoutes({ request, response, url, serverOptions, runtimeIntegrations, webService, controlToken, localHost, projects, composition, deletionPorts, agentRuntimes })) return;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    sendJson(response, 400, { error: L("请先选择一个 Molis Work 项目") });
    return;
  }
  sendJson(response, 404, { error: L("页面不存在") });
}

import { readProductEnv } from "@molis-ai/molis-work-storage";
import type { IncomingMessage, ServerResponse } from "node:http";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody } from "./web-http.js";
import type { RuntimeIntegrationService } from "./installer/runtime-integration.js";
import { isSupportedRuntimeId, type SupportedRuntimeId } from "./installer/runtime-integration-contract.js";
import type { MolisWorkWebServiceManager } from "./installer/web-service.js";
import type { MolisWorkWebServiceAction } from "./installer/web-service-contract.js";

export function serviceProcessId(): number {
  const inherited = Number(readProductEnv("WEB_SERVICE_PROCESS_ID"));
  return Number.isSafeInteger(inherited) && inherited > 0 ? inherited : process.pid;
}

function supportedRuntimeId(value: string): SupportedRuntimeId | null {
  return isSupportedRuntimeId(value) ? value : null;
}

export async function handleLocalRuntimeSettingsHttp(request: IncomingMessage, response: ServerResponse, url: URL, runtimeIntegrations: RuntimeIntegrationService, webService: MolisWorkWebServiceManager): Promise<boolean> {
  if (request.method === "GET" && url.pathname === "/api/settings/runtimes") {
    sendJson(response, 200, { runtimes: await runtimeIntegrations.detectAll() });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/settings/web-service") {
    sendJson(response, 200, await webService.detect());
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/settings/web-service/plan") {
    const body = await readBody(request);
    const action = typeof body.action === "string"
      && ["install", "start", "stop", "restart", "remove"].includes(body.action)
      ? body.action as MolisWorkWebServiceAction
      : null;
    if (!action) {
      sendJson(response, 400, { error: "常驻服务操作无效" });
      return true;
    }
    try {
      sendJson(response, 200, await webService.prepare(action));
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/settings/web-service/confirm") {
    const body = await readBody(request);
    const planId = typeof body.plan_id === "string" ? body.plan_id : "";
    const decision = body.decision === "confirmed" || body.decision === "declined" ? body.decision : null;
    if (!planId || !decision) {
      sendJson(response, 400, { error: "常驻服务确认缺少 plan 或明确决定" });
      return true;
    }
    try {
      const confirmation = await webService.confirmFromWeb({ plan_id: planId, decision }, serviceProcessId());
      if (confirmation.afterResponse) {
        response.once("finish", () => {
          void confirmation.afterResponse!().catch((error) => console.error("Molis Work Web restart failed:", error));
        });
      }
      sendJson(response, confirmation.result.status === "restarting" ? 202 : 200, confirmation.result);
    } catch (error) {
      sendJson(response, 409, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }
  const runtimePlanMatch = url.pathname.match(/^\/api\/settings\/runtimes\/([^/]+)\/plan$/);
  if (request.method === "POST" && runtimePlanMatch) {
    const runtimeId = supportedRuntimeId(decodeURIComponent(runtimePlanMatch[1]));
    const body = await readBody(request);
    const action = body.action === "connect" || body.action === "remove" ? body.action : null;
    if (!runtimeId || !action) {
      sendJson(response, 400, { error: "Runtime 或接入操作无效" });
      return true;
    }
    try {
      sendJson(response, 200, await runtimeIntegrations.prepare(runtimeId, action));
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }
  const runtimeConfirmMatch = url.pathname.match(/^\/api\/settings\/runtimes\/([^/]+)\/confirm$/);
  if (request.method === "POST" && runtimeConfirmMatch) {
    const runtimeId = supportedRuntimeId(decodeURIComponent(runtimeConfirmMatch[1]));
    const body = await readBody(request);
    const decision = body.decision === "confirmed" || body.decision === "declined" ? body.decision : null;
    const planId = typeof body.plan_id === "string" ? body.plan_id.trim() : "";
    if (!runtimeId || !decision || !planId) {
      sendJson(response, 400, { error: "Runtime 接入确认缺少 plan 或明确决定" });
      return true;
    }
    const result = await runtimeIntegrations.confirm({ runtime_id: runtimeId, plan_id: planId, decision });
    const successful = ["connected", "already_connected", "removed", "already_removed", "declined"].includes(result.status);
    sendJson(response, successful ? 200 : 409, result);
    return true;
  }
  return false;
}

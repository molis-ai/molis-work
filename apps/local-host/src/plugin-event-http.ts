import type { IncomingMessage, ServerResponse } from "node:http";
import { PluginEventError, type PluginEventRecoveryInput } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginEventBus } from "@molis-ai/molis-work-plugin-runtime";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";

export function isPluginEventManagementPath(pathname: string): boolean {
  return pathname === "/api/plugins/runtime/events" || pathname === "/api/plugins/runtime/events/recover";
}

/** Called only after the local-user control and project guards, like Runtime upgrade/restart. */
export async function handlePluginEventHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  input: { events: PluginEventBus; boardId: string; actorId: string }): Promise<void> {
  if (url.pathname === "/api/plugins/runtime/events" && request.method === "GET") {
    sendLocalWebJson(response, 200, { pending: input.events.recoveries(input.boardId), history: input.events.recoveryHistory(input.boardId) });
    return;
  }
  if (url.pathname !== "/api/plugins/runtime/events/recover" || request.method !== "POST") {
    sendLocalWebJson(response, 405, { error: "核对决定必须通过 POST 确认" });
    return;
  }
  try {
    const body = await readLocalWebBody(request);
    const resolution = input.events.recover(input.boardId, input.actorId, body as unknown as PluginEventRecoveryInput);
    sendLocalWebJson(response, 200, { resolution });
  } catch (error) {
    if (!(error instanceof PluginEventError)) throw error;
    sendLocalWebJson(response, error.code === "event_recovery_invalid" ? 400 : 409, { code: error.code, error: error.message });
  }
}

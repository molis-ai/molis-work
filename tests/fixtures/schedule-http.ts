import type { IncomingMessage, ServerResponse } from "node:http";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { createScheduleRouteHandlers } from "@molis-ai/molis-work-plugin-schedule";
import { readLocalWebBody, sendLocalWebJson, sendUnhandledWebError } from "@molis-ai/molis-work-app-local-host";
import { SchedulePluginRouteTable } from "../schedule-direct-actions.js";

/** Exercise Schedule's route adapter with the Runtime HTTP reader and outer error boundary. */
export async function handleScheduleTestHttp(request: IncomingMessage, response: ServerResponse, url: URL, actions: BoundActionClient) {
  try {
    const body = request.method === 'GET' ? {} : await readLocalWebBody(request);
    const result = await new SchedulePluginRouteTable(createScheduleRouteHandlers({ actions, changed() {} })).handle({
      method: request.method as 'GET' | 'POST', pathname: url.pathname, query: url.searchParams, body,
    });
    if (!result) return false;
    sendLocalWebJson(response, result.status, result.body);
  } catch (error) { sendUnhandledWebError(response, error); }
  return true;
}

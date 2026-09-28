import type { IncomingMessage, ServerResponse } from "node:http";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { informationActions } from "./information-actions.js";

export async function handleInformationAssistantHttp(request: IncomingMessage, response: ServerResponse, url: URL, options: {
  actions: BoundActionClient;
}) {
  return dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/assistant", maxBodyBytes: 20_000,
    async handle(input) {
      if (input.method !== "POST" || input.pathname !== "/api/assistant/plan") return null;
      return { status: 200, body: await options.actions.invoke(informationActions.plan, { prompt: typeof input.body.prompt === "string" ? input.body.prompt : "",
        ...(typeof input.body.selected_item_id === "string" ? { selected_item_id: input.body.selected_item_id } : {}) }) };
    }, mapError: error => ({ status: 400, body: { error: error instanceof Error ? error.message : "助手暂时不可用" } }) });
}

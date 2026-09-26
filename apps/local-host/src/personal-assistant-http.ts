import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type ActionCallContext, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";
import type { PersonalAssistantService } from "./personal-assistant-service.js";
import type { AssistantPreferences } from "./personal-assistant-types.js";

/** Host supplies the current project/actor authority and applies its existing origin/CSRF policy. */
export async function handlePersonalAssistantHttp(request: IncomingMessage, response: ServerResponse, url: URL, options: {
  service: PersonalAssistantService; caller: ActionCallContext;
}): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/personal-assistant", maxBodyBytes: 24000,
    async handle({ method, pathname, body }) {
      const { service, caller } = options, suffix = pathname.slice("/api/personal-assistant/".length);
      let result: unknown;
      if (method === "GET" && suffix === "state") result = await service.state(caller);
      else if (method === "POST" && suffix === "evaluate") result = await service.evaluate(caller, body as { changes: ActionSubject[]; project_materials: ActionSubject[]; instructions?: string });
      else if (method === "POST" && suffix === "preferences") result = service.preferences(caller, Number(body.revision), body.preferences as AssistantPreferences);
      else if (method === "POST" && suffix === "feedback") result = service.feedback(caller, String(body.id), Number(body.revision), body.choice as "dismiss" | "snooze", body.remind_at as string | undefined);
      else if (method === "POST" && suffix === "execute") result = await service.execute(caller, String(body.id), Number(body.revision));
      else if (method === "POST" && suffix === "recover") result = await service.recover(caller, String(body.id));
      else return null;
      return { status: 200, body: result };
    }, mapError: error => ({ status: error instanceof ActionError && /forbidden|scope/.test(error.code) ? 403 : 400,
      body: { error: error instanceof ActionError ? error.message : "助理暂时无法完成，请保留输入并重试" } }),
  });
}

import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { UiRequestFailure } from "@molis-ai/molis-work-contracts/platform/ui";
import type { LingguangHost, LingguangRequest, Scope, Translate } from "./types.js";

/**
 * Requests to 灵光's routes (a path under this plugin) and to platform routes (`/api/…`). Leaving the page cancels them
 * through the mount scope, so an answer that arrives late never writes into a view that has moved on. A failure is the
 * helper's plain Error with the Host's `code` and `status`; a refused read says why in the person's words (`host.readRefusal`).
 */
export function lingguangRequest(host: LingguangHost, life: Scope, L: Translate): LingguangRequest {
  return async <T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>) => {
    const url = path.startsWith("/api/") ? host.route(path) : host.pluginRoute(path);
    try {
      return await molisWorkRequest<T>(url, { method, scope: life, fallback: L("lingguang.error.request"), ...(body === undefined || method === "GET" ? {} : { body }) });
    } catch (error) {
      const failure = error as UiRequestFailure;
      const refusal = method === "GET" ? host.readRefusal(failure.status, failure.code) : "";
      if (refusal) failure.message = refusal;
      throw failure;
    }
  };
}

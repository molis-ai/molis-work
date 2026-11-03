import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { UiRequestFailure } from "@molis-ai/molis-work-contracts/platform/ui";
import type { PagesHost, PagesRequest, Translate } from "./types.js";

/**
 * Requests to Pages' routes in the current project (`tail` follows `/pages`). A failure is the helper's plain Error with the
 * Host's `status`; a read the Host refuses says why in the person's words.
 */
export function pagesRequest(host: PagesHost, L: Translate): PagesRequest {
  return async <T>(method: "GET" | "POST", tail: string, body?: Record<string, unknown>) => {
    if (!host.projectId()) throw new Error(L("pages.error.no-project"));
    try {
      return await molisWorkRequest<T>(host.pluginRoute("/pages" + tail), { method, ...(body === undefined || method === "GET" ? {} : { body }), fallback: L("pages.error.request") });
    } catch (error) {
      const failure = error as UiRequestFailure;
      const refusal = method === "GET" ? host.readRefusal(failure.status, failure.code) : "";
      if (refusal) failure.message = refusal;
      throw failure;
    }
  };
}

/** A document's route tail: `/<id>` and what follows it. */
export const pageTail = (id: string, tail = "") => "/" + encodeURIComponent(id) + tail;

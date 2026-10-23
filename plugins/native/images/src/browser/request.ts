import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ImagesHost, ImagesRequest, Scope, Translate } from "./types.js";

/** The page's one request helper (packages/ui-host request-client, W3-10): control headers, one origin, plain Errors with `code`. */
declare const molisWorkRequest: UiRequest;

const PLUGIN_ROUTES = "/api/plugins/io.molis.work.images";

/**
 * Requests to Images' routes. Leaving the page cancels them through the mount scope, so an answer that arrives late
 * never writes into a view that has moved on; a request with no answer keeps `status` 0 for the caller to say so.
 */
export function imagesRequest(host: ImagesHost, life: Scope, L: Translate): ImagesRequest {
  return <T>(method: "GET" | "POST" | "DELETE", path: string, body?: Record<string, unknown>, signal?: AbortSignal): Promise<T> =>
    molisWorkRequest<T>(host.route(PLUGIN_ROUTES + path), {
      method, scope: life, fallback: L("images.error.request"),
      ...(signal ? { signal } : {}),
      ...(method === "GET" || body === undefined ? {} : { body }),
    });
}

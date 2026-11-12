import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { ImagesHost, ImagesRequest, Scope } from "./types.js";

const uiText = globalThis.t;

/**
 * Requests to Images' routes. Leaving the page cancels them through the mount scope, so an answer that arrives late
 * never writes into a view that has moved on; a request with no answer keeps `status` 0 for the caller to say so.
 */
export function imagesRequest(host: ImagesHost, life: Scope): ImagesRequest {
  return <T>(method: "GET" | "POST" | "DELETE", path: string, body?: Record<string, unknown>, signal?: AbortSignal): Promise<T> =>
    molisWorkRequest<T>(host.pluginRoute(path), {
      method, scope: life, fallback: uiText.text("images.error.request"),
      ...(signal ? { signal } : {}),
      ...(method === "GET" || body === undefined ? {} : { body }),
    });
}

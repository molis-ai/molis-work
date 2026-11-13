import { pluginRequest } from "@molis-ai/molis-work-plugin-sdk/browser";
import type { PagesHost, PagesRequest } from "./types.js";

const uiText = globalThis.t;

/** Requests to Pages' routes in the current project (`tail` follows `/pages`). */
export function pagesRequest(host: PagesHost): PagesRequest {
  const request = pluginRequest(host, {
    project: { id: () => host.projectId(), missing: () => uiText.text("pages.error.no-project") },
    readRefusal: true,
    fallback: () => uiText.text("pages.error.request"),
  });
  return (method, tail, body) => request(method, "/pages" + tail, body);
}

/** A document's route tail: `/<id>` and what follows it. */
export const pageTail = (id: string, tail = "") => "/" + encodeURIComponent(id) + tail;

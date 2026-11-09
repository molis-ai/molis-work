import { pluginRequest } from "@molis-ai/molis-work-plugin-sdk/browser";
import type { PagesHost, PagesRequest, Translate } from "./types.js";

/** Requests to Pages' routes in the current project (`tail` follows `/pages`). */
export function pagesRequest(host: PagesHost, L: Translate): PagesRequest {
  const request = pluginRequest(host, {
    project: { id: () => host.projectId(), missing: () => L("pages.error.no-project") },
    readRefusal: true,
    fallback: () => L("pages.error.request"),
  });
  return (method, tail, body) => request(method, "/pages" + tail, body);
}

/** A document's route tail: `/<id>` and what follows it. */
export const pageTail = (id: string, tail = "") => "/" + encodeURIComponent(id) + tail;

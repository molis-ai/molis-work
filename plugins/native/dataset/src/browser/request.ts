import { pluginRequest } from "@molis-ai/molis-work-plugin-sdk/browser";
import type { DatasetHost, DatasetRequest, Scope } from "./types.js";

const uiText = globalThis.t;

/** Dataset's routes carry the current project in the query and each JSON write. */
export function datasetRequest(host: DatasetHost, scope: Scope): DatasetRequest {
  return pluginRequest(host, {
    scope,
    readRefusal: true,
    project: { id: () => host.projectId(), missing: () => uiText.text("dataset.error.no-project"), includeInRequest: true },
    fallback: () => uiText.text("dataset.error.request"),
    codes: { "dataset.conflict": () => uiText.text("dataset.error.conflict") },
  });
}

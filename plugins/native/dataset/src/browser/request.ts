import { pluginRequest } from "@molis-ai/molis-work-plugin-sdk/browser";
import type { DatasetHost, DatasetRequest, Scope, Translate } from "./types.js";

/** Dataset's routes carry the current project in the query and each JSON write. */
export function datasetRequest(host: DatasetHost, scope: Scope, L: Translate): DatasetRequest {
  return pluginRequest(host, {
    scope,
    readRefusal: true,
    project: { id: () => host.projectId(), missing: () => L("dataset.error.no-project"), includeInRequest: true },
    fallback: () => L("dataset.error.request"),
    codes: { "dataset.conflict": () => L("dataset.error.conflict") },
  });
}

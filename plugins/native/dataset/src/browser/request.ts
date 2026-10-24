import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { UiRequestFailure } from "@molis-ai/molis-work-contracts/platform/ui";
import type { DatasetHost, DatasetRequest, Translate } from "./types.js";

/**
 * Requests to Dataset's routes in the current project (`path` is under the plugin: `/datasets`). A failure is the helper's
 * plain Error with the Host's `code`; a conflict says so in the person's words and keeps what they typed.
 */
export function datasetRequest(host: DatasetHost, L: Translate): DatasetRequest {
  const withProject = (path: string) => {
    const id = host.projectId();
    if (!id) throw new Error(L("dataset.error.no-project"));
    return path + (path.includes("?") ? "&" : "?") + "project_id=" + encodeURIComponent(id);
  };
  return async <T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>) => {
    const url = withProject(host.pluginRoute(path));
    try {
      return await molisWorkRequest<T>(url, { method, ...(body === undefined || method === "GET" ? {} : { body: { ...body, project_id: host.projectId() } }), fallback: L("dataset.error.request") });
    } catch (error) {
      const failure = error as UiRequestFailure;
      if (failure.code === "dataset.conflict") failure.message = L("dataset.error.conflict");
      throw failure;
    }
  };
}

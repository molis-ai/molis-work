import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { UiRequestFailure } from "@molis-ai/molis-work-contracts/platform/ui";
import type { PptHost, PptRequest, Translate } from "./types.js";

/**
 * Requests to PPT's routes in the current project (`path` is under the plugin: `/ppt`). A failure is the helper's plain Error with
 * the Host's `code`; a conflict says so in the person's words and keeps what they typed.
 */
export function pptRequest(host: PptHost, L: Translate): PptRequest {
  const withProject = (path: string) => {
    const id = host.projectId();
    if (!id) throw new Error(L("ppt.error.no-project"));
    return path + (path.includes("?") ? "&" : "?") + "project_id=" + encodeURIComponent(id);
  };
  return async <T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>, signal?: AbortSignal) => {
    const url = withProject(host.pluginRoute(path));
    try {
      return await molisWorkRequest<T>(url, {
        method, ...(body === undefined || method === "GET" ? {} : { body: { ...body, project_id: host.projectId() } }),
        ...(signal ? { signal } : {}), fallback: L("ppt.error.request"),
      });
    } catch (error) {
      const failure = error as UiRequestFailure;
      if (failure.code === "ppt.conflict") failure.message = L("ppt.error.conflict");
      throw failure;
    }
  };
}

import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { UiRequestFailure } from "@molis-ai/molis-work-contracts/platform/ui";
import type { FormClientHost, FormFailure, FormRequest } from "./types.js";

/** Requests to this project's Forms routes; `path` follows `/forms`, the Manifest's routes in this project's Runtime. */
export function formRequest(host: FormClientHost): FormRequest {
  const L = host.translate;
  const projectId = () => host.projectId();
  const withProject = (path: string) => {
    const id = projectId();
    if (!id) throw new Error(L("缺少项目"));
    return path + (path.includes("?") ? "&" : "?") + "project_id=" + encodeURIComponent(id);
  };
  return async <T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>) => {
    const url = withProject(host.pluginRoute("/forms" + path));
    try {
      return await molisWorkRequest<T>(url, { method, ...(body === undefined || method === "GET" ? {} : { body: { ...body, project_id: projectId() } }), fallback: L("问卷请求失败") });
    } catch (error) {
      const failure = error as UiRequestFailure & FormFailure;
      if (failure.code === "form.conflict") failure.message = L("问卷已在别处修改，当前输入已保留。请复制需要保留的内容，再重新读取。");
      const answer = failure.body;
      if (answer && typeof answer === "object") failure.details = (answer as { details?: unknown }).details;
      throw failure;
    }
  };
}

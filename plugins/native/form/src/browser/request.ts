import { pluginRequest } from "@molis-ai/molis-work-plugin-sdk/browser";
import type { UiRequestFailure } from "@molis-ai/molis-work-contracts/platform/ui";
import type { FormClientHost, FormFailure, FormRequest } from "./types.js";

/** Requests to this project's Forms routes; `path` follows `/forms`. */
export function formRequest(host: FormClientHost): FormRequest {
  const L = host.translate;
  const request = pluginRequest(host, {
    project: { id: () => host.projectId(), missing: () => L("form.error.no-project"), includeInRequest: true },
    fallback: () => L("form.error.request"),
    codes: { "form.conflict": () => L("form.error.conflict") },
  });
  return async <T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>) => {
    try {
      return await request<T>(method, "/forms" + path, body);
    } catch (error) {
      const failure = error as UiRequestFailure & FormFailure;
      const answer = failure?.body;
      if (answer && typeof answer === "object") failure.details = (answer as { details?: unknown }).details;
      throw error;
    }
  };
}

import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { UiRequestFailure } from "@molis-ai/molis-work-contracts/platform/ui";
import type { WorkflowsHost, WorkflowsRequest } from "./types.js";

const uiText = globalThis.t;

/**
 * Requests to Workflows' routes in the current project (`path` follows `/workflows`). A failure is the helper's plain Error with
 * the Host's `status`; a read the Host refuses says why in the person's words.
 */
export function workflowsRequest(host: WorkflowsHost): WorkflowsRequest {
  return async <T>(path: string, body?: Record<string, unknown>) => {
    try {
      return await molisWorkRequest<T>(host.pluginRoute("/workflows" + path), { method: body === undefined ? "GET" : "POST", ...(body === undefined ? {} : { body }), fallback: uiText.text("workflows.error.request") });
    } catch (error) {
      const failure = error as UiRequestFailure;
      const refusal = body === undefined ? host.readRefusal(failure.status, failure.code) : "";
      if (refusal) failure.message = refusal;
      throw failure;
    }
  };
}

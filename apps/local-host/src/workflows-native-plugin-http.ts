import type { IncomingMessage, ServerResponse } from "node:http";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { WorkflowsPluginRouteTable, createWorkflowsRouteHandlers, workflowsRouteErrorResponse } from "@molis-ai/molis-work-plugin-workflows";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";

export interface WorkflowsNativePluginHttpOptions {
  /** Bound to the authenticated local user and project; every route is a Workflows action. */
  readonly actions: BoundActionClient;
  readonly invalidateWebView?: () => void;
}

export async function handleWorkflowsNativePluginHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  options: WorkflowsNativePluginHttpOptions): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, {
    prefix: "/api/workflows", maxBodyBytes: 400_000,
    async handle(input) {
      const result = await new WorkflowsPluginRouteTable(createWorkflowsRouteHandlers(options.actions)).handle(input);
      if (result && input.method === "POST") options.invalidateWebView?.();
      return result;
    },
    mapError: workflowsRouteErrorResponse,
  });
}

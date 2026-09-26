import type { IncomingMessage, ServerResponse } from "node:http";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { WorkflowsPluginRouteTable, createWorkflowsRouteHandlers, createWorkflowContentPorts,
  openWorkflowsStore, workflowsRouteErrorResponse, type WorkflowsRoutePorts } from "@molis-ai/molis-work-plugin-workflows";
import { hostCompleteText, type HostCompleteText } from "./host-complete-text.js";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";

export interface WorkflowsNativePluginHttpOptions {
  readonly projectId: string;
  readonly homeDirectory: string;
  readonly actions: BoundActionClient;
  readonly invalidateWebView?: () => void;
  /** Tests inject a model; production reads the configured text model. */
  readonly completeText?: HostCompleteText | null;
}

export async function handleWorkflowsNativePluginHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  options: WorkflowsNativePluginHttpOptions): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, {
    prefix: "/api/workflows", maxBodyBytes: 400_000,
    async handle(input) {
      const store = openWorkflowsStore(options.homeDirectory);
      try {
        return await new WorkflowsPluginRouteTable(createWorkflowsRouteHandlers(store, workflowsHostPorts(options))).handle(input);
      } finally { store.close(); }
    },
    mapError: workflowsRouteErrorResponse,
  });
}

export function workflowsHostPorts(options: WorkflowsNativePluginHttpOptions): WorkflowsRoutePorts {
  const completeText = options.completeText === undefined ? safeCompleteText(options.homeDirectory) : options.completeText ?? undefined;
  return { projectId: options.projectId, ...createWorkflowContentPorts(options.actions),
    aiAvailable: () => Boolean(completeText), ...(completeText ? { completeText } : {}),
    changed: () => options.invalidateWebView?.(),
  };
}

function safeCompleteText(homeDirectory: string): HostCompleteText | undefined {
  try { return hostCompleteText({ homeDirectory }); } catch { return undefined; }
}

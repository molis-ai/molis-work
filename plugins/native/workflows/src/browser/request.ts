import { pluginRequest } from "@molis-ai/molis-work-plugin-sdk/browser";
import type { Translate, WorkflowsHost, WorkflowsRequest } from "./types.js";

/** Requests to Workflows' routes in the current project (`path` follows `/workflows`). */
export function workflowsRequest(host: WorkflowsHost, L: Translate): WorkflowsRequest {
  const request = pluginRequest(host, { readRefusal: true, fallback: () => L("workflows.error.request") });
  return (path, body) => request(body === undefined ? "GET" : "POST", "/workflows" + path, body);
}

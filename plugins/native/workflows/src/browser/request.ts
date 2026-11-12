import { pluginRequest } from "@molis-ai/molis-work-plugin-sdk/browser";
import type { WorkflowsHost, WorkflowsRequest } from "./types.js";

const uiText = globalThis.t;

/** Requests to Workflows' routes in the current project (`path` follows `/workflows`). */
export function workflowsRequest(host: WorkflowsHost): WorkflowsRequest {
  const request = pluginRequest(host, { readRefusal: true, fallback: () => uiText.text("workflows.error.request") });
  return (path, body) => request(body === undefined ? "GET" : "POST", "/workflows" + path, body);
}

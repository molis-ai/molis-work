import type { TaskPluginRouteResponse } from "./routes.js";

export function taskRouteErrorResponse(error: unknown): TaskPluginRouteResponse {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : String(error);
  if (code === "task_not_found") {
    return { status: 404, body: { error: message, code } };
  }
  if (code === "task_goal_conflict") {
    return { status: 409, body: { error: message, code } };
  }
  return { status: 400, body: { error: message, ...(code ? { code } : {}) } };
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "";
}

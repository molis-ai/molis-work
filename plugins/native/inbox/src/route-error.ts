import type { InboxPluginRouteResponse } from "./routes.js";

export function inboxRouteErrorResponse(error: unknown): InboxPluginRouteResponse {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : String(error);
  if (code === "inbox_entry_not_found" || code === "attention_entry_not_found") {
    return { status: 404, body: { error: message, code } };
  }
  if (code === "feed_revision_conflict" || code === "attention_revision_conflict") {
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

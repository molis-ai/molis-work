import type { FunctionsHttpRouteResponse } from "./routes.js";

export function functionsRouteErrorResponse(error: unknown): FunctionsHttpRouteResponse {
  const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "Functions 请求失败";
  if (code === "functions.not_found") return { status: 404, body: { error: message, code } };
  if (code === "actions.forbidden") return { status: 403, body: { error: message, code } };
  if (code === "actions.connection_required" || code === "functions.version_conflict") return { status: 409, body: { error: message, code } };
  if (code === "functions.conflict") return { status: 409, body: { error: message, code } };
  if (code === "functions.provider_not_configured") return { status: 409, body: { error: message, code } };
  if (code === "functions.provider_unauthorized") return { status: 401, body: { error: message, code } };
  if (code === "functions.provider_timeout") return { status: 504, body: { error: message, code } };
  if (code === "functions.provider_failed") return { status: 502, body: { error: message, code } };
  if (code.startsWith("functions.") || code.startsWith("actions.")) return { status: 400, body: { error: message, code } };
  return { status: 400, body: { error: message } };
}

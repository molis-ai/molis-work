import type { ShelfPluginRouteResponse } from "./routes.js";

export function shelfRouteErrorResponse(error: unknown): ShelfPluginRouteResponse {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "Shelf 请求失败";
  if (code === "shelf.item_not_found" || code === "actions.missing") return { status: 404, body: { error: message, code } };
  if (code === "shelf.conflict") return { status: 409, body: { error: message, code } };
  if (["actions.forbidden", "actions.scope_mismatch", "actions.owner_mismatch"].includes(code)) return { status: 403, body: { error: message, code } };
  if (code.startsWith("actions.")) return { status: 400, body: { error: message, code } };
  if (code === "shelf.recipe_unavailable" || code === "shelf.no_agent") return { status: 409, body: { error: message, code } };
  if (code.startsWith("shelf.")) return { status: 400, body: { error: message, code } };
  return { status: 400, body: { error: message } };
}

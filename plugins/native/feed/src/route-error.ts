import { FeedDomainError } from "@molis-ai/molis-work-contracts/modules/feed";
import { FeedStoreError } from "./application-errors.js";
import type { FeedPluginRouteResponse } from "./routes.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";

const NOT_FOUND = new Set(["feed_item_not_found", "inbox_entry_not_found", "feed_source_not_found", "feed_out_rule_not_found"]);
const CONFLICT = new Set(["feed_revision_conflict", "feed_source_paused", "feed_source_use_catalog"]);
const storeCode = (code: string) => NOT_FOUND.has(code) || CONFLICT.has(code) || code.startsWith("feed_");
export function feedRouteErrorResponse(error: unknown): FeedPluginRouteResponse {
  // Feed store refusals keep their code when they come back through an action, so the route answers exactly as before.
  if (error instanceof ActionError && !storeCode(error.code)) return { status: error.code === "actions.forbidden" || error.code === "actions.plugin_disabled" ? 403
    : error.code === "actions.missing" ? 404 : 400, body: { error: error.message, code: error.code } };
  if (error instanceof ActionError || error instanceof FeedDomainError || error instanceof FeedStoreError) {
    return { status: NOT_FOUND.has(error.code) ? 404 : CONFLICT.has(error.code) ? 409 : 400, body: { error: error.message, code: error.code } };
  }
  return { status: 400, body: { error: error instanceof Error ? error.message : String(error) } };
}

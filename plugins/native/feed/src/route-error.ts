import { FeedDomainError } from "@molis-ai/molis-work-contracts/modules/feed";
import { FeedStoreError } from "./application-errors.js";
import type { FeedPluginRouteResponse } from "./routes.js";

export function feedRouteErrorResponse(error: unknown): FeedPluginRouteResponse {
  if (error instanceof FeedStoreError && (error.code === "feed_item_not_found" || error.code === "inbox_entry_not_found" || error.code === "feed_source_not_found" || error.code === "feed_out_rule_not_found")) {
    return { status: 404, body: { error: error.message, code: error.code } };
  }
  if (error instanceof FeedDomainError || error instanceof FeedStoreError) {
    const conflict = ["feed_revision_conflict", "feed_source_paused", "feed_source_use_catalog"].includes(error.code);
    return { status: conflict ? 409 : 400, body: { error: error.message, code: error.code } };
  }
  return { status: 400, body: { error: error instanceof Error ? error.message : String(error) } };
}

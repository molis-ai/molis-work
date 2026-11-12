import type { FeedSourceRunRecord } from "./projection.js";
import type { FeedUiSourceRun } from "./ui.js";

/** Why a pull did not bring anything new, as a person reads it; each caller says it from its own key table. No SDK import here: the
 * page's script uses the page's own `t`, and pulling in the SDK's text added about 10 KB to it. */
export type FeedRunFailure = "kept" | "refused" | "not_feed" | "unusable" | "unavailable";

/** Only the received HTTP status is needed to distinguish a refusal from a site that never answered. */
export function feedRunHttpStatus(receipt: FeedSourceRunRecord["receipt"]): number | undefined {
  const response = receipt?.rss_http;
  if (response && typeof response === "object" && "status" in response && typeof response.status === "number") return response.status;
}

export function feedRunFailure(run: Pick<FeedUiSourceRun, "phase" | "outcome" | "error_code" | "http_status">): FeedRunFailure | null {
  if (run.phase === "running") return null;
  if (run.phase === "interrupted") return "kept";
  if (!run.error_code && run.outcome !== "failed" && run.outcome !== "cancelled" && run.outcome !== "reconciliation_required") return null;
  if (run.http_status === 401 || run.http_status === 403) return "refused";
  const invalidResponse = run.error_code === "protocol_invalid" || run.error_code === "provider_protocol_invalid";
  if (run.error_code === "feed_parse_failed" || (invalidResponse && run.http_status !== undefined && run.http_status >= 200 && run.http_status < 300)) return "not_feed";
  if (invalidResponse) return "unusable";
  if (run.error_code === "provider_unavailable" || run.error_code === "feed_unavailable") return "unavailable";
  return "kept";
}

import type { FeedSourceRecord, FeedSourceRunRecord } from "./projection.js";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { FeedUiSource, FeedUiSourceRun } from "./ui.js";

export function feedSourceUiKind(source: Pick<FeedSourceRecord, "kind" | "sync_kind">): FeedUiSource["ui_kind"] {
  return source.kind === "research_library" ? "other" : source.sync_kind === "github" ? "github" : source.sync_kind === "gmail" ? "gmail"
    : source.sync_kind === "connector" ? "connector" : ["rss", "custom_rss"].includes(source.kind) || source.sync_kind === "public_source" ? "rss" : "other";
}
/** Explicit public presentation references; the integration owns their interpretation. */
export function feedSourcePresentationId(source: Pick<FeedSourceRecord, "kind" | "sync_kind">): string | undefined {
  const kind = feedSourceUiKind(source);
  return kind === "rss" ? "rss-http" : kind === "gmail" ? "gmail-scope" : undefined;
}

/** Only the received HTTP status is needed to distinguish a refusal from a site that never answered. */
export function feedRunHttpStatus(receipt: FeedSourceRunRecord["receipt"]): number | undefined {
  const response = receipt?.rss_http;
  if (response && typeof response === "object" && "status" in response && typeof response.status === "number") return response.status;
}

export function feedRunFailure(run: FeedUiSourceRun): string | null {
  if (run.phase === "running") return null;
  if (run.phase === "interrupted") return uiText.text("feed.run.existing-kept-retry-later");
  if (!run.error_code && run.outcome !== "failed" && run.outcome !== "cancelled" && run.outcome !== "reconciliation_required") return null;
  if (run.http_status === 401 || run.http_status === 403) return uiText.text("feed.run.source-refused-access");
  const invalidResponse = run.error_code === "protocol_invalid" || run.error_code === "provider_protocol_invalid";
  if (run.error_code === "feed_parse_failed" || (invalidResponse && run.http_status !== undefined && run.http_status >= 200 && run.http_status < 300)) {
    return uiText.text("feed.run.not-rss-atom");
  }
  if (invalidResponse) return uiText.text("feed.run.unusable-response");
  if (run.error_code === "provider_unavailable" || run.error_code === "feed_unavailable") return uiText.text("feed.run.source-unavailable");
  return uiText.text("feed.run.existing-kept-retry-later");
}

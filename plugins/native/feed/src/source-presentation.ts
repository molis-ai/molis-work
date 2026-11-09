import type { FeedSourceRecord, FeedSourceRunRecord } from "./projection.js";
import type { FeedUiPrimitives, FeedUiSource, FeedUiSourceRun } from "./ui.js";

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

export function feedRunFailure(run: FeedUiSourceRun, L: FeedUiPrimitives["text"]): string | null {
  if (run.phase === "running") return null;
  if (run.phase === "interrupted") return L("已有内容仍在，请稍后重试。");
  if (!run.error_code && run.outcome !== "failed" && run.outcome !== "cancelled" && run.outcome !== "reconciliation_required") return null;
  if (run.http_status === 401 || run.http_status === 403) return L("来源网站拒绝了访问。请检查订阅地址，或换一个来源。");
  const invalidResponse = run.error_code === "protocol_invalid" || run.error_code === "provider_protocol_invalid";
  if (run.error_code === "feed_parse_failed" || (invalidResponse && run.http_status !== undefined && run.http_status >= 200 && run.http_status < 300)) {
    return L("这个地址返回的内容无法读成 RSS 或 Atom。请换用网站提供的订阅地址。");
  }
  if (invalidResponse) return L("这个来源返回了无法使用的响应。请检查来源设置。");
  if (run.error_code === "provider_unavailable" || run.error_code === "feed_unavailable") return L("来源暂时不可用，请稍后重试。");
  return L("已有内容仍在，请稍后重试。");
}

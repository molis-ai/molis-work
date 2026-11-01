import type { FeedSourceRecord } from "./projection.js";
import type { FeedUiSource } from "./ui.js";

export function feedSourceUiKind(source: Pick<FeedSourceRecord, "kind" | "sync_kind">): FeedUiSource["ui_kind"] {
  return source.kind === "research_library" ? "other" : source.sync_kind === "github" ? "github" : source.sync_kind === "gmail" ? "gmail"
    : source.sync_kind === "connector" ? "connector" : ["rss", "custom_rss"].includes(source.kind) || source.sync_kind === "public_source" ? "rss" : "other";
}
/** Explicit public presentation references; the integration owns their interpretation. */
export function feedSourcePresentationId(source: Pick<FeedSourceRecord, "kind" | "sync_kind">): string | undefined {
  const kind = feedSourceUiKind(source);
  return kind === "rss" ? "rss-http" : kind === "gmail" ? "gmail-scope" : undefined;
}

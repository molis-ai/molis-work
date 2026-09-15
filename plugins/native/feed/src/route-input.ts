import { FeedDomainError } from "@molis-ai/molis-work-contracts/modules/feed";
import { FeedStoreError } from "./application-errors.js";
import type { RegisterFeedSourceInput } from "./source-ports.js";

export function sourceRegistrationInput(body: Readonly<Record<string, unknown>>): RegisterFeedSourceInput | null {
  if (body.kind === "rss" && typeof body.definition_id === "string") return { kind: "rss", definition_id: body.definition_id };
  if (body.kind === "web_query" && typeof body.query === "string") return { kind: "web_query", query: body.query, ...(typeof body.name === "string" ? { name: body.name } : {}) };
  if (body.kind === "youtube_channel" && typeof body.channel_id === "string") return { kind: "youtube_channel", channel_id: body.channel_id, ...(typeof body.name === "string" ? { name: body.name } : {}) };
  if (body.kind === "custom_rss" && typeof body.feed_url === "string") return { kind: "custom_rss", feed_url: body.feed_url, ...(typeof body.name === "string" ? { name: body.name } : {}) };
  return null;
}

export function integerRevision(value: unknown): number | null {
  const revision = value == null ? null : Number(value);
  return revision != null && Number.isInteger(revision) && revision >= 1 ? revision : null;
}

export function requireParam(value: string | undefined, message: string): string {
  if (!value) throw new FeedStoreError("feed_item_not_found", message);
  return value;
}

export function requireProvider(value: string | undefined): "github" | "gmail" {
  if (value === "github" || value === "gmail") return value;
  throw new FeedDomainError("Connector 不存在", "feed_connector_unsupported");
}

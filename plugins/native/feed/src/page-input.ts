import { feedErrors } from "./contract/feed.js";
import type { FeedItemPage } from "./contract/feed-page.js";

export const FEED_PAGE_INPUTS = ["offset", "filter", "material_offset"];
export const feedPageSchema = { type: "object", properties: { offset: { type: "string" }, filter: { type: "string", maxLength: 2000 } }, additionalProperties: false };
const FILTER_KEYS = new Set(["item_id", "source_id", "search", "status", "unread", "since", "provider", "source_label", "sort"]);
function filters(value: string | undefined): Record<string, string> {
  if (value === undefined) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw feedErrors.invalid_transition("筛选参数无效"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
    || Object.entries(parsed).some(([key, val]) => !FILTER_KEYS.has(key) || typeof val !== "string")) throw feedErrors.invalid_transition("筛选参数无效");
  return parsed as Record<string, string>;
}
export function feedPageOffset(value: string | undefined): number {
  if (value === undefined) return 0;
  if (!/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value))) throw feedErrors.invalid_transition("分页位置无效");
  return Number(value);
}
export function feedPageInput(page: Readonly<Record<string, string>>): FeedItemPage {
  const input = filters(page.filter);
  const status = input.status ?? "all", sort = input.sort ?? "newest";
  if (!["all", "active", "feed", "saved", "promoted", "archived", "inbox"].includes(status)
    || !["newest", "oldest", "title", "source"].includes(sort) || input.unread !== undefined && !["true", "false"].includes(input.unread)
    || input.since !== undefined && !Number.isFinite(Date.parse(input.since))) throw feedErrors.invalid_transition("筛选参数无效");
  return { limit: 200, offset: feedPageOffset(page.offset), source_id: input.source_id, item_id: input.item_id, search: input.search,
    status: (status === "feed" ? "inbox" : status) as FeedItemPage["status"], sort: sort as FeedItemPage["sort"], unread: input.unread === "true",
    since: input.since, provider: input.provider, source_label: input.source_label };
}

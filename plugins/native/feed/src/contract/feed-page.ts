import type { FeedItemDisposition } from "./feed.js";

/** Owner-side selection. Every field is data, never SQL supplied by a caller. */
export interface FeedItemPage {
  limit: number;
  offset: number;
  source_id?: string;
  item_id?: string;
  after_id?: string;
  search?: string;
  status?: FeedItemDisposition | "active" | "all";
  unread?: boolean;
  since?: string;
  provider?: string;
  source_label?: string;
  sort?: "newest" | "oldest" | "title" | "source" | "id";
}

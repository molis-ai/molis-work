import type { FeedItemPage } from "../../contract/feed-page.js";
export type { FeedItemPage } from "../../contract/feed-page.js";

export function feedPageSelection(page: FeedItemPage): { where: string; values: (string | number)[]; order: string } {
  const clauses: string[] = [], values: (string | number)[] = [];
  const add = (sql: string, value: string | number) => { clauses.push(sql); values.push(value); };
  if (page.item_id) add("item_id = ?", page.item_id);
  if (page.source_id === "other") clauses.push("(source_id IS NULL OR source_id NOT IN (SELECT source_id FROM feed_sources WHERE project_id = feed_items.project_id AND COALESCE(json_extract(config_json, '$._molis_work_lifecycle.deleted_at'), '') = ''))");
  else if (page.source_id) add("source_id = ?", page.source_id);
  if (page.after_id) add("item_id > ?", page.after_id);
  if (page.status === "active") add("disposition <> ?", "archived");
  else if (page.status && page.status !== "all") add("disposition = ?", page.status);
  if (page.unread) clauses.push("read_at IS NULL");
  if (page.since) add("source_updated_at >= ?", page.since);
  if (page.provider) {
    const text = "lower(source_kind || ' ' || kind || ' ' || source_label)";
    add(`CASE WHEN instr(${text}, 'github') > 0 THEN 'github' WHEN instr(${text}, 'gmail') > 0 OR instr(${text}, 'mail') > 0 THEN 'gmail' WHEN instr(${text}, 'rss') > 0 OR instr(${text}, 'atom') > 0 OR instr(${text}, 'feed') > 0 THEN 'rss' ELSE 'other' END = ?`, page.provider);
  }
  if (page.source_label) add("COALESCE(NULLIF(source_label, ''), source_kind) = ?", page.source_label);
  if (page.search) add("instr(lower(title || ' ' || summary || ' ' || source_label), lower(?)) > 0", page.search);
  const orders = { newest: "source_updated_at DESC, item_id", oldest: "source_updated_at, item_id", title: "title, item_id", source: "source_label, item_id", id: "item_id" };
  return { where: clauses.length ? " AND " + clauses.join(" AND ") : "", values, order: orders[page.sort ?? "newest"] };
}

import { bindSearchEntriesHandler, defineSearchEntriesAction, searchRevisionOf, searchText, type ActionHandlerBinding, type SearchEntry } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ShelfSnapshot } from "@molis-ai/molis-work-contracts/modules/shelf";

/**
 * Shelf's part in the system search: the person's shelf items (by name and extracted preview text) and clipboard history.
 * Original files stay on the shelf; only text the shelf already shows is indexed.
 */
export const shelfSearchEntriesAction = defineSearchEntriesAction("shelf.search.entries",
  [{ kind: "shelf_item", title: "置物架材料", surface: "shelf" }, { kind: "shelf_clip", title: "剪贴板", surface: "shelf" }], "置物架", ["shelf:read"], "home");

export function shelfSearchEntries(snapshot: ShelfSnapshot): SearchEntry[] {
  const items = [...snapshot.materials, ...snapshot.results].filter(item => !item.hidden).map((item): SearchEntry => {
    const summary = searchText([item.preview_text, item.failure_reason].filter(Boolean).join("\n"), 4000);
    return { subject: { kind: "shelf_item", id: item.item_id }, revision: searchRevisionOf([item.status, item.name, summary]), title: item.name, summary,
      updated_at: item.created_at, content: "summary", open: { surface: "shelf", id: item.item_id } };
  });
  const clips = snapshot.clipboard.map((clip): SearchEntry => ({ subject: { kind: "shelf_clip", id: clip.clip_id }, revision: clip.fingerprint,
    title: clip.title || searchText(clip.body, 80) || "剪贴板", summary: searchText(clip.body, 4000), updated_at: clip.created_at, content: "summary", open: { surface: "shelf", id: clip.clip_id } }));
  return [...items, ...clips];
}

export function createShelfSearchHandlers(snapshot: () => ShelfSnapshot): ActionHandlerBinding[] {
  return [bindSearchEntriesHandler(shelfSearchEntriesAction, () => shelfSearchEntries(snapshot()))];
}

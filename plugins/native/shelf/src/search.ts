import { ActionError, bindSearchEntriesHandler, defineSearchEntriesAction, defineSubjectContextAction, searchRevisionOf, searchText, subjectContext, type ActionDefinition, type ActionHandlerBinding, type ActionSubjectContext, type SearchEntry } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ShelfSnapshot } from "@molis-ai/molis-work-contracts/modules/shelf";

/**
 * Shelf's part in the system search. Original files stay on the shelf; only text the shelf already shows is indexed.
 * Materials reach as far as `shelf.items.read` does. Clipboard history stays with the local person, like every other
 * clipboard action, so it is its own source open to `user` only: no Agent, workflow or external client finds it.
 */
export const shelfSearchEntriesAction = defineSearchEntriesAction("shelf.search.entries",
  [{ kind: "shelf_item", title: "置物架材料", surface: "shelf" }], "置物架", ["shelf:read"], "home");
export const shelfClipboardSearchEntriesAction = defineSearchEntriesAction("shelf.clipboard.search.entries",
  [{ kind: "shelf_clip", title: "剪贴板", surface: "shelf" }], "剪贴板", ["shelf:read"], "home", ["user"]);

/**
 * One Shelf material by the shared subject protocol: where it is, its name and the text the shelf already shows. It
 * reaches as far as `shelf.items.read` (no plugins); a copy deleted from the shelf answers `shelf.not_found`.
 */
const reader = defineSubjectContextAction("shelf.subject.read", "shelf_item", "置物架材料", ["shelf:read"], "home");
export const shelfSubjectAction: ActionDefinition<{ subject_id: string }, ActionSubjectContext> = { ...reader, action: { ...reader.action, audiences: ["user", "workflow", "agent", "mcp"] } };

export function shelfSubjectContext(snapshot: ShelfSnapshot, id: string): ActionSubjectContext {
  const item = [...snapshot.materials, ...snapshot.results].find(entry => entry.item_id === id);
  if (!item) throw new ActionError("shelf.not_found", "这份材料已不在 Shelf 中");
  const content = [item.preview_text, item.failure_reason].filter(Boolean).join("\n");
  return subjectContext({ subject: { kind: "shelf_item", id }, revision: searchRevisionOf([item.status, item.name, content]), title: item.name, content,
    goal_ids: [], session_id: null, open: { surface: "shelf", id } });
}

export function shelfSearchEntries(snapshot: ShelfSnapshot): SearchEntry[] {
  return [...snapshot.materials, ...snapshot.results].filter(item => !item.hidden).map((item): SearchEntry => {
    const summary = searchText([item.preview_text, item.failure_reason].filter(Boolean).join("\n"), 4000);
    return { subject: { kind: "shelf_item", id: item.item_id }, revision: searchRevisionOf([item.status, item.name, summary]), title: item.name, summary,
      updated_at: item.created_at, content: "summary", open: { surface: "shelf", id: item.item_id } };
  });
}

export function shelfClipboardSearchEntries(snapshot: ShelfSnapshot): SearchEntry[] {
  return snapshot.clipboard.map((clip): SearchEntry => ({ subject: { kind: "shelf_clip", id: clip.clip_id }, revision: clip.fingerprint,
    title: clip.title || searchText(clip.body, 80) || "剪贴板", summary: searchText(clip.body, 4000), updated_at: clip.created_at, content: "summary", open: { surface: "shelf", id: clip.clip_id } }));
}

export function createShelfSearchHandlers(snapshot: () => ShelfSnapshot): ActionHandlerBinding[] {
  return [{ capability_id: shelfSubjectAction.capability_id, version: shelfSubjectAction.version, handle: (_caller, input) => shelfSubjectContext(snapshot(), (input as { subject_id: string }).subject_id) },
    bindSearchEntriesHandler(shelfSearchEntriesAction, () => shelfSearchEntries(snapshot())),
    bindSearchEntriesHandler(shelfClipboardSearchEntriesAction, () => shelfClipboardSearchEntries(snapshot()))];
}

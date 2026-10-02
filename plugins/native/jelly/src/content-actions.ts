import { createHash } from "node:crypto";
import { bindWorkflowContentHandlers, defineWorkflowContentActions, workflowDeliveryKey, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { JellyError } from "./error.js";
import { JELLY_NOTE_SUBJECT_KIND } from "./search.js";
import type { JellyStore } from "./store.js";

/** Jelly as a place content can be handed to: it arrives as a note (灵光's 「转成 Jelly 笔记」, a workflow step). */
export const jellyContentActions = defineWorkflowContentActions({ id: "jelly", title: "Jelly 笔记", icon: "note", subject_kind: JELLY_NOTE_SUBJECT_KIND,
  read_permissions: ["jelly:read"], write_permissions: ["jelly:read", "jelly:write"] });

const ref = (note: { id: string; title: string }) => ({ plugin: "jelly", item_id: note.id, title: note.title || "新笔记" });

export function createJellyContentHandlers(withStore: <T>(run: (store: JellyStore) => T) => T): ActionHandlerBinding[] {
  return bindWorkflowContentHandlers(jellyContentActions, {
    list: () => withStore(store => store.read().notes.filter(note => !note.archived_at)
      .map(note => ({ item_id: note.id, title: note.title || "新笔记", caption: "Jelly 笔记", at: note.updated_at }))),
    read: ({ item_id }) => withStore(store => {
      const note = store.read().notes.find(entry => entry.id === item_id && !entry.archived_at);
      if (!note) throw new JellyError("jelly.not_found", "笔记已删除或已归档", 404);
      return { title: note.title, body: note.blocks.map(block => block.text).join("\n"), source: "Jelly", feed_item_id: null };
    }),
    // One delivery is one note: a retried handoff finds the note it made the first time.
    receive: ({ payload, context }) => withStore(store => {
      const id = `note-${createHash("sha256").update(workflowDeliveryKey(context)).digest("hex").slice(0, 32)}`;
      const existing = store.read().notes.find(note => note.id === id);
      if (existing) return ref(existing);
      const markdown = [payload.body, payload.url ? `来源：${payload.url}` : "", payload.source ? `来自：${payload.source}` : ""].filter(part => part?.trim()).join("\n\n");
      const state = store.execute({ type: "note.create", id, title: payload.title, category_id: "uncategorized", markdown });
      return ref(state.notes.find(note => note.id === id)!);
    }),
  });
}

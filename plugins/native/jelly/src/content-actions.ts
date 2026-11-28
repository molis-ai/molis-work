import { createHash } from "node:crypto";
import { bindWorkflowContentHandlers, defineWorkflowContentActions, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { tryUiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { jellyErrors } from "./error.js";
import { JELLY_NOTE_SUBJECT_KIND, jellyNoteTitle } from "./search.js";
import type { JellyStores } from "./store.js";

/** Jelly as a place content can be handed to: it arrives as a note (灵光's 「转成 Jelly 笔记」, a workflow step). */
export const jellyContentActions = defineWorkflowContentActions({ id: "jelly", title: "Jelly 随手记", icon: "note", subject_kind: JELLY_NOTE_SUBJECT_KIND,
  read_permissions: ["jelly:read"], write_permissions: ["jelly:read", "jelly:write"] });

export function createJellyContentHandlers(stores: JellyStores): ActionHandlerBinding[] {
  return bindWorkflowContentHandlers(jellyContentActions, {
    list: () => stores.read(store => {
      const caption = tryUiText("jelly.content.caption") ?? "Jelly 随手记";
      return store.notes().map(note => ({ item_id: note.id, title: jellyNoteTitle(note), caption, at: note.updated_at }));
    }),
    read: ({ item_id }) => stores.read(store => {
      const note = store.get("note", item_id);
      if (!note) throw jellyErrors.not_found("随手记已删除");
      return { title: jellyNoteTitle(note), body: note.body, source: "Jelly" };
    }),
    // One delivery is one note: a retried handoff finds the note it made the first time.
    receive: ({ title, body, url, source, request_id }, caller) => stores.write(caller, store => {
      const id = `note-${createHash("sha256").update(request_id).digest("hex").slice(0, 32)}`;
      const note = store.get("note", id) ?? (() => {
        const now = new Date().toISOString();
        const sourceLine = url ? (tryUiText("jelly.content.source-url", { value: url }) ?? `来源：${url}`) : "";
        const fromLine = source ? (tryUiText("jelly.content.from-source", { value: source }) ?? `来自：${source}`) : "";
        const text = [body, sourceLine, fromLine].filter(part => part?.trim()).join("\n\n");
        return store.insert("note", { id, title: [...title].slice(0, 500).join(""), body: [...text].slice(0, 200_000).join(""), day: null, revision: 1, created_at: now, updated_at: now });
      })();
      return { subject: { kind: JELLY_NOTE_SUBJECT_KIND, id: note.id }, title: jellyNoteTitle(note) };
    }),
  });
}

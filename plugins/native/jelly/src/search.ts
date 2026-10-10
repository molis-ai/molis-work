import { ActionError, bindSearchEntriesHandler, defineSearchEntriesAction, defineSubjectContextAction, searchText, subjectContext, type ActionHandlerBinding, type SearchEntry } from "@molis-ai/molis-work-contracts/platform/actions";
import { JELLY_PROJECT_PLUGIN_ID, type JellyItem, type JellyNote, type JellyWorkspace } from "@molis-ai/molis-work-contracts/modules/jelly";
import type { JellyStore } from "./store.js";

/** A calendar entry: a one-off item or a repeating series as a whole (its occurrences are read through the series). */
export const JELLY_ITEM_SUBJECT_KIND = "jelly_item";
export const JELLY_NOTE_SUBJECT_KIND = "jelly_note";
/** Jelly's part in the system search: calendar items (and repeating series) and notes that are not archived. */
const kinds = [
  { kind: JELLY_ITEM_SUBJECT_KIND, title: "日程", surface: JELLY_PROJECT_PLUGIN_ID },
  { kind: JELLY_NOTE_SUBJECT_KIND, title: "笔记", surface: JELLY_PROJECT_PLUGIN_ID },
];
export const jellySearchActions = {
  entries: defineSearchEntriesAction("jelly.search.entries", kinds, "Jelly 日程与笔记", ["jelly:read"], "home"),
  item: defineSubjectContextAction("jelly.item.subject.read", JELLY_ITEM_SUBJECT_KIND, "Jelly 日程", ["jelly:read"], "home"),
  note: defineSubjectContextAction("jelly.note.subject.read", JELLY_NOTE_SUBJECT_KIND, "Jelly 笔记", ["jelly:read"], "home"),
};

const itemText = (item: JellyItem) => [item.notes, item.completion_description, item.start_date === item.end_date ? item.start_date : `${item.start_date} — ${item.end_date}`].filter(Boolean).join("\n");
const noteText = (note: JellyNote) => note.blocks.map(block => block.text).filter(Boolean).join("\n");
const open = (id: string) => ({ surface: JELLY_PROJECT_PLUGIN_ID, id });

export function jellySearchEntries(state: JellyWorkspace): SearchEntry[] {
  const items = [...state.items, ...state.series].map((item): SearchEntry => ({ subject: { kind: JELLY_ITEM_SUBJECT_KIND, id: item.id }, revision: item.updated_at, title: item.title,
    summary: searchText(itemText(item), 1000), updated_at: item.updated_at, content: "summary", open: open(item.id) }));
  const notes = state.notes.filter(note => !note.archived_at).map((note): SearchEntry => ({ subject: { kind: JELLY_NOTE_SUBJECT_KIND, id: note.id }, revision: String(note.revision),
    title: note.title || "未命名笔记", summary: "", updated_at: note.updated_at, content: "context", open: open(note.id) }));
  return [...items, ...notes];
}

export function createJellySearchHandlers(withStore: <T>(run: (store: JellyStore) => T) => T): ActionHandlerBinding[] {
  const read = () => withStore(store => store.read());
  const missing = (label: string) => new ActionError("jelly.not_found", `${label}已删除或已归档`);
  const id = (input: unknown) => (input as { subject_id: string }).subject_id;
  return [
    bindSearchEntriesHandler(jellySearchActions.entries, () => jellySearchEntries(read())),
    { ...jellySearchActions.item, handle: (_caller, input) => {
      const item = [...read().items, ...read().series].find(entry => entry.id === id(input));
      if (!item) throw missing("日程");
      return subjectContext({ subject: { kind: JELLY_ITEM_SUBJECT_KIND, id: item.id }, revision: item.updated_at, title: item.title, content: itemText(item), goal_ids: [], session_id: null, open: open(item.id) });
    } },
    { ...jellySearchActions.note, handle: (_caller, input) => {
      const note = read().notes.find(entry => entry.id === id(input));
      if (!note || note.archived_at) throw missing("笔记");
      return subjectContext({ subject: { kind: JELLY_NOTE_SUBJECT_KIND, id: note.id }, revision: String(note.revision), title: note.title || "未命名笔记", content: noteText(note), goal_ids: [], session_id: null, open: open(note.id) });
    } },
  ];
}

import { ActionError, bindSearchEntriesHandler, defineSearchEntriesAction, defineSubjectContextAction, searchText, subjectContext, type ActionHandlerBinding, type SearchEntry } from "@molis-ai/molis-work-contracts/platform/actions";
import { JELLY_PROJECT_PLUGIN_ID, type JellyInspiration, type JellyItem, type JellyNote, type JellyWorkspace } from "@molis-ai/molis-work-contracts/modules/jelly";
import type { JellyStore } from "./store.js";

/** Jelly's part in the system search: calendar items (and repeating series), notes and inspirations that are not archived. */
const kinds = [
  { kind: "jelly_item", title: "日程", surface: JELLY_PROJECT_PLUGIN_ID },
  { kind: "jelly_note", title: "笔记", surface: JELLY_PROJECT_PLUGIN_ID },
  { kind: "jelly_inspiration", title: "灵感", surface: JELLY_PROJECT_PLUGIN_ID },
];
export const jellySearchActions = {
  entries: defineSearchEntriesAction("jelly.search.entries", kinds, "Jelly", ["jelly:read"], "home"),
  item: defineSubjectContextAction("jelly.item.subject.read", "jelly_item", "Jelly 日程", ["jelly:read"], "home"),
  note: defineSubjectContextAction("jelly.note.subject.read", "jelly_note", "Jelly 笔记", ["jelly:read"], "home"),
  inspiration: defineSubjectContextAction("jelly.inspiration.subject.read", "jelly_inspiration", "Jelly 灵感", ["jelly:read"], "home"),
};

const itemText = (item: JellyItem) => [item.notes, item.completion_description, item.start_date === item.end_date ? item.start_date : `${item.start_date} — ${item.end_date}`].filter(Boolean).join("\n");
const noteText = (note: JellyNote) => note.blocks.map(block => block.text).filter(Boolean).join("\n");
const inspirationText = (inspiration: JellyInspiration) => [inspiration.raw_text, inspiration.url, inspiration.file_name,
  ...(inspiration.material?.blocks ?? []).map(block => block.text)].filter(Boolean).join("\n");
const open = (id: string) => ({ surface: JELLY_PROJECT_PLUGIN_ID, id });

export function jellySearchEntries(state: JellyWorkspace): SearchEntry[] {
  const items = [...state.items, ...state.series].map((item): SearchEntry => ({ subject: { kind: "jelly_item", id: item.id }, revision: item.updated_at, title: item.title,
    summary: searchText(itemText(item), 1000), updated_at: item.updated_at, content: "summary", open: open(item.id) }));
  const notes = state.notes.filter(note => !note.archived_at).map((note): SearchEntry => ({ subject: { kind: "jelly_note", id: note.id }, revision: String(note.revision),
    title: note.title || "未命名笔记", summary: "", updated_at: note.updated_at, content: "context", open: open(note.id) }));
  const inspirations = state.inspirations.filter(inspiration => !inspiration.archived_at).map((inspiration): SearchEntry => ({ subject: { kind: "jelly_inspiration", id: inspiration.id },
    revision: inspiration.updated_at, title: inspiration.title || searchText(inspiration.raw_text, 80) || "灵感", summary: "",
    updated_at: inspiration.updated_at, content: "context", open: open(inspiration.id) }));
  return [...items, ...notes, ...inspirations];
}

export function createJellySearchHandlers(withStore: <T>(run: (store: JellyStore) => T) => T): ActionHandlerBinding[] {
  const read = () => withStore(store => store.read());
  const missing = (label: string) => new ActionError("actions.subject_unavailable", `${label}已删除或已归档`);
  const id = (input: unknown) => (input as { subject_id: string }).subject_id;
  return [
    bindSearchEntriesHandler(jellySearchActions.entries, () => jellySearchEntries(read())),
    { ...jellySearchActions.item, handle: (_caller, input) => {
      const item = [...read().items, ...read().series].find(entry => entry.id === id(input));
      if (!item) throw missing("日程");
      return subjectContext({ subject: { kind: "jelly_item", id: item.id }, revision: item.updated_at, title: item.title, content: itemText(item), goal_ids: [], session_id: null, open: open(item.id) });
    } },
    { ...jellySearchActions.note, handle: (_caller, input) => {
      const note = read().notes.find(entry => entry.id === id(input));
      if (!note || note.archived_at) throw missing("笔记");
      return subjectContext({ subject: { kind: "jelly_note", id: note.id }, revision: String(note.revision), title: note.title || "未命名笔记", content: noteText(note), goal_ids: [], session_id: null, open: open(note.id) });
    } },
    { ...jellySearchActions.inspiration, handle: (_caller, input) => {
      const inspiration = read().inspirations.find(entry => entry.id === id(input));
      if (!inspiration || inspiration.archived_at) throw missing("灵感");
      return subjectContext({ subject: { kind: "jelly_inspiration", id: inspiration.id }, revision: inspiration.updated_at, title: inspiration.title || searchText(inspiration.raw_text, 80) || "灵感",
        content: inspirationText(inspiration), goal_ids: [], session_id: null, open: open(inspiration.id) });
    } },
  ];
}

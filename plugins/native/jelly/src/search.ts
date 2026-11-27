import { bindActionHandler, bindSearchEntriesHandler, defineSearchEntriesAction, defineSubjectContextAction, searchText, subjectContext, type ActionHandlerBinding, type SearchEntry } from "@molis-ai/molis-work-contracts/platform/actions";
import { JELLY_PROJECT_PLUGIN_ID, type JellyItem, type JellyNote, type JellySeries } from "./contract.js";
import type { JellyStore } from "./store.js";
import { jellyErrors } from "./error.js";

/** A calendar entry: a one-off entry or a repeating series as a whole (its occurrences are read through the series). */
export const JELLY_ITEM_SUBJECT_KIND = "jelly_item";
export const JELLY_NOTE_SUBJECT_KIND = "jelly_note";
/** Jelly's part in the system search: calendar entries (and repeating series) and notes. */
const kinds = [
  { kind: JELLY_ITEM_SUBJECT_KIND, title: "日程", surface: JELLY_PROJECT_PLUGIN_ID },
  { kind: JELLY_NOTE_SUBJECT_KIND, title: "随手记", surface: JELLY_PROJECT_PLUGIN_ID, glyph: "note" },
];
const itemReader = defineSubjectContextAction("jelly.item.subject.read", /* @version action.jelly.item.subject.read */ 1, JELLY_ITEM_SUBJECT_KIND, "Jelly 日程", ["jelly:read"]);
const noteReader = defineSubjectContextAction("jelly.note.subject.read", /* @version action.jelly.note.subject.read */ 1, JELLY_NOTE_SUBJECT_KIND, "Jelly 随手记", ["jelly:read"]);
export const jellySearchActions = {
  entries: defineSearchEntriesAction("jelly.search.entries", /* @version action.jelly.search.entries */ 1, kinds, "Jelly 日程与随手记", ["jelly:read"]),
  item: { ...itemReader, action: { ...itemReader.action, execution: { cost: "none" as const } } },
  note: { ...noteReader, action: { ...noteReader.action, execution: { cost: "none" as const } } },
};

const itemText = (item: JellyItem | JellySeries) => [item.notes, item.start_date === item.end_date ? item.start_date : `${item.start_date} — ${item.end_date}`].filter(Boolean).join("\n");
const noteTitle = (note: JellyNote) => note.title.trim() || [...note.body.trim().split("\n", 1)[0]!.replace(/^#+\s*/u, "")].slice(0, 80).join("") || "随手记";
const open = (id: string) => ({ surface: JELLY_PROJECT_PLUGIN_ID, id });

export function createJellySearchHandlers(withStore: <T>(run: (store: JellyStore) => T) => T): ActionHandlerBinding[] {
  const missing = (label: string) => jellyErrors.not_found(`${label}已删除`);
  return [
    bindSearchEntriesHandler(jellySearchActions.entries, () => withStore(store => {
      const { items, series } = store.everyEntry();
      const entries = [...items, ...series].map((item): SearchEntry => ({ subject: { kind: JELLY_ITEM_SUBJECT_KIND, id: item.id }, revision: String(item.revision), title: item.title,
        summary: searchText(itemText(item), 1000), updated_at: item.updated_at, content: "summary", open: open(item.id) }));
      return [...entries, ...store.notes().map((note): SearchEntry => ({ subject: { kind: JELLY_NOTE_SUBJECT_KIND, id: note.id }, revision: String(note.revision),
        title: noteTitle(note), summary: "", updated_at: note.updated_at, content: "context", open: open(note.id) }))];
    })),
    bindActionHandler(jellySearchActions.item, input => withStore(store => {
      const item = store.get("item", input.subject_id) ?? store.get("series", input.subject_id);
      if (!item) throw missing("日程");
      return subjectContext({ subject: { kind: JELLY_ITEM_SUBJECT_KIND, id: item.id }, revision: String(item.revision), title: item.title, content: itemText(item), open: open(item.id) });
    })),
    bindActionHandler(jellySearchActions.note, input => withStore(store => {
      const note = store.get("note", input.subject_id);
      if (!note) throw missing("随手记");
      return subjectContext({ subject: { kind: JELLY_NOTE_SUBJECT_KIND, id: note.id }, revision: String(note.revision), title: noteTitle(note), content: note.body, open: open(note.id) }, input);
    })),
  ];
}
export { noteTitle as jellyNoteTitle };

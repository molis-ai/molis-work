/**
 * English for the Chinese words Jelly's own server-side text is looked up by: the search result kinds (`search.ts`) and the
 * "new note" action title (`command-actions.ts`), which the Host translates by their Chinese text. The page itself (`ui.ts`,
 * `browser/`) speaks through `messages.ts`. Words that only other owners look up live in those owners' dictionaries.
 */
export const JELLY_EN: Readonly<Record<string, string>> = {
  "笔记": "Notes",
  "日程": "Event",
  "新建笔记": "New note",
};

/**
 * English for the Chinese words Jelly's own server-side text is looked up by: the search result kinds (`search.ts`) and the
 * "new note" action title (`command-actions.ts`), which the Host translates by their Chinese text. The page itself (`ui.ts`,
 * `browser/`) speaks through `messages.ts`. Words that only other owners look up live in those owners' dictionaries.
 */
export const JELLY_EN: Readonly<Record<string, string>> = {
  "笔记": "Notes",
  "日程": "Event",
  "新建笔记": "New note",
  "日历": "Calendar",
  "日历事项与进展": "Calendar items and progress",
  "笔记全文、搜索，以及整个 Jelly 工作区的读取与导出": "Full notes, search, and reading or exporting the whole Jelly workspace",
};

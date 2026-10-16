export const DEFAULT_SESSION_TITLE = "新编码会话";
/** First meaningful line of a task, without Markdown decoration, short enough for a list row. */
export function codingSessionTitleFrom(task: string): string {
  const line = task.split("\n").map(value => value.replace(/^[#>*\-\s`]+/, "").replace(/[`*_]/g, "").trim()).find(Boolean) ?? DEFAULT_SESSION_TITLE;
  const chars = Array.from(line);
  return chars.length <= 36 ? line : `${chars.slice(0, 35).join("")}…`;
}

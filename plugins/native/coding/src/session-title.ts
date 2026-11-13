import { cutWithEllipsis } from "@molis-ai/molis-work-plugin-sdk/whole-units";
export const DEFAULT_SESSION_TITLE = "新编码会话";
/** First meaningful line of a task, without Markdown decoration, short enough for a list row. */
export function codingSessionTitleFrom(task: string): string {
  const line = task.split("\n").map(value => value.replace(/^[#>*\-\s`]+/, "").replace(/[`*_]/g, "").trim()).find(Boolean) ?? DEFAULT_SESSION_TITLE;
  return cutWithEllipsis(line, 36, { unit: "characters" });
}

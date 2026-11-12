import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";

export const DEFAULT_SESSION_TITLE = "新编码会话";
/** First meaningful line of a task, without Markdown decoration, short enough for a list row. */
export function codingSessionTitleFrom(task: string): string {
  const line = task.split("\n").map(value => value.replace(/^[#>*\-\s`]+/, "").replace(/[`*_]/g, "").trim()).find(Boolean) ?? DEFAULT_SESSION_TITLE;
  const chars = Array.from(line);
  return chars.length <= 36 ? line : `${chars.slice(0, 35).join("")}…`;
}

/** A session title for a reader: the stored untitled marker becomes a word of the read's language; storage keeps the marker. */
export const sessionTitleFor = (title: string): string => title === DEFAULT_SESSION_TITLE ? uiText.text("coding.session.new-title") : title || uiText.text("coding.session.untitled");

import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { cutWithEllipsis } from "@molis-ai/molis-work-plugin-sdk/whole-units";

export const DEFAULT_SESSION_TITLE = "新编码会话";
/** First meaningful line of a task, without Markdown decoration, short enough for a list row. */
export function codingSessionTitleFrom(task: string): string {
  const line = task.split("\n").map(value => value.replace(/^[#>*\-\s`]+/, "").replace(/[`*_]/g, "").trim()).find(Boolean) ?? DEFAULT_SESSION_TITLE;
  return cutWithEllipsis(line, 36, { unit: "characters" });
}

/** A session title for a reader: the stored untitled marker becomes a word of the read's language; storage keeps the marker. */
export const sessionTitleFor = (title: string): string => title === DEFAULT_SESSION_TITLE ? uiText.text("coding.session.new-title") : title || uiText.text("coding.session.untitled");

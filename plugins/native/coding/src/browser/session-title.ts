import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { DEFAULT_SESSION_TITLE } from "../session-title.js";

/**
 * A session title as a person reads it. A session that has not been named yet keeps the server's own untitled marker in
 * the stored record (`DEFAULT_SESSION_TITLE`, `../session-title.js`); only the words drawn for it come from the language
 * files, so switching languages never rewrites what is stored. Everything that shows a title to a person, gives it to the
 * shell or puts it in the Assistant's context goes through here; comparing, saving and the rename field keep the raw value.
 */
export function sessionTitle(title: string | null | undefined): string {
  return title === DEFAULT_SESSION_TITLE ? uiText.text("coding.session.new-title") : title ?? "";
}

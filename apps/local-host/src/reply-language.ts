import { readFileSync } from "node:fs";
import { WORKBENCH_LANGUAGES } from "@molis-ai/molis-work-app-workbench";
import type { AgentPromptText } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { activeLocale, DEFAULT_WEB_LOCALE, type WebLocale } from "./web-locale.js";
import { lastUsedLocale } from "./ui-locale-memory.js";

// This fixed rule is itself the authority for the language, so it cannot fall back to a different language's body.
const REPLY_WORDS = new Map(WORKBENCH_LANGUAGES.languages.map(({ tag }) => {
  const file = new URL("../prompts/reply-language/" + tag + ".md", import.meta.url);
  const body = readFileSync(file, "utf8").trimEnd();
  if (!body.trim()) throw new Error(file.pathname + ": empty reply language instruction");
  return [tag, body];
}));

/** What a round is told about the language to reply in (`AgentStartAuthority.reply_language`). */
export function replyLanguagePrompt(locale: WebLocale): AgentPromptText {
  return { prompt_id: "reply-language", version: /* @version prompt.reply-language */ 1, body: REPLY_WORDS.get(locale) ?? REPLY_WORDS.get(DEFAULT_WEB_LOCALE)! };
}

/** The current call's language, or this Home's most recent language when a round did not come from a page. */
export function modelRoundLocale(home: string | undefined): WebLocale {
  return activeLocale() ?? (home ? lastUsedLocale(home) : DEFAULT_WEB_LOCALE);
}

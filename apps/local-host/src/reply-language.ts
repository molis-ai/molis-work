import type { AgentPromptText } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { WebLocale } from "./web-locale.js";

/** Fixed words for each language: a locale value is never written into a prompt. A new language fails to compile here until it has its own. */
const REPLY_LANGUAGE: Readonly<Record<WebLocale, string>> = {
  zh: "本轮回复语言：简体中文。给用户的回复都用简体中文，即使用户用别的语言打字，或你拿到的材料和方法是别的语言。用户在这一轮明说要别的语言时听用户的。用户自己的内容和已有对话不要翻译，除非用户要求。",
  en: "Reply language for this round: English. Write every reply to the person in English, even when they type in another language or the materials and methods you were given are in another language. If the person explicitly asks for another language in this round, use that one. Do not translate the person's own content or earlier conversation unless they ask.",
};

/** What a round is told about the language to reply in. */
export function replyLanguagePrompt(locale: WebLocale): AgentPromptText {
  return { prompt_id: "reply-language", version: /* @version prompt.reply-language */ 1, body: REPLY_LANGUAGE[locale] };
}

/** A round's reply language as the Agent Host takes it (`AgentStartAuthority.reply_language`): the language, for its record, and the words. */
export function replyLanguage(locale: WebLocale): { locale: WebLocale; prompt: AgentPromptText } {
  return { locale, prompt: replyLanguagePrompt(locale) };
}

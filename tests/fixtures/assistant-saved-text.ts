import { installHostUiText, runWithLocale, type WebLocale } from "@molis-ai/molis-work-app-local-host";
import { renderAssistantNoticeText, renderAssistantSavedText } from "@molis-ai/molis-work-app-workbench";
import type { AssistantNotice, AssistantSavedText } from "@molis-ai/molis-work-contracts/services/assistant";
import { say } from "@molis-ai/molis-work-plugin-sdk/ui";

export function inAssistantPage<T>(locale: WebLocale, run: () => T): T {
  installHostUiText();
  return runWithLocale(locale, run);
}

export function noticeText(notice: AssistantNotice, locale: WebLocale = "zh"): string {
  return inAssistantPage(locale, () => renderAssistantNoticeText(notice, say.text, renderAssistantSavedText));
}

export function savedText(text: AssistantSavedText | undefined, locale: WebLocale = "zh"): string | undefined {
  if (text === undefined) return undefined;
  return inAssistantPage(locale, () => renderAssistantSavedText(text, say.text));
}

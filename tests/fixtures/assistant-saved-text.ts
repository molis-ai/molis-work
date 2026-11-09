import { installHostUiText, runWithLocale, type WebLocale } from "@molis-ai/molis-work-app-local-host";
import { renderAssistantNoticeText, renderAssistantSavedText } from "@molis-ai/molis-work-app-workbench";
import type { AssistantNotice, AssistantSavedText } from "@molis-ai/molis-work-contracts/services/assistant";
import { say } from "@molis-ai/molis-work-plugin-sdk/ui";

export function noticeText(notice: AssistantNotice, locale: WebLocale = "zh"): string {
  installHostUiText();
  return runWithLocale(locale, () => renderAssistantNoticeText(notice, say.text));
}

export function savedText(text: AssistantSavedText | undefined, locale: WebLocale = "zh"): string | undefined {
  if (text === undefined) return undefined;
  installHostUiText();
  return runWithLocale(locale, () => renderAssistantSavedText(text, say.text));
}

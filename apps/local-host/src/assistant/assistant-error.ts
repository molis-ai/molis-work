import { say, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { TextArg } from "@molis-ai/molis-work-contracts/platform/ui";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorKind } from "@molis-ai/molis-work-plugin-sdk";
import { assistantErrors } from "./assistant-errors.js";
import { baseLanguageOf, localizeActionErrorResponse } from "../ui-error-words.js";
import { hasHostUiText } from "../ui-text-provider.js";
import { activeLocale, DEFAULT_WEB_LOCALE, pageLocale, webLanguage } from "../web-locale.js";

const ASSISTANT_ERROR_FALLBACKS = {
  "workbench.assistant-error.open-model-settings": {
    zh: "打开模型设置",
    en: "Open model settings",
    ja: "モデル設定を開く",
  },
  "workbench.assistant-error.close-other-service": {
    zh: "关闭另一个正在运行的 Molis 服务后重试",
    en: "Close the other running Molis service and try again",
    ja: "別の Molis サービスを閉じてから再試行",
  },
  "workbench.assistant-error.session-busy": {
    zh: "这项工作正在进行中，等这一轮结束后再发新消息。",
    en: "This work is still running. Wait for the current turn to finish before sending a new message.",
    ja: "このワークは実行中です。今のターンが終わってから新しいメッセージを送ってください。",
  },
  "workbench.assistant-error.daily-budget-reached": {
    zh: "今天助理已用 {used} 额度，达到你设的每日上限 {limit}；这一轮没有开始，已做的都保留着。可以明天继续，或在设置里调高上限。",
    en: "Today’s assistant usage reached {used} of your {limit} daily limit. This turn didn’t start and your work is safe. Continue tomorrow or raise the limit in Settings.",
    ja: "本日のアシスタント利用量が {used} に達し、1日の上限 {limit} を超えました。このターンは開始されておらず、これまでの作業は残っています。明日続行するか、設定で上限を引き上げてください。",
  },
  "workbench.assistant-error.open-settings": {
    zh: "打开设置",
    en: "Open settings",
    ja: "設定を開く",
  },
  "workbench.assistant-error.work-budget-reached": {
    zh: "这项工作已用 {used} tokens，达到给它设的上限 {limit}；这一轮没有开始，已做的都保留着。调高这项工作的上限后就可以继续。",
    en: "This work has used {used} of its {limit} token limit. This turn didn’t start and your work is safe. Raise this work’s limit to continue.",
    ja: "このワークは {used} トークンを使用しており、上限の {limit} に達しました。このターンは開始されておらず、これまでの作業は残っています。上限を引き上げると続行できます。",
  },
  "workbench.assistant-error.parent-work-budget-reached": {
    zh: "委托这项子任务的工作「{title}」连同它的子任务已用 {used} tokens，达到给它设的上限 {limit}；这一轮没有开始，已做的都保留着。调高那项工作的上限后就可以继续。",
    en: "The parent work “{title}” and its delegated tasks have used {used} of their {limit} token limit. This turn didn’t start and your work is safe. Raise that work’s limit to continue.",
    ja: "このサブタスクを依頼したワーク「{title}」（サブタスクを含む）が {used} トークンを使用しており、上限の {limit} に達しました。このターンは開始されておらず、これまでの作業は残っています。元のワークの上限を引き上げると続行できます。",
  },
  "workbench.assistant-error.raise-work-budget": {
    zh: "调高这项工作的上限",
    en: "Raise this work’s limit",
    ja: "このワークの上限を引き上げる",
  },
  "workbench.assistant-error.work-budget-min": {
    zh: "这项工作的上限至少 1000 tokens，或留空表示不单独设限。",
    en: "Set a limit of at least 1,000 tokens, or leave it blank for no separate limit.",
    ja: "このワークの上限は 1,000 トークン以上にするか、空欄にして個別の上限なしにしてください。",
  },
  "workbench.assistant-error.work-budget-delegated": {
    zh: "子任务按委托它的工作「{title}」的上限计算，请到那项工作里调整。",
    en: "Delegated tasks share the limit of “{title}”. Update the limit in that work instead.",
    ja: "サブタスクは依頼元ワーク「{title}」の上限を共有しています。そちらのワークで設定してください。",
  },
  "workbench.assistant-error.work-budget-plugin": {
    zh: "这项工作由对应插件负责执行，用量在插件自己的会话里管理。",
    en: "This work is run by its plugin, so usage is managed in that plugin’s session.",
    ja: "このワークはプラグイン側で実行されているため、利用量はプラグインのセッション内で管理されます。",
  },
} as const;

export type AssistantErrorWordKey = keyof typeof ASSISTANT_ERROR_FALLBACKS;

function formatFallbackArgs(template: string, args: readonly TextArg[] | undefined, locale: string): string {
  if (!args?.length) return template;
  const intl = webLanguage(locale)?.intl ?? locale;
  const byName = new Map(args.map(arg => {
    if (arg.kind === "number") {
      const options: Intl.NumberFormatOptions = arg.style === "compact" ? { notation: "compact" } : { style: arg.style ?? "decimal" };
      return [arg.name, new Intl.NumberFormat(intl, options).format(arg.number)] as const;
    }
    return [arg.name, arg.kind === "text" ? arg.text : arg.at] as const;
  }));
  return template.replace(/\{([A-Za-z0-9_]+)\}/gu, (whole, name: string) => byName.get(name) ?? whole);
}

/** Read a localized assistant error/action label from the workbench locale pack, safely outside or inside a request. */
export function readAssistantErrorWord(key: AssistantErrorWordKey, args?: readonly TextArg[]): string {
  const locale = activeLocale() ?? pageLocale() ?? DEFAULT_WEB_LOCALE;
  const fallback = ASSISTANT_ERROR_FALLBACKS[key][baseLanguageOf(locale)];
  if (hasHostUiText()) {
    return say.text({ owner: "workbench", key, ...(args?.length ? { args } : {}), fallback }, { locale });
  }
  return formatFallbackArgs(fallback, args, locale);
}

/**
 * Existing Assistant presentation failures; foreign owner codes and diagnostic details remain intact. The Host's own reasons
 * are said in the page's language (QA-001); structured `action_kind` picks the page control while `action` stays for compatibility.
 */
export function assistantFailure(error: unknown): ActionError {
    const code = (error as { code?: string })?.code ?? "";
    if (code === "agent.model_not_configured") {
      return assistantErrors.model_missing(
        uiText.text("workbench.assistant-error.no-usable-model-configured-yet-so-assistant-can"),
        { action: readAssistantErrorWord("workbench.assistant-error.open-model-settings"), action_kind: "open_model_settings" },
      );
    }
    if (code === "agent.session_busy") return assistantErrors.busy(readAssistantErrorWord("workbench.assistant-error.session-busy"));
    if (code === "agent.storage_busy") {
      return assistantErrors.runtime_busy(
        uiText.text("workbench.assistant-error.agent-service-use-another-process-try-again-shortly"),
        { action: readAssistantErrorWord("workbench.assistant-error.close-other-service") },
      );
    }
    const failure = localizeActionErrorResponse(error).body;
    return new ActionError(failure.code, failure.error, { kind: actionErrorKind(error), details: failure.details, cause: error });
}

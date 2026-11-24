import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { TextArg } from "@molis-ai/molis-work-contracts/platform/ui";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorKind } from "@molis-ai/molis-work-plugin-sdk";
import { assistantErrors } from "./assistant-errors.js";
import { localizeActionErrorResponse, readWorkbenchText } from "../ui-error-words.js";

export const ASSISTANT_ERROR_WORD_KEYS = [
  "workbench.assistant-error.open-model-settings",
  "workbench.assistant-error.close-other-service",
  "workbench.assistant-error.session-busy",
  "workbench.assistant-error.daily-budget-reached",
  "workbench.assistant-error.open-settings",
  "workbench.assistant-error.work-budget-reached",
  "workbench.assistant-error.parent-work-budget-reached",
  "workbench.assistant-error.raise-work-budget",
  "workbench.assistant-error.work-budget-min",
  "workbench.assistant-error.work-budget-delegated",
  "workbench.assistant-error.work-budget-plugin",
] as const;

export type AssistantErrorWordKey = (typeof ASSISTANT_ERROR_WORD_KEYS)[number];

/** Read a localized assistant error/action label from the single-source workbench locale pack, safely outside or inside a request. */
export function readAssistantErrorWord(key: AssistantErrorWordKey, args?: readonly TextArg[]): string {
  return readWorkbenchText(key, undefined, args);
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

import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorBody, actionErrorKind } from "@molis-ai/molis-work-plugin-sdk";
import { assistantErrors } from "./assistant-errors.js";

/**
 * Existing Assistant presentation failures; foreign owner codes and diagnostic details remain intact. The Host's own reasons
 * are said in the page's language (QA-001); `action` stays the key the page picks its control by and translates.
 */
export function assistantFailure(error: unknown): ActionError {
    const code = (error as { code?: string })?.code ?? "";
    const message = error instanceof Error ? error.message : String(error);
    if (code === "agent.model_not_configured") return assistantErrors.model_missing(uiText.text("workbench.assistant-error.no-usable-model-configured-yet-so-assistant-can"), { action: "打开模型设置" });
    if (code === "agent.session_busy") return assistantErrors.busy(message);
    if (code === "agent.storage_busy") return assistantErrors.runtime_busy(uiText.text("workbench.assistant-error.agent-service-use-another-process-try-again-shortly"), { action: "关闭另一个正在运行的 Molis 服务后重试" });
    const failure = actionErrorBody(error);
    return new ActionError(failure.code, failure.error, { kind: actionErrorKind(error), details: failure.details, cause: error });
}

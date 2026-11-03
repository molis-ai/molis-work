import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorBody, actionErrorKind } from "@molis-ai/molis-work-plugin-sdk";
import { assistantErrors } from "./assistant-errors.js";
import { L } from "../web-locale.js";

/**
 * Existing Assistant presentation failures; foreign owner codes and diagnostic details remain intact. The Host's own reasons
 * are said in the page's language (QA-001); `action` stays the key the page picks its control by and translates.
 */
export function assistantFailure(error: unknown): ActionError {
    const code = (error as { code?: string })?.code ?? "";
    const message = error instanceof Error ? error.message : String(error);
    if (code === "agent.model_not_configured") return assistantErrors.model_missing(L("还没有配置可用的模型，助理无法开始工作"), { action: "打开模型设置" });
    if (code === "agent.session_busy") return assistantErrors.busy(message);
    if (code === "agent.storage_busy") return assistantErrors.runtime_busy(L("Agent 执行服务正由另一个进程使用，稍后再试"), { action: "关闭另一个正在运行的 Molis 服务后重试" });
    const failure = actionErrorBody(error);
    return new ActionError(failure.code, failure.error, { kind: actionErrorKind(error), details: failure.details, cause: error });
}

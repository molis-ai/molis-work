import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorBody, actionErrorKind } from "@molis-ai/molis-work-plugin-sdk";
import { assistantErrors } from "./assistant-errors.js";
import { CodingUnavailable } from "./assistant-coding.js";

/** Existing Assistant presentation failures; foreign owner codes and diagnostic details remain intact. */
export function assistantFailure(error: unknown): ActionError {
    if (error instanceof CodingUnavailable) return assistantErrors.coding_unavailable(error.message, error.action ? { action: error.action } : undefined);
    const code = (error as { code?: string })?.code ?? "";
    const message = error instanceof Error ? error.message : String(error);
    if (code === "agent.model_not_configured" || /没有配置可用的模型/.test(message)) return assistantErrors.model_missing("还没有配置可用的模型，助理无法开始工作", { action: "打开模型设置" });
    if (code === "agent.session_busy") return assistantErrors.busy(message);
    if (code === "agent.storage_busy") return assistantErrors.runtime_busy("Agent 执行服务正由另一个进程使用，稍后再试", { action: "关闭另一个正在运行的 Molis 服务后重试" });
    const failure = actionErrorBody(error);
    return new ActionError(failure.code, failure.error, { kind: actionErrorKind(error), details: failure.details, cause: error });
}

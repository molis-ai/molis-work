import { AssistantStoreError } from "./assistant-store.js";
import { CodingUnavailable } from "./assistant-coding.js";


export function assistantFailure(error: unknown): { code: string; message: string; action?: string } {
    if (error instanceof AssistantStoreError) return { code: error.code, message: error.message };
    if (error instanceof CodingUnavailable) return { code: "assistant.coding_unavailable", message: error.message, action: error.action };
    const code = (error as { code?: string })?.code ?? "";
    const message = error instanceof Error ? error.message : String(error);
    if (code === "agent.model_not_configured" || /没有配置可用的模型/.test(message)) return { code: "assistant.model_missing", message: "还没有配置可用的模型，助理无法开始工作", action: "打开模型设置" };
    if (code === "agent.session_busy") return { code: "assistant.busy", message };
    if (code === "agent.storage_busy") return { code: "assistant.runtime_busy", message: "Agent 执行服务正由另一个进程使用，稍后再试", action: "关闭另一个正在运行的 Molis 服务后重试" };
    return { code: code || "assistant.failed", message: message || "这次没有完成" };
  }

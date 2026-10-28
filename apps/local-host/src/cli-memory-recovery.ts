import type { MemoryHomeRecoveryRequest, MemoryHomeRecoveryResult } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryHomeRecoveryInput } from "./memory/memory-home-recovery.js";

/** The terminal owns cancellation; the injected real recovery owner owns every resource and all persisted decisions. */
export async function runCliMemoryRecovery(input: MemoryHomeRecoveryRequest,
  recover: (input: MemoryHomeRecoveryInput) => Promise<MemoryHomeRecoveryResult>): Promise<MemoryHomeRecoveryResult> {
  const cancellation = new AbortController();
  const stop = () => cancellation.abort(new DOMException("停写恢复已取消", "AbortError"));
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  try {
    return await recover({ ...input, signal: cancellation.signal, assertCurrent: () => cancellation.signal.throwIfAborted() });
  } catch (error) {
    // Only this known owner supplies the actual failed initialization's explicit cleanup capability.
    const close = error instanceof Error ? Object.getOwnPropertyDescriptor(error, "close")?.value : undefined;
    if (typeof close === "function") {
      try { await close.call(error); }
      catch (closing) {
        throw new AggregateError([error, closing], `${error instanceof Error ? error.message : "恢复未完成"}；原资源关闭也失败：${closing instanceof Error ? closing.message : "未知关闭错误"}；请保留操作号 ${input.operation_id} 核对`, { cause: error });
      }
    }
    throw error;
  } finally {
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
  }
}

import type { AgentMemoryUseReceipt } from "@molis-ai/molis-work-contracts/services/agent-host";
import { MEMORY_CONSUMERS, type MemoryUseRecord } from "@molis-ai/molis-work-contracts/services/memory";

/** A recent-reference summary. The Run remains the owner of every individual model call. */
export function memoryUses(receipt: AgentMemoryUseReceipt): MemoryUseRecord[] {
  const consumer = MEMORY_CONSUMERS.find(value => value === receipt.consumer);
  if (!consumer) throw new Error("记忆回执的使用方无效");
  const uses: MemoryUseRecord[] = [];
  for (const context of receipt.contexts) {
    if (context.status === "prepared") continue;
    for (const reference of context.references) uses.push({
      memory_id: reference.memory_id, memory_version: reference.version, receipt_id: reference.receipt_id,
      at: receipt.started_at, time_basis: "run-start", consumer,
      title: (receipt.usage?.title ?? "模型执行").slice(0, 160), work_id: receipt.usage?.work_id ?? null,
      source: "run-context", run: receipt.run, evidence_call_id: context.call_id, state: context.status,
    });
  }
  return uses;
}

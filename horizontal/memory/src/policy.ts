import type { MemoryBasis, MemoryEvidenceInput, MemoryKind } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryErrors } from "./errors.js";

/** New automatic changes record this rule; an existing entry keeps the version that approved it. */
export const MEMORY_GATE_POLICY = "memory.write-gate";
export const MEMORY_GATE_VERSION = 3;
export const MEMORY_GATE_RULE = `自动记住 · 规则 v${MEMORY_GATE_VERSION}`;

/** Read-side unknown facts cannot enter formation as asserted evidence. */
export function assertFormationFacts(basis: MemoryBasis, evidence: readonly MemoryEvidenceInput[] = []): void {
  if (!["explicit", "repeated", "inferred"].includes(basis) || evidence.some(item => !item
    || !["said", "object", "work", "signal"].includes(item.kind) || typeof item.at !== "string" || !Number.isFinite(Date.parse(item.at))
    || item.ref !== undefined && (!item.ref || typeof item.ref !== "object" || typeof item.ref.kind !== "string" || typeof item.ref.id !== "string")))
    throw memoryErrors.invalid("新记忆依据与证据需要明确类别和发生时间，不能使用未知旧事实");
}

/** Product approval only. Source verification, permissions and candidate persistence stay with the Service. */
export function automaticMemoryHold(kind: MemoryKind, basis: MemoryBasis | null, enabled: boolean): string | null {
  if (basis !== "repeated") return "只是从工作里推断出来的，需要你认可才会生效";
  if (kind !== "preference" && kind !== "convention") return kind === "fact"
    ? "背景事实以原资料为准，自动记住容易过时，先请你看一下"
    : "经验是否适用于以后需要你判断，先请你认可";
  if (!enabled) return "你关掉了“自动记住”，所以先请你认可";
  return null;
}

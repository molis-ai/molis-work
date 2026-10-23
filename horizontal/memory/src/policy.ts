import type { MemoryBasis, MemoryKind } from "@molis-ai/molis-work-contracts/services/memory";

/** New automatic changes record this rule; an existing entry keeps the version that approved it. */
export const MEMORY_GATE_POLICY = "memory.write-gate";
export const MEMORY_GATE_VERSION = 2;
export const MEMORY_GATE_RULE = `自动记住 · 规则 v${MEMORY_GATE_VERSION}`;

/** Product approval only. Source verification, permissions and candidate persistence stay with the Service. */
export function automaticMemoryHold(kind: MemoryKind, basis: MemoryBasis, enabled: boolean): string | null {
  if (basis !== "repeated") return "只是从工作里推断出来的，需要你认可才会生效";
  if (kind !== "preference" && kind !== "convention") return kind === "fact"
    ? "背景事实以原资料为准，自动记住容易过时，先请你看一下"
    : "经验是否适用于以后需要你判断，先请你认可";
  if (!enabled) return "你关掉了“自动记住”，所以先请你认可";
  return null;
}

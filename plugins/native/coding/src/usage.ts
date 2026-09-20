import type { AgentRunUsage } from "@molis-ai/molis-work-contracts/services/agent-host";

/** Shared by the browser, report and HTML projection. No store or inferred billing. */
export function codingUsageSummary(usage: AgentRunUsage): string {
  const fields = [
    ["input", "输入", usage.tokens.input], ["output", "输出", usage.tokens.output],
    ["cached_input", "缓存读取", usage.tokens.cached_input], ["cache_creation", "缓存写入", usage.tokens.cache_creation],
    ["cost_usd", "费用", usage.cost_usd],
  ] as const;
  const rows = fields.map(([key, label, value]) => {
    // Legacy runtimes with a warning do not distinguish placeholders from known values.
    const coverage = usage.coverage?.[key] ?? (usage.unavailable_reason || value === undefined ? "unknown" : "reported");
    if (coverage === "unknown" || value === undefined || !Number.isFinite(value) || value < 0) return `${label}未知`;
    const qualifier = coverage === "partial-estimated" ? "（已知小计，含估算）" : coverage === "partial" ? "（已知小计）"
      : coverage === "estimated" ? "（估算）" : usage.unavailable_reason ? "（已记录）" : "";
    return `${label} ${key === "cost_usd" ? `$${value.toFixed(4)}` : value}${qualifier}`;
  });
  const compaction = usage.compaction ? `；已计入上下文整理 ${usage.compaction.recorded_calls} 次请求${usage.compaction.incomplete ? "，仍有整理过程缺少完整用量" : ""}` : "";
  return `${usage.unavailable_reason ? `用量不完整或含估算：${usage.unavailable_reason}；` : ""}${rows.join("；")}${compaction}`;
}

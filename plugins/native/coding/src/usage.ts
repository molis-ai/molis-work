import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { AgentRunUsage } from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * Shared by the browser, report and HTML projection. No store or inferred billing. Injected into the browser with
 * `toString()`, so it is self-contained; `readText` is the page's translator, or `codingText` where the words stay Chinese data.
 */
export function codingUsageSummary(usage: AgentRunUsage, _readText: (text: string, values?: Record<string, string | number>) => string): string {
  const fields = [
    ["input", usage.tokens.input], ["output", usage.tokens.output],
    ["cached_input", usage.tokens.cached_input], ["cache_creation", usage.tokens.cache_creation],
    ["cost_usd", usage.cost_usd],
  ] as const;
  const rows = fields.map(([key, value]) => {
    const label = (`coding.usage-line.${key}`);
    // A runtime that reports no per-field provenance and gives a warning does not tell placeholders from known values.
    const coverage = usage.coverage?.[key] ?? (usage.unavailable_reason || value === undefined ? "unknown" : "reported");
    if (coverage === "unknown" || value === undefined || !Number.isFinite(value) || value < 0) return uiText.text("coding.usage-line.unknown", { label });
    const qualifier = coverage === "partial-estimated" ? uiText.text("coding.usage-line.partial-estimated") : coverage === "partial" ? uiText.text("coding.usage-line.partial")
      : coverage === "estimated" ? uiText.text("coding.usage-line.estimated") : usage.unavailable_reason ? uiText.text("coding.usage-line.recorded") : "";
    return `${label} ${key === "cost_usd" ? `$${value.toFixed(4)}` : value}${qualifier}`;
  });
  const joiner = uiText.text("coding.list.semicolon");
  const compaction = usage.compaction
    ? `${joiner}${uiText.text("coding.usage-line.compaction", { count: usage.compaction.recorded_calls })}${usage.compaction.incomplete ? uiText.text("coding.usage-line.compaction-incomplete") : ""}` : "";
  return `${usage.unavailable_reason ? uiText.text("coding.usage-line.incomplete", { reason: usage.unavailable_reason }) + joiner : ""}${rows.join(joiner)}${compaction}`;
}

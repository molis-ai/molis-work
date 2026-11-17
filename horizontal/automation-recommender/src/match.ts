import { createHash } from "node:crypto";
import { AUTOMATION_CATEGORIES, type AutomationEvidence, type AutomationGap, type AutomationNext, type AutomationSignal,
  type AutomationCategory, type AutomationSuggestion } from "@molis-ai/molis-work-contracts/services/automation-recommender";

export interface AutomationCandidate {
  readonly category: AutomationCategory;
  readonly key: string;
  readonly title: string;
  readonly match: readonly AutomationSignal[];
  readonly existing?: boolean;
  readonly names?: readonly string[];
  readonly reason: string;
  readonly effect: string;
  readonly requirements: readonly string[];
  readonly risk: string;
  readonly next: AutomationNext;
}

export function matchProjectAutomation(evidence: readonly AutomationEvidence[], candidates: readonly AutomationCandidate[], gaps: AutomationGap[], existing: ReadonlySet<string>) {
  const byCategory = new Map<AutomationCategory, AutomationSuggestion[]>();
  for (const candidate of candidates) {
    if (candidate.existing || (candidate.names ?? [candidate.key]).some(name => existing.has(name.toLowerCase()))
      || gaps.some(gap => gap.category === candidate.category && gap.code === "directory-unavailable")) continue;
    const matches = evidence.filter(entry => entry.signals.some(signal => candidate.match.includes(signal)));
    if (!matches.length) continue;
    const id = createHash("sha256").update(JSON.stringify([candidate.category, candidate.key, candidate.match])).digest("hex");
    const group = byCategory.get(candidate.category) ?? [];
    if (group.some(item => item.id === id)) continue;
    const { category, title, reason, effect, requirements, risk, next } = candidate;
    group.push({ id, category, title, reason, effect, requirements, risk, next, evidence: matches.slice(0, 4),
      confidence: matches.length >= 2 ? "high" : "medium" });
    byCategory.set(category, group);
  }
  return AUTOMATION_CATEGORIES.map(category => ({ category, suggestions: (byCategory.get(category) ?? [])
    .sort((a, b) => b.evidence.length - a.evidence.length || a.title.localeCompare(b.title)).slice(0, 2) }));
}

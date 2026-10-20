import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { KnowledgeCardRecord } from "@molis-ai/molis-work-contracts/services/knowledge";

/** How many each loose ranking offers before the two are put together. */
export const RELATED_POOL = 200;
/** Reciprocal-rank fusion's constant: a piece high in either ranking comes before one middling in both. */
const FUSION_K = 60;
const keyOf = (subject: ActionSubject) => `${subject.kind}\u0000${subject.id}`;

/**
 * The cards among `shown` that hold some of the words of a question, best first (specs/project-knowledge §6.4): the indexed
 * text's ranking and the cards' own ranking put together by rank, so a piece found by either comes up. Only `shown` ever comes
 * back, so the caller's visibility rule has already been applied.
 */
export function relatedCards(shown: readonly KnowledgeCardRecord[], rankings: ReadonlyArray<readonly ActionSubject[]>): KnowledgeCardRecord[] {
  const cards = new Map(shown.map(card => [keyOf(card.subject), card]));
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    const seen = new Set<string>();
    for (const subject of ranking) {
      const key = keyOf(subject);
      if (seen.has(key) || !cards.has(key)) continue;
      seen.add(key);
      scores.set(key, (scores.get(key) ?? 0) + 1 / (FUSION_K + seen.size));
    }
  }
  return [...scores].sort((a, b) => b[1] - a[1]).map(([key]) => cards.get(key)!);
}

/** `shown` with the related ones first, the rest newest first: a catalog ordered for one question. */
export function relatedFirst(shown: readonly KnowledgeCardRecord[], related: readonly KnowledgeCardRecord[]): KnowledgeCardRecord[] {
  const first = new Set(related.map(card => keyOf(card.subject)));
  return [...related, ...[...shown].filter(card => !first.has(keyOf(card.subject))).sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))];
}

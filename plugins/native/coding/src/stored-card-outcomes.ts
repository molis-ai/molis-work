import { TEXT_REF_LIMITS } from "@molis-ai/molis-work-contracts/platform/ui";
import { cutWithEllipsis } from "@molis-ai/molis-work-plugin-sdk/whole-units";

/**
 * One `cards:<session>` value as the project library's 4 → 5 step leaves it (BL-action-card-outcome-text, user 2026-11-17): a card's outcome
 * was a sentence in the language of the day it was written, and is now a key with its values. A sentence already written cannot be taken back
 * to its key, so it stays the words it was, as a `literal`; an empty one was no outcome and goes. Null when nothing in the value changes.
 */
export function storedCardOutcomesAsText(_key: string, stored: string): string | null {
  const value = JSON.parse(stored) as { cards?: unknown };
  if (!Array.isArray(value.cards) || !value.cards.some(card => typeof (card as { outcome?: unknown } | null)?.outcome === "string")) return null;
  const cards = value.cards.map(card => {
    const { outcome, ...rest } = card as { outcome?: unknown };
    if (typeof outcome !== "string") return card;
    return outcome ? { ...rest, outcome: { literal: cutWithEllipsis(outcome, TEXT_REF_LIMITS.literal) } } : rest;
  });
  return JSON.stringify({ ...value, cards });
}

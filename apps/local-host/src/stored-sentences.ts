import type { OwnedTextRef } from "@molis-ai/molis-work-contracts/platform/ui";
import { TEXT_REF_LIMITS } from "@molis-ai/molis-work-contracts/platform/ui";
import { cutWithEllipsis } from "@molis-ai/molis-work-plugin-sdk/whole-units";

/**
 * A sentence an older version stored as display text, in an upgrade step that now keeps keys with their values (AGENTS.md「界面文字」;
 * user 2026-11-17): it cannot be taken back to its key, so it stays the words it was, as a `literal`, cut to what a reference holds.
 * An empty one is no sentence at all.
 */
export function storedSentenceAsText(sentence: string): OwnedTextRef | null {
  return sentence ? { literal: cutWithEllipsis(sentence, TEXT_REF_LIMITS.literal) } : null;
}

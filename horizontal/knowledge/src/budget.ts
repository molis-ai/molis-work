import { KNOWLEDGE_ROUND_READ_CHARS } from "@molis-ai/molis-work-contracts/services/knowledge";

const KEEP_MS = 2 * 60 * 60_000;
const KEEP_ROUNDS = 2_000;

/**
 * How much original text each round has had (spec §7, PMAT-11), by the Host's number for the round (`call_id`). It decides
 * nothing about who may read: it only stops a round from reading more than its fill, and says how much is left. Rounds are
 * forgotten two hours after they last read, or oldest first past 2000 at once.
 */
export class RoundBudget {
  private readonly used = new Map<string, { chars: number; at: number }>();

  constructor(private readonly limit = KNOWLEDGE_ROUND_READ_CHARS, private readonly now: () => number = Date.now) {}

  /** What a round may still get; null for a call that is not part of a round. */
  left(round: string | undefined): number | null {
    if (!round) return null;
    return Math.max(0, this.limit - (this.used.get(round)?.chars ?? 0));
  }

  spend(round: string | undefined, chars: number): void {
    if (!round || chars <= 0) return;
    const at = this.now();
    const entry = this.used.get(round);
    this.used.delete(round);
    this.used.set(round, { chars: (entry?.chars ?? 0) + chars, at });
    for (const [key, value] of this.used) {
      if (this.used.size <= KEEP_ROUNDS && at - value.at < KEEP_MS) break;
      this.used.delete(key);
    }
  }
}

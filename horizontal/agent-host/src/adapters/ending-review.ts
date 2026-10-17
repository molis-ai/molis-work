import { randomBytes } from "node:crypto";
import { collectRun, type ExactRef, type Runtime } from "@prologue/sdk";
import { fencedMaterials } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { ENDING_REVIEW, endingClaims, type EndingClaim, type RoundFacts } from "./announce-guard.js";

/**
 * What a writable round really did, from the Host's own records, and the one model call that checks the round's last
 * words against it (D1②, the person chose this on 2026-10-16). A round that changed something is not checked: what it
 * says it did may be so. A round that changed nothing is read once against its facts: saying it saved, kept, forgot,
 * made a button or will now do the next step, when the facts show none of it, is held once and continued (the
 * person's 2026-09-28 decision). No list of wordings decides it: the model reads the reply, the Host gives the facts.
 */

export interface EndingRound {
  readonly reply: string;
  readonly facts: RoundFacts;
  /** Whether the round could keep memories: given and on, switched off by the person, or handed down without the tool. */
  readonly memory?: "available" | "switched-off" | "not-given";
  readonly materials: readonly string[];
}

/** The model the round runs with, its key already exchanged for the runtime's, and the round's own pre-dispatch check. */
export interface ReviewModel {
  readonly protocol: string; readonly endpoint: string; readonly model: string; readonly credentialRef: ExactRef<"credential">;
  readonly dispatch: <T>(operation: () => Promise<T>) => Promise<T>;
}

/** The review's time: well inside the stop hook's own (a hook that does not answer holds the ending). */
export const REVIEW_TIMEOUT_MS = 30_000;

/**
 * The claims in the round's last words that its facts do not bear out. Anything that goes wrong (no answer in time, an
 * answer that is not the asked JSON, a refused dispatch) finds none: the ending is let through, never held on a guess.
 */
export async function reviewEnding(runtime: Runtime, model: ReviewModel, round: EndingRound, signal: AbortSignal): Promise<EndingClaim[]> {
  const boundary = randomBytes(12).toString("hex");
  const tools = round.facts.calls.map(call => `${call.tool}: ${call.ended}`);
  const earlier = round.facts.said.endsWith(round.reply) ? round.facts.said.slice(0, -round.reply.length) : round.facts.said;
  const data = { reply: round.reply.slice(-3000), ...(earlier.trim() ? { earlier: earlier.slice(-1500) } : {}),
    facts: { tools, ...(round.memory ? { memory: round.memory } : {}), ...(round.materials.length ? { materials: round.materials } : {}) } };
  try {
    const text = await model.dispatch(async () => {
      const session = await runtime.sessions.create({ ephemeral: true });
      try {
        const run = await session.startRun({ protocol: model.protocol, endpoint: model.endpoint, model: model.model, credentialRef: model.credentialRef,
          messages: [{ role: "system", text: ENDING_REVIEW.body }, { role: "user", text: fencedMaterials(data, boundary) }], timeoutMs: REVIEW_TIMEOUT_MS,
          params: { maxOutputTokens: 1024 } });
        const result = await collectRun(run, { signal, maxTextChars: 8000, maxEvents: 10_000 });
        return result.state === "completed" ? result.text : "";
      } finally { await session.archive(); }
    });
    return endingClaims(text);
  } catch { return []; /* not reviewed: let the ending through */ }
}

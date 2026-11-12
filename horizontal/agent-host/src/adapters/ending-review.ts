import { randomBytes } from "node:crypto";
import { collectRun, type ExactRef, type Runtime } from "@prologue/sdk";
import { fencedMaterials } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { endingClaims, type EndingClaim, type RoundFacts } from "./announce-guard.js";

/**
 * What a writable round really did, from the Host's own records, and the one model call that checks the round's last
 * words against it (D1②, the person chose this on 2026-10-16). A round that changed something is not checked: what it
 * says it did may be so. A round that changed nothing is read once against its facts: saying it saved, kept, forgot,
 * made a button or will now do the next step, when the facts show none of it, is held once and continued (the
 * person's 2026-09-28 decision). No list of wordings decides it: the model reads the reply, the Host gives the facts.
 * The instructions are the round owner's registered prompt, the person's version when they edited it; a round whose
 * owner registers none is not checked.
 */

export interface EndingRound {
  readonly reply: string;
  readonly facts: RoundFacts;
  /** Whether the round could keep memories: given and on, switched off by the person, or handed down without the tool. */
  readonly memory?: "available" | "switched-off" | "not-given";
  readonly materials: readonly string[];
  /** The person's own request this round: what they asked to have written is the reply's content, not a claim about the round. */
  readonly request?: string;
}

/**
 * Said beside the owner's instructions, whatever they were edited to: a draft the person asked for (weekly-report bullets reading
 * “已初步确定…”) is the content handed to them, and reading it as the Assistant saying it saved something held normal rounds (2026-11-13).
 */
const REQUESTED_CONTENT = "request 是用户这一轮的原话（宿主记的）。用户要助理起草、整理、列出或写出的内容，是交给用户的正文：正文里写着“已确定”“已完成”“已保存”之类，说的是正文里的事，不是助理说自己这一轮做成了什么，不要抄进 changed、kept、forgot 或 button。\n"
  + "request is the person's own words this round (recorded by the Host). Content they asked the assistant to draft, tidy, list or write is the text handed to them: wording inside it such as \"decided\", \"done\" or \"saved\" is about its subject, not the assistant saying it did something this round; never copy it into changed, kept, forgot or button.";

/**
 * The instructions the round's owner registered (the person's version), the model the round runs with, its key already
 * exchanged for the runtime's, and the round's own pre-dispatch check.
 */
export interface ReviewModel {
  readonly instructions: string;
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
  const data = { ...(round.request?.trim() ? { request: round.request.slice(-1500) } : {}), reply: round.reply.slice(-3000), ...(earlier.trim() ? { earlier: earlier.slice(-1500) } : {}),
    facts: { tools, ...(round.memory ? { memory: round.memory } : {}), ...(round.materials.length ? { materials: round.materials } : {}) } };
  try {
    const text = await model.dispatch(async () => {
      const session = await runtime.sessions.create({ ephemeral: true });
      try {
        const run = await session.startRun({ protocol: model.protocol, endpoint: model.endpoint, model: model.model, credentialRef: model.credentialRef,
          messages: [{ role: "system", text: `${model.instructions}\n\n${REQUESTED_CONTENT}` }, { role: "user", text: fencedMaterials(data, boundary) }], timeoutMs: REVIEW_TIMEOUT_MS,
          params: { maxOutputTokens: 1024 } });
        const result = await collectRun(run, { signal, maxTextChars: 8000, maxEvents: 10_000 });
        return result.state === "completed" ? result.text : "";
      } finally { await session.archive(); }
    });
    return endingClaims(text);
  } catch { return []; /* not reviewed: let the ending through */ }
}

import { isKnowledgeOrganize, organizedCardFor } from "./knowledge-organize.js";

/** The ending review's answer (D1②) for the claims a test wants it to find: the next step as the ending, a sentence per kind. */
export function reviewAnswer(claims: readonly string[]): string {
  const sentence = (kind: string) => claims.includes(kind) ? `（${kind} 的原句）` : "";
  return JSON.stringify({ last: claims.includes("will_do") ? "next_step" : "result", changed: sentence("changed"), kept: sentence("kept"), forgot: sentence("forgot"), button: sentence("button") });
}

/**
 * A stand-in for the ending review in tests that script a round's model: a review request is told apart by the review's
 * own instructions, and answered with the claims `judge` finds in what it was given (the ending and the facts).
 */
export function endingReviewAnswer(body: { system?: unknown; messages?: unknown }, judge: (given: string) => string[]): string | undefined {
  // Anthropic-shaped requests carry the instructions in `system`, OpenAI-shaped ones in a system message.
  const system = body.system ?? (Array.isArray(body.messages) ? body.messages.filter(message => (message as { role?: unknown } | null)?.role === "system") : "");
  if (!JSON.stringify(system).includes("在这一轮结束时对用户说的话")) return undefined;
  return reviewAnswer(judge(JSON.stringify(body.messages ?? [])));
}

/**
 * The same for a loopback model that reads the request body itself: the "nothing found" answer for a review request,
 * undefined for the round's own calls, so a scripted model answers a review without spending one of its turns.
 */
export function endingReviewReply(raw: string): string | undefined {
  if (!raw.startsWith("{")) return undefined;
  return endingReviewAnswer(JSON.parse(raw) as { system?: unknown; messages?: unknown }, () => []);
}

/**
 * For a loopback model that is the Home's configured model and scripts a round's turns in order: answers the Home's own model
 * work that is not the round's, so the script spends its turns only on the round's calls. That is the ending review ("nothing
 * found"), and project knowledge's card for each piece it organizes in the background a moment after something in the project
 * changed (specs/project-knowledge §5), told apart by its registered instruction (knowledge.organize). Undefined for the round's calls.
 */
export function asideReply(raw: string): string | undefined {
  return endingReviewReply(raw) ?? (isKnowledgeOrganize(raw) ? organizedCardFor(raw) : undefined);
}

/**
 * For tests that script a round's model and do not look at its ending review: wraps the test's fetch double so each
 * review request is answered "nothing found" with `answer`, and the script and the request counts see only the round's
 * own calls.
 */
export function answeringEndingReviews<U, I extends RequestInit | undefined>(answer: (text: string) => Response, scripted: (url: U, init: I) => Promise<Response>): (url: U, init: I) => Promise<Response> {
  return async (url, init) => {
    const review = endingReviewReply(typeof init?.body === "string" ? init.body : init?.body instanceof Uint8Array ? new TextDecoder().decode(init.body) : "");
    return review ? answer(review) : scripted(url, init);
  };
}

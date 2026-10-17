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
  if (!JSON.stringify(body.system ?? "").includes("AI 助理在这一轮结束时")) return undefined;
  return reviewAnswer(judge(JSON.stringify(body.messages ?? [])));
}

/**
 * Screenshots a test run takes land in the ignored QA folder, so ordinary runs never rewrite the curated
 * review set tracked in git. Refreshing that set is an explicit choice: MOLIS_WORK_REVIEW_EVIDENCE=1.
 */
export const REVIEW_EVIDENCE = process.env.MOLIS_WORK_REVIEW_EVIDENCE === "1" ? ".impeccable/review" : ".impeccable/qa/review";

/** The same location as a file URL, for tests that address it relative to the repository. */
export function reviewEvidenceUrl(relative = ""): URL {
  return new URL(`../../${REVIEW_EVIDENCE}/${relative}`, import.meta.url);
}

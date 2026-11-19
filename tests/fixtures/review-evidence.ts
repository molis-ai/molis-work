/**
 * Screenshots a test run takes land in the ignored QA folder, so ordinary runs never rewrite the curated
 * review set tracked in git. Refreshing that set is an explicit choice: MOLIS_WORK_REVIEW_EVIDENCE=1.
 */
export const REVIEW_EVIDENCE = process.env.MOLIS_WORK_REVIEW_EVIDENCE === "1" ? ".impeccable/review" : ".impeccable/qa/review";

/**
 * Routine review-screenshot PNG writes are opt-in so ordinary test runs and CI do not spend CDP + disk time encoding
 * unread images. Failure diagnostics and pixel-assertion tests capture screenshots unconditionally.
 */
export function shouldSaveReviewScreenshots(): boolean {
  return process.env.MOLIS_WORK_SAVE_SCREENSHOTS === "1" || process.env.MOLIS_WORK_REVIEW_EVIDENCE === "1";
}

/** The same location as a file URL, for tests that address it relative to the repository. */
export function reviewEvidenceUrl(relative = ""): URL {
  return new URL(`../../${REVIEW_EVIDENCE}/${relative}`, import.meta.url);
}

/**
 * Screenshots a spec keeps as its own evidence (e.g. `specs/<task>/verification`). Ordinary runs write them under the
 * ignored review folder; refreshing the committed evidence takes the same explicit MOLIS_WORK_REVIEW_EVIDENCE=1.
 */
export function specEvidenceDirectory(specPath: string): string {
  return process.env.MOLIS_WORK_REVIEW_EVIDENCE === "1" ? specPath : `.impeccable/qa/review/${specPath}`;
}

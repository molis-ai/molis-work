import { codeOf, isAbort } from "./dom.js";
import type { IssuesPage, NamedResult, QuestionResult, ReviewJob } from "./types.js";

const t = globalThis.t;

/** Beside the model's own limit: still waiting after this long, the person gets the editor back as it is. */
const REVIEW_LIMIT_MS = 120_000;
const MODEL_DOWN = ["actions.connection_required", "plugin.model_failed"];

/**
 * Saved records: Issue suggests a title and type for what is in the editor (`issues.suggest_name`, ISSUE-51) and fills
 * them in; nothing is written until the person saves, through the editor's versioned Save. A late answer, after the
 * person stopped, left, opened another record, changed the words or waited past two minutes, is dropped (ISSUE-49).
 */
export function installReview(page: IssuesPage): void {
  const { state, scope, $ } = page;
  page.stopReview = async () => {
    state.review = null;
    $<HTMLButtonElement>("redo").disabled = false;
  };
  page.reviewIssue = async () => {
    if (state.review || state.importing) return;
    const data = page.values();
    if (!data.description.trim() && !data.images.length) { page.flag(t.text("issues.composer.need-words")); return; }
    const record = state.current;
    const job: ReviewJob = { target: record, data, at: Date.now() };
    const reported = record && "context" in record ? record.context.page : null;
    state.review = job;
    $<HTMLButtonElement>("redo").disabled = true;
    page.flag(t.text("issues.review.working"));
    const active = () => state.review === job && state.current === job.target && state.editing && scope.alive;
    const overdue = () => {
      if (!active()) return;
      if (Date.now() - job.at <= REVIEW_LIMIT_MS) { scope.timeout(overdue, 1000); return; }
      void page.stopReview();
      page.flag(t.text("issues.review.failed"));
    };
    overdue();
    let result: NamedResult | QuestionResult;
    try {
      result = await page.api<NamedResult | QuestionResult>("suggest-name", { description: data.description, images: data.images, ...(reported ? { page: { url: reported.url, title: reported.title } } : {}) });
    } catch (error) {
      if (isAbort(error) || !active()) return;
      await page.stopReview();
      const code = codeOf(error);
      const models = Boolean(code && MODEL_DOWN.includes(code));
      page.flag(t.text(models ? "issues.review.model-down" : "issues.review.failed"), models);
      return;
    }
    if (!active()) return;
    await page.stopReview();
    if (JSON.stringify(page.values()) !== JSON.stringify(data) || state.importing) { page.flag(t.text("issues.review.changed")); return; }
    if (result.status === "named") { page.fill({ ...data, title: result.title, type: result.type }); page.flag(t.text("issues.review.done")); }
    else page.flag(t.text("issues.review.need-more", { question: result.question }));
  };
}

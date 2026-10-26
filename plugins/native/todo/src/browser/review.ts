import type { TodoBatch } from "../contract.js";
import { arrive, make } from "./dom.js";
import { renderBatchSection } from "./review-cards.js";
import type { TodoPage } from "./types.js";

/** Organizing results waiting for the person: each candidate with its evidence, what applying it would do, and the choices to make. */
export function installReview(page: TodoPage): void {
  const { el, state, L } = page;
  page.renderReview = () => {
    el.reviewEl.replaceChildren();
    if (!state.batches.length) {
      const none = make("div", "mw-empty");
      none.append(make("strong", "", L("todo.review.none-title")), make("p", "", L("todo.review.none-text")));
      el.reviewEl.append(none);
      return;
    }
    for (const batch of state.batches) el.reviewEl.append(renderBatchSection(page, batch));
    if (state.focusBatch) {
      const target = el.reviewEl.querySelector<HTMLElement>(`[data-todo-batch-review="${state.focusBatch}"]`);
      if (target) { target.scrollIntoView({ block: "start" }); arrive(target); }
      state.focusBatch = "";
    }
  };
  page.loadBatches = async () => {
    const seq = ++state.batchSeq;
    const payload = await page.request<{ batches?: TodoBatch[] }>("GET", "/organize");
    if (seq !== state.batchSeq) return;
    state.batches = payload.batches || [];
    const waiting = state.batches.reduce((sum, batch) => sum + batch.candidates.filter((candidate) => !candidate.decision).length, 0);
    el.reviewToggle.hidden = !state.batches.length && state.view !== "review";
    el.reviewToggle.textContent = (el.reviewToggle.dataset.todoViewLabel ?? "") + (waiting ? ` ${waiting}` : "");
    if (state.view === "review") page.renderReview();
  };
}


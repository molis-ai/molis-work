import { GOAL_NOT_FOUND } from "../document-routes.js";
import { failureOf } from "./dom.js";
import type { GoalCollection, Route } from "./types.js";

export interface DocumentHost {
  readonly documentPane: HTMLElement;
  readonly documentCollection: GoalCollection;
  readonly route: Route;
  readonly beforeReplace?: () => void;
  readonly afterReplace: () => void;
  readonly isAbortError: (error: unknown) => boolean;
  readonly showError: (message: string) => void;
}

/** Loads a Goal's document into the document pane. */
export function documentClient(host: DocumentHost) {
  const { documentPane, documentCollection, route, beforeReplace, afterReplace, isAbortError, showError } = host;
  let goalDocumentRequest: AbortController | null = null;

  const replaceGoalDocument = (html: unknown) => {
    beforeReplace?.();
    const template = document.createElement("template");
    template.innerHTML = String(html || "").trim();
    const nextView = template.content.querySelector("[data-goal-view]");
    if (!nextView) throw new Error("Goal 正文响应不完整");
    (documentPane.querySelector('[data-work-surface="goals"]') || documentPane).replaceChildren(nextView);
    afterReplace();
  };

  const setGoalDocumentBusy = (busy: boolean) => {
    if (busy) documentPane.setAttribute("aria-busy", "true");
    else documentPane.removeAttribute("aria-busy");
    documentPane.querySelector("[data-goal-document-loading]")?.remove();
    if (!busy) return;
    const indicator = document.createElement("div");
    indicator.className = "goal-document-loading";
    indicator.dataset.mwState = "running";
    indicator.dataset.goalDocumentLoading = "true";
    indicator.setAttribute("role", "status");
    indicator.textContent = globalThis.t.text("goals.document-client.loading-goal");
    (documentPane.querySelector('[data-work-surface="goals"]') || documentPane).prepend(indicator);
  };

  const loadGoalDocument = async (goalId: string): Promise<boolean | null> => {
    goalDocumentRequest?.abort();
    const controller = new AbortController();
    goalDocumentRequest = controller;
    setGoalDocumentBusy(true);
    try {
      const html = await molisWorkRequest<string>(
        route("/api/goals/" + encodeURIComponent(goalId) + "/document?view=" + documentCollection),
        { signal: controller.signal, as: "text", fallback: "无法读取这条 Goal 正文" },
      );
      if (goalDocumentRequest !== controller) return null;
      replaceGoalDocument(html);
      return true;
    } catch (error) {
      if (isAbortError(error) || goalDocumentRequest !== controller) return null;
      const failure = failureOf(error);
      // A Goal this project no longer has (Goals' own not-found, not any 404): its tab stays, struck through, and its pane says why.
      if (failure.status === 404 && failure.code === GOAL_NOT_FOUND) document.dispatchEvent(new CustomEvent("molis-work:record-gone", { detail: { plugin: "goals", itemId: goalId } }));
      // A refusal, a missing Goal included, keeps the one copy this read has always shown; an unreachable Host says so.
      showError((failure.status ? "" : failure.message) || "无法读取这条 Goal 正文");
      return false;
    } finally {
      if (goalDocumentRequest === controller) {
        goalDocumentRequest = null;
        setGoalDocumentBusy(false);
      }
    }
  };

  return { loadGoalDocument };
}

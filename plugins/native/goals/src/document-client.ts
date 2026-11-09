import { GOAL_NOT_FOUND } from "./document-routes.js";

/** Browser factory expression. Workbench supplies only the explicit Host ports below. */
export const GOALS_DOCUMENT_CLIENT_FACTORY_SCRIPT = `(host) => {
    const { documentPane, documentCollection, route, translate: readText,
      beforeReplace, afterReplace, isAbortError, showError } = host;
    let goalDocumentRequest = null;

    const replaceGoalDocument = (html) => {
      beforeReplace?.();
      const template = document.createElement("template");
      template.innerHTML = String(html || "").trim();
      const nextView = template.content.querySelector("[data-goal-view]");
      if (!nextView) throw new Error("Goal 正文响应不完整");
      (documentPane.querySelector('[data-work-surface="goals"]') || documentPane).replaceChildren(nextView);
      afterReplace();
    };

    const setGoalDocumentBusy = (busy) => {
      if (busy) documentPane.setAttribute("aria-busy", "true");
      else documentPane.removeAttribute("aria-busy");
      documentPane.querySelector("[data-goal-document-loading]")?.remove();
      if (!busy) return;
      const indicator = document.createElement("div");
      indicator.className = "goal-document-loading"; indicator.dataset.mwState = "running";
      indicator.dataset.goalDocumentLoading = "true";
      indicator.setAttribute("role", "status");
      indicator.textContent = globalThis.t.text("goals.document-client.loading-goal");
      (documentPane.querySelector('[data-work-surface="goals"]') || documentPane).prepend(indicator);
    };

    const loadGoalDocument = async (goalId) => {
      goalDocumentRequest?.abort();
      const controller = new AbortController();
      goalDocumentRequest = controller;
      setGoalDocumentBusy(true);
      try {
        const html = await molisWorkRequest(
          route("/api/goals/" + encodeURIComponent(goalId) + "/document?view=" + documentCollection),
          { signal: controller.signal, as: "text", fallback: "无法读取这条 Goal 正文" },
        );
        if (goalDocumentRequest !== controller) return null;
        replaceGoalDocument(html);
        return true;
      } catch (error) {
        if (isAbortError(error) || goalDocumentRequest !== controller) return null;
        // A Goal this project no longer has (Goals' own not-found, not any 404): its tab stays, struck through, and its pane says why.
        if (error.status === 404 && error.code === ${JSON.stringify(GOAL_NOT_FOUND)}) document.dispatchEvent(new CustomEvent("molis-work:record-gone", { detail: { plugin: "goals", itemId: goalId } }));
        // A refusal, a missing Goal included, keeps the one copy this read has always shown; an unreachable Host says so.
        showError((error.status ? "" : error.message) || "无法读取这条 Goal 正文");
        return false;
      } finally {
        if (goalDocumentRequest === controller) {
          goalDocumentRequest = null;
          setGoalDocumentBusy(false);
        }
      }
    };

    return { loadGoalDocument };
  }`;

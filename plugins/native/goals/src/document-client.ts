/** Browser factory expression. Workbench supplies only the explicit Host ports below. */
export const GOALS_DOCUMENT_CLIENT_FACTORY_SCRIPT = `(host) => {
    const { documentPane, documentCollection, route, translate: L,
      beforeReplace, afterReplace, isAbortError, showError } = host;
    let goalDocumentRequest = null;

    const replaceGoalDocument = (html) => {
      beforeReplace?.();
      const template = document.createElement("template");
      template.innerHTML = String(html || "").trim();
      const nextView = template.content.querySelector("[data-goal-view]");
      if (!nextView) throw new Error("Goal 正文响应不完整");
      const goalSurface = documentPane.querySelector('[data-work-surface="goal"]');
      const paneHeader = goalSurface ? null : documentPane.querySelector(":scope > .desktop-pane-header");
      if (goalSurface) goalSurface.replaceChildren(nextView);
      else documentPane.replaceChildren(...(paneHeader ? [paneHeader, nextView] : [nextView]));
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
      indicator.textContent = L("正在载入 Goal…");
      const goalSurface = documentPane.querySelector('[data-work-surface="goal"]');
      const paneHeader = goalSurface ? null : documentPane.querySelector(":scope > .desktop-pane-header");
      if (paneHeader) paneHeader.after(indicator);
      else (goalSurface || documentPane).prepend(indicator);
    };

    const loadGoalDocument = async (goalId) => {
      goalDocumentRequest?.abort();
      const controller = new AbortController();
      goalDocumentRequest = controller;
      setGoalDocumentBusy(true);
      try {
        const response = await fetch(
          route("/api/goals/" + encodeURIComponent(goalId) + "/document?view=" + documentCollection),
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error("无法读取这条 Goal 正文");
        const html = await response.text();
        if (goalDocumentRequest !== controller) return null;
        replaceGoalDocument(html);
        return true;
      } catch (error) {
        if (isAbortError(error) || goalDocumentRequest !== controller) return null;
        showError(error.message || "无法读取这条 Goal 正文");
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

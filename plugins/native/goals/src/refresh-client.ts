/** Goals-only refresh contribution. The Host owns fetching, interaction guards and shared state. */
export const GOALS_REFRESH_CLIENT_FACTORY_SCRIPT = `(host) => {
    const { treeScroll, treeFilter, documentPane, dialog,
      readCreateDraft, refreshCreateChoices, translate: L } = host;

    const prepareGoalRefresh = (parsed, navigation, currentGoals, goalId, collectionPath) => {
      const renderedGoalId = parsed.querySelector("[data-goal-view]")?.dataset.goalView || "";
      const goalStillExists = currentGoals.some((item) => item.goal.goal_id === goalId);
      const nextSelected = renderedGoalId ||
        (goalStillExists ? goalId : navigation.active_goal_id || "");
      const nextTree = parsed.querySelector("[data-tree-scroll]");
      const nextDocument = parsed.querySelector("[data-document-pane]");
      const nextFooter = parsed.querySelector("[data-tree-footer]");
      const nextFilter = parsed.querySelector("[data-tree-filter]");
      const nextDialog = parsed.querySelector("[data-create-dialog]");
      // The tree footer is optional: the current layout has none, and requiring it made every
      // full-page fallback fail silently.
      if (!nextTree || !nextDocument) throw new Error("页面数据不完整");

      let move = null;
      if (goalId && !goalStillExists) {
        const movedToCurrent = navigation.goals.some((item) => item.goal.goal_id === goalId);
        const movedToArchive = navigation.archived_goals.some((item) => item.goal.goal_id === goalId);
        const movedToTrash = navigation.trashed_goals.some((item) => item.goal.goal_id === goalId);
        const path = movedToCurrent
          ? "/goals/" + encodeURIComponent(goalId)
          : movedToArchive
            ? "/archive/goals/" + encodeURIComponent(goalId)
            : movedToTrash
              ? "/trash/goals/" + encodeURIComponent(goalId)
              : collectionPath;
        const message = movedToCurrent
          ? L("这条 Goal 已恢复到当前 Goal，已继续打开同一条 Goal。")
          : movedToArchive
            ? L("这条 Goal 已归档，已继续打开归档中的同一条 Goal。")
            : movedToTrash
              ? L("这条 Goal 已移入回收站，已继续打开同一条 Goal。")
              : L("这条 Goal 已不在当前集合，已返回列表。");
        move = { path, message };
      }

      // Called only after the Host rechecks selection and interaction guards.
      const apply = (refreshShellLinks) => {
        const createDraft = dialog.open ? readCreateDraft() : null;
        // Keep only handwritten reasons for proposals still present, separately in the list and Goal detail.
        // Server checks, item ids and button states always come from the new projection.
        for (const [current, next] of [[treeScroll, nextTree], [documentPane, nextDocument]]) {
          for (const form of current?.querySelectorAll("[data-goal-tree-decision-form][data-live-dirty=true]") || []) {
            const fresh = next.querySelector('[data-live-form="' + form.dataset.liveForm + '"]');
            if (fresh) { fresh.elements.reason.textContent = form.elements.reason.value; fresh.dataset.liveDirty = "true"; }
          }
        }
        documentPane.classList.add("is-syncing");
        if (treeScroll) treeScroll.innerHTML = nextTree.innerHTML;
        const currentSurface = documentPane.querySelector('[data-work-surface="goals"]');
        const nextSurface = nextDocument.querySelector('[data-work-surface="goals"]');
        if (currentSurface && nextSurface) {
          currentSurface.replaceChildren(...nextSurface.childNodes);
        } else {
          documentPane.replaceChildren(...nextDocument.childNodes);
        }
        if (nextFilter && treeFilter) treeFilter.innerHTML = nextFilter.innerHTML;
        const footer = document.querySelector("[data-tree-footer]");
        if (footer && nextFooter) footer.innerHTML = nextFooter.innerHTML;
        refreshShellLinks();
        if (nextDialog) refreshCreateChoices(nextDialog, createDraft);
      };
      return { nextSelected, move, apply };
    };

    return { prepareGoalRefresh };
  }`;

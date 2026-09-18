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
      const nextCount = parsed.querySelector("[data-tree-count]");
      const nextDialog = parsed.querySelector("[data-create-dialog]");
      if (!nextTree || !nextDocument || !nextFooter) throw new Error("页面数据不完整");

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
        documentPane.classList.add("is-syncing");
        if (treeScroll) treeScroll.innerHTML = nextTree.innerHTML;
        const currentSurface = documentPane.querySelector('[data-work-surface="goal"]');
        const nextSurface = nextDocument.querySelector('[data-work-surface="goal"]');
        if (currentSurface && nextSurface) {
          currentSurface.replaceChildren(...nextSurface.childNodes);
        } else {
          documentPane.replaceChildren(...nextDocument.childNodes);
        }
        if (nextFilter && treeFilter) treeFilter.innerHTML = nextFilter.innerHTML;
        const footer = document.querySelector("[data-tree-footer]");
        if (footer && nextFooter) footer.innerHTML = nextFooter.innerHTML;
        if (nextCount) document.querySelector("[data-tree-count]").textContent = nextCount.textContent;
        refreshShellLinks();
        if (nextDialog) refreshCreateChoices(nextDialog, createDraft);
      };
      return { nextSelected, move, apply };
    };

    return { prepareGoalRefresh };
  }`;

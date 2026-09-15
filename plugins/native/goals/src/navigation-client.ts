/** Goal-owned browser behavior, mounted by Workbench at the existing event/initialization position. */
const GOALS_SELECT_SCRIPT = `    const selectGoal = async (goalId, updateHistory = true) => {
      if (decisionView) {
        navigateToGoal(goalId);
        return;
      }
      const currentView = documentPane.querySelector("[data-goal-view]");
      if (goalId === getSelected() && currentView?.dataset.goalView === goalId) {
        setWorkspaceMode("focus", false);
        saveUiState();
        return;
      }
      const fallbackGoalId = currentView?.dataset.goalView || getSelected();
      if (!applySelection(goalId, true)) return;
      const loaded = await loadGoalDocument(goalId);
      if (loaded == null) return;
      if (!loaded) {
        if (getSelected() === goalId && fallbackGoalId) applySelection(fallbackGoalId, false);
        return;
      }
      ensureWorkTab(goalId);
      document.dispatchEvent(new CustomEvent("molis-work:goal-document-loaded", { detail: { goalId } }));
      if (updateHistory) {
        history.pushState({ goalId }, "", goalPageUrl(goalId));
      }
      setWorkspaceMode("focus", false);
      saveUiState();
    };

`;

const GOALS_SELECT_CLICK_SCRIPT = `      const goalLink = target.closest("[data-select-goal]");
      if (goalLink) {
        selectGoal(goalLink.dataset.selectGoal);
        return true;
      }
      return false;
`;

const GOALS_HISTORY_SCRIPT = `    const handleGoalPopState = (event) => {
      const pathname = localPathname();
      const match = pathname.match(
        trashView ? /^\\/trash\\/goals\\/(.+)$/ : archiveView ? /^\\/archive\\/goals\\/(.+)$/ : /^\\/goals\\/(.+)$/,
      );
      const collectionRoot = trashView ? "/trash" : archiveView ? "/archive" : "/";
      const rootGoalId = pathname === collectionRoot
        ? String(event.state?.goalId || getActiveGoalId() || visibleGoals()[0]?.goal.goal_id || "")
        : "";
      const goalId = match ? decodeURIComponent(match[1]) : rootGoalId;
      if (goalId) void selectGoal(goalId, false);
    };
    const handleGoalHashChange = () => {
      const targetId = decodeURIComponent(location.hash.slice(1));
      openEventReaderFromHash();
      const factor = goalFactorFromHash();
      if (factor) setGoalFactor(factor, true);
      const target = targetId ? document.getElementById(targetId) : null;
      if (target?.closest?.("[data-event-panel], [data-goal-factor-panel]")) documentPane.querySelector("[data-event-sheet]")?.scrollTo?.(0, 0);
      if (targetId) void revealDeepLinkFromId(targetId);
    };
`;

/** Bind Goal navigation without owning the shared Workbench selection or listeners. */
export const GOALS_NAVIGATION_CLIENT_FACTORY_SCRIPT = `(host) => {
    const {
      decisionView, trashView, archiveView, documentPane, getSelected, getActiveGoalId,
      navigateToGoal, applySelection, loadGoalDocument,
      ensureWorkTab, goalPageUrl, setWorkspaceMode, saveUiState, localPathname,
      visibleGoals, openEventReaderFromHash, goalFactorFromHash,
      setGoalFactor, revealDeepLinkFromId,
    } = host;
${GOALS_SELECT_SCRIPT}${GOALS_HISTORY_SCRIPT}
    const handleGoalSelectClick = (target) => {
${GOALS_SELECT_CLICK_SCRIPT}    };
    return { selectGoal, handleGoalSelectClick, handleGoalPopState, handleGoalHashChange };
  }`;

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
      if (!applySelection(goalId, true)) {
        // An archived or trashed Goal is listed in its fold but belongs to another collection view: open its own page
        // there instead of doing nothing.
        if (document.querySelector('[data-goal-collection-fold] .tree-node[data-select-goal="' + CSS.escape(goalId) + '"]')) navigateToGoal(goalId);
        return;
      }
      const loaded = await loadGoalDocument(goalId);
      if (loaded == null) return;
      if (!loaded) {
        if (getSelected() === goalId && fallbackGoalId) applySelection(fallbackGoalId, false);
        return;
      }
      document.dispatchEvent(new CustomEvent("molis-work:goal-document-loaded", { detail: { goalId } }));
      if (updateHistory) {
        history.pushState({ goalId }, "", goalPageUrl(goalId));
      }
      setWorkspaceMode("focus", false);
      saveUiState();
    };

`;

const GOALS_HISTORY_SCRIPT = `    const handleGoalPopState = (event) => {
      const pathname = localPathname();
      const match = pathname.match(
        trashView ? /^\\/trash\\/goals\\/(.+)$/ : archiveView ? /^\\/archive\\/goals\\/(.+)$/ : /^\\/goals\\/(.+)$/,
      );
      const collectionRoot = trashView ? "/trash" : archiveView ? "/archive" : "/";
      const rootGoalId = pathname === collectionRoot
        ? String(event.state?.goalId || "")
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
      decisionView, trashView, archiveView, documentPane, getSelected,
      navigateToGoal, applySelection, loadGoalDocument,
      goalPageUrl, setWorkspaceMode, saveUiState, localPathname,
      openEventReaderFromHash, goalFactorFromHash,
      setGoalFactor, revealDeepLinkFromId,
    } = host;
${GOALS_SELECT_SCRIPT}${GOALS_HISTORY_SCRIPT}
    return { selectGoal, handleGoalPopState, handleGoalHashChange };
  }`;

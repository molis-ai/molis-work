import { GOALS_PLUGIN_ID } from "../identity.js";
import type { GoalListItem, SetWorkspaceMode } from "./types.js";

export interface NavigationHost {
  readonly trashView: boolean;
  readonly archiveView: boolean;
  readonly documentPane: HTMLElement;
  readonly getSelected: () => string;
  readonly navigateToGoal: (goalId: string) => void;
  readonly applySelection: (goalId: string, resetScroll: boolean) => boolean;
  readonly loadGoalDocument: (goalId: string) => Promise<boolean | null>;
  readonly goalPageUrl: (goalId: string) => string;
  readonly setWorkspaceMode: SetWorkspaceMode;
  readonly saveUiState: () => void;
  readonly localPathname: () => string;
  readonly visibleGoals: () => readonly GoalListItem[];
  readonly openEventReaderFromHash: () => boolean;
  readonly goalFactorFromHash: () => string;
  readonly setGoalFactor: (factor: string, persist?: boolean, updateHash?: boolean) => boolean;
  readonly revealDeepLinkFromId: (targetId: string) => unknown;
  /** The open Goal's work frame follows the Goal just loaded. */
  readonly syncWorkFrame: () => void;
}

/** Selecting a Goal and following the address. */
export function navigationClient(host: NavigationHost) {
  const {
    trashView, archiveView, documentPane, getSelected,
    navigateToGoal, applySelection, loadGoalDocument,
    goalPageUrl, setWorkspaceMode, saveUiState, localPathname,
    openEventReaderFromHash, goalFactorFromHash,
    setGoalFactor, revealDeepLinkFromId, syncWorkFrame,
  } = host;
  const selectGoal = async (goalId: string, updateHistory = true) => {
    const currentView = documentPane.querySelector<HTMLElement>("[data-goal-view]");
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
    syncWorkFrame();
    document.dispatchEvent(new CustomEvent("molis-work:work-terminal-subject-ready", { detail: { pluginId: GOALS_PLUGIN_ID, subjectKind: "goal", subjectId: goalId } }));
    if (updateHistory) {
      history.pushState({ goalId }, "", goalPageUrl(goalId));
    }
    setWorkspaceMode("focus", false);
    saveUiState();
  };

  const handleGoalPopState = (event: PopStateEvent) => {
    const pathname = localPathname();
    const match = pathname.match(
      trashView ? /^\/trash\/goals\/(.+)$/ : archiveView ? /^\/archive\/goals\/(.+)$/ : /^\/goals\/(.+)$/,
    );
    const collectionRoot = trashView ? "/trash" : archiveView ? "/archive" : "/";
    const rootGoalId = pathname === collectionRoot
      ? String((event.state as { goalId?: unknown } | null)?.goalId || "")
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

  return { selectGoal, handleGoalPopState, handleGoalHashChange };
}

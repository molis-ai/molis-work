import type { GoalListItem, GoalNavigation } from "./types.js";

export interface RefreshHost {
  readonly treeScroll: HTMLElement | null;
  readonly treeFilter: HTMLElement | null;
  readonly documentPane: HTMLElement;
  readonly dialog: HTMLDialogElement | null;
  readonly readCreateDraft: () => unknown;
  readonly refreshCreateChoices: (nextDialog: Element, draft: unknown) => void;
}

/** A refresh worked out from a page the Host drew again: what it selects, where a moved Goal went, and how to apply it. */
export interface GoalRefresh {
  readonly nextSelected: string;
  readonly move: { readonly path: string; readonly message: string } | null;
  readonly apply: (refreshShellLinks: () => void) => void;
}

/** What a board refresh keeps: scroll, open dialogs and drafts. */
export function refreshClient(host: RefreshHost) {
  const { treeScroll, treeFilter, documentPane, dialog, readCreateDraft, refreshCreateChoices } = host;

  const prepareGoalRefresh = (parsed: ParentNode, navigation: GoalNavigation, currentGoals: readonly GoalListItem[], goalId: string,
    collectionPath: string, collectionOnly = false, followSelection = true): GoalRefresh => {
    const renderedGoalId = parsed.querySelector<HTMLElement>("[data-goal-view]")?.dataset.goalView || "";
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
    if (!nextTree || (!collectionOnly && !nextDocument)) throw new Error(globalThis.t.text("goals.refresh-client.data-incomplete"));

    let move: GoalRefresh["move"] = null;
    if (followSelection && goalId && !goalStillExists) {
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
        ? globalThis.t.text("goals.refresh-client.goal-was-restored-current-goals-same-goal-remains")
        : movedToArchive
          ? globalThis.t.text("goals.refresh-client.goal-was-archived-same-archived-goal-remains-open")
          : movedToTrash
            ? globalThis.t.text("goals.refresh-client.goal-was-moved-trash-same-goal-remains-open")
            : globalThis.t.text("goals.refresh-client.goal-no-longer-current-collection-so-list-open");
      move = { path, message };
    }

    // Called only after the Host rechecks selection and interaction guards.
    const apply = (refreshShellLinks: () => void) => {
      const createDraft = dialog?.open ? readCreateDraft() : null;
      // Keep only handwritten reasons for proposals still present, separately in the list and Goal detail.
      // Server checks, item ids and button states always come from the new projection.
      const pairs: Array<[Element | null, Element | null]> = collectionOnly ? [[treeScroll, nextTree]] : [[treeScroll, nextTree], [documentPane, nextDocument]];
      for (const [current, next] of pairs) {
        for (const form of current?.querySelectorAll<HTMLFormElement>("[data-goal-tree-decision-form][data-live-dirty=true]") || []) {
          const fresh = next?.querySelector<HTMLFormElement>('[data-live-form="' + form.dataset.liveForm + '"]');
          const reason = form.elements.namedItem("reason"), freshReason = fresh?.elements.namedItem("reason");
          if (!fresh) continue;
          if (freshReason instanceof Element && (reason instanceof HTMLTextAreaElement || reason instanceof HTMLInputElement)) freshReason.textContent = reason.value;
          fresh.dataset.liveDirty = "true";
        }
      }
      if (treeScroll) treeScroll.innerHTML = nextTree.innerHTML;
      if (!collectionOnly && nextDocument) {
        documentPane.classList.add("is-syncing");
        const currentSurface = documentPane.querySelector('[data-work-surface="goals"]');
        const nextSurface = nextDocument.querySelector('[data-work-surface="goals"]');
        if (currentSurface && nextSurface) currentSurface.replaceChildren(...nextSurface.childNodes);
        else documentPane.replaceChildren(...nextDocument.childNodes);
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
}

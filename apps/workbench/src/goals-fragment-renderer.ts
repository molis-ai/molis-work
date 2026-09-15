import { findGoalsFragmentItem, goalsReadCollection, type GoalsFragmentItem, type GoalsPageCollections,
  type GoalDocumentCollection } from "@molis-ai/molis-work-plugin-goals";

interface FragmentView<TItem extends GoalsFragmentItem> extends GoalsPageCollections<TItem> {
  route_prefix: string;
}
export interface GoalsFragmentRenderers<TItem extends GoalsFragmentItem, TView extends FragmentView<TItem>> {
  document(item: TItem, view: TView): string;
  trash(item: TItem): string;
  momentum(view: TView, goalId: string, items: readonly TItem[]): string;
  prefixLinks(html: string, routePrefix: string): string;
}

/** Compose owner output; no templates, event ledger algorithm, HTTP or permission decisions. */
export function createWorkbenchGoalsFragmentRenderer<TItem extends GoalsFragmentItem, TView extends FragmentView<TItem>>(
  owners: GoalsFragmentRenderers<TItem, TView>,
) {
  const prefix = (html: string, view: TView) => owners.prefixLinks(html, view.route_prefix);
  return {
    renderGoalDocumentFragment(view: TView, goalId: string, collection: GoalDocumentCollection = "current"): string | null {
      const item = findGoalsFragmentItem<TItem>(view, goalId, collection);
      if (!item) return null;
      return prefix(collection === "trash" ? owners.trash(item) : owners.document(item, view), view);
    },
    renderMolisWorkMomentumFragment(view: TView, goalId: string, collection: GoalDocumentCollection = "current"): string | null {
      if (collection === "trash") return null;
      return prefix(owners.momentum(view, goalId, goalsReadCollection<TItem>(view, collection)), view);
    },
  };
}

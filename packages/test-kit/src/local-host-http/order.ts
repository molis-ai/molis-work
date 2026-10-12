import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";

/** What the order of a grant set depends on: the action's identity, its provider, and the two things it needs before it works. */
export type GrantOrderView = Pick<ActionView, "capability_id" | "version"> & {
  readonly provider: Pick<ActionView["provider"], "provider_id">;
  readonly action: Pick<ActionView["action"], "required_actions" | "required_scene">;
};

const label = (view: GrantOrderView) => `${view.capability_id}@${view.version}`;

/**
 * The order in which the Host accepts a set of grants: each view after every view in the set that it names in `required_actions`
 * (matched on capability and version, and on the provider when the reference pins one), and a view that needs a scene binding
 * after the views that do not, since the function bound to the scene is an ordinary action. A dependency wins over that
 * preference, and the order otherwise stays as given. A view the set holds more than once (the same object) is taken once, at its
 * first place: a repeat is not a cycle. A cycle throws: the Host would refuse it too (`actions.dependency_cycle`).
 */
export function orderGrantViews<View extends GrantOrderView>(given: readonly View[]): View[] {
  const views = [...new Set(given)];
  const needs = new Map<View, readonly View[]>(views.map(view => [view, (view.action.required_actions ?? []).flatMap(reference =>
    views.filter(other => other.capability_id === reference.capability_id && other.version === reference.version
      && (!reference.provider_id || other.provider.provider_id === reference.provider_id)))]));
  const placed = new Set<View>();
  const ordered: View[] = [];
  while (ordered.length < views.length) {
    const ready = views.filter(view => !placed.has(view) && needs.get(view)!.every(dependency => placed.has(dependency)));
    const next = ready.find(view => !view.action.required_scene) ?? ready[0];
    if (!next) throw new Error(`Grant set has a dependency cycle among: ${views.filter(view => !placed.has(view)).map(label).join(", ")}`);
    placed.add(next);
    ordered.push(next);
  }
  return ordered;
}

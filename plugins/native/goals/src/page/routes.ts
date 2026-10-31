import type { DeclaredPageRouteMatch } from "@molis-ai/molis-work-plugin-sdk";
import { goalsReadRouteNotFound, goalsReadRouteOf, goalsPageRouteOf, resolveGoalsPageCollection,
  type GoalsPageCollections, type GoalsRouteError, type GoalsReadRoute, type GoalDocumentCollection } from "../document-routes.js";

type HtmlResult = { status: 200; html: string } | GoalsRouteError;

/** The Host's match of a fragment route, answered. Invalid or unrelated requests do not load anything or instantiate the owner renderers. */
export async function renderGoalsReadRequest<TLoaded>(
  method: string | undefined, match: DeclaredPageRouteMatch | null, load: (route: GoalsReadRoute) => TLoaded | Promise<TLoaded>,
  createRenderers: (loaded: TLoaded, route: GoalsReadRoute) => GoalsReadRenderers,
): Promise<HtmlResult | null> {
  if (method !== "GET") return null;
  const resolved = goalsReadRouteOf(match);
  if (!resolved || "error" in resolved) return resolved;
  return renderGoalsReadRoute(resolved.route, createRenderers(await load(resolved.route), resolved.route));
}

export interface GoalsPageSelection {
  goalId: string | undefined;
  archiveView: boolean;
  trashView: boolean;
}

/** Page composition only; the Host retains scoped reads and the asynchronous Project operations provider. */
export async function renderGoalsPageRequest<TView extends GoalsPageCollections>(
  method: string | undefined, match: DeclaredPageRouteMatch | null, readView: () => TView | Promise<TView>,
  render: (view: TView, selection: GoalsPageSelection) => string | Promise<string>,
): Promise<HtmlResult | null> {
  if (method !== "GET") return null;
  const parsed = goalsPageRouteOf(match);
  if (!parsed) return null;
  if ("error" in parsed) return parsed;
  const view = await readView();
  const resolved = resolveGoalsPageCollection(parsed.route, view);
  if ("error" in resolved) return resolved;
  return { status: 200, html: await render(view, {
    goalId: "goal_id" in resolved.route ? resolved.route.goal_id : undefined,
    archiveView: resolved.route.collection === "archive",
    trashView: resolved.route.collection === "trash",
  }) };
}

/** Host supplies owner renderers; this composition has no Store, HTML templates or HTTP objects. */
export interface GoalsReadRenderers {
  refresh(goalId: string | undefined, collection: GoalDocumentCollection): string;
  momentum(goalId: string, collection: "current" | "archive"): string | null;
  document(goalId: string, collection: GoalDocumentCollection): string | null;
}
export function renderGoalsReadRoute(route: GoalsReadRoute, renderers: GoalsReadRenderers): { status: 200; html: string } | { status: 404; error: string } {
  let html: string | null;
  switch (route.kind) {
    case "refresh": html = renderers.refresh(route.goal_id, route.collection); break;
    case "momentum": html = renderers.momentum(route.goal_id, route.collection); break;
    case "document": html = renderers.document(route.goal_id, route.collection); break;
  }
  // Refresh historically accepts an empty render result; individual fragments do not.
  return html || route.kind === "refresh" ? { status: 200, html: html ?? "" } : { status: 404, error: goalsReadRouteNotFound(route) };
}

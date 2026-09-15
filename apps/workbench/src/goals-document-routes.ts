import { goalsReadRouteNotFound, resolveGoalsReadRoute, resolveGoalsPageRoute, resolveGoalsPageCollection,
  type GoalsPageCollections, type GoalsRouteError, type GoalsReadRoute, type GoalDocumentCollection } from "@molis-ai/molis-work-plugin-goals";

type HtmlResult = { status: 200; html: string } | GoalsRouteError;

/** Invalid/unrelated requests do not load a view or instantiate its owner renderers. */
export function renderWorkbenchGoalsReadRequest(
  method: string | undefined, pathname: string, params: URLSearchParams, createRenderers: () => GoalsReadRenderers,
): HtmlResult | null {
  if (method !== "GET") return null;
  const resolved = resolveGoalsReadRoute(pathname, params);
  if (!resolved || "error" in resolved) return resolved;
  return renderWorkbenchGoalsReadRoute(resolved.route, createRenderers());
}

export interface WorkbenchGoalPageSelection {
  goalId: string | undefined;
  archiveView: boolean;
  trashView: boolean;
  decisionView: boolean;
}

/** Page composition only; the Host retains scoped reads and the asynchronous Project operations provider. */
export async function renderWorkbenchGoalsPageRequest<TView extends GoalsPageCollections>(
  method: string | undefined, pathname: string, readView: () => TView,
  render: (view: TView, selection: WorkbenchGoalPageSelection) => string | Promise<string>,
): Promise<HtmlResult | null> {
  if (method !== "GET") return null;
  // Decision is a separate Workbench owner, not a Goals Plugin route.
  const decisionView = pathname === "/decisions";
  const parsed = resolveGoalsPageRoute(pathname);
  if (parsed && "error" in parsed) return parsed;
  if (!parsed && !decisionView) return null;
  const view = readView();
  const resolved = parsed ? resolveGoalsPageCollection(parsed.route, view) : { route: { collection: "current" as const } };
  if ("error" in resolved) return resolved;
  return { status: 200, html: await render(view, {
    goalId: "goal_id" in resolved.route ? resolved.route.goal_id : undefined,
    archiveView: resolved.route.collection === "archive",
    trashView: resolved.route.collection === "trash", decisionView,
  }) };
}

/** Host supplies owner renderers; this composition has no Store, HTML templates or HTTP objects. */
export interface GoalsReadRenderers {
  refresh(goalId: string | undefined, collection: GoalDocumentCollection): string;
  momentum(goalId: string, collection: "current" | "archive"): string | null;
  document(goalId: string, collection: GoalDocumentCollection): string | null;
}
export function renderWorkbenchGoalsReadRoute(route: GoalsReadRoute, renderers: GoalsReadRenderers): { status: 200; html: string } | { status: 404; error: string } {
  let html: string | null;
  switch (route.kind) {
    case "refresh": html = renderers.refresh(route.goal_id, route.collection); break;
    case "momentum": html = renderers.momentum(route.goal_id, route.collection); break;
    case "document": html = renderers.document(route.goal_id, route.collection); break;
  }
  // Refresh historically accepts an empty render result; individual fragments do not.
  return html || route.kind === "refresh" ? { status: 200, html: html ?? "" } : { status: 404, error: goalsReadRouteNotFound(route) };
}

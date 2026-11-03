import type { DeclaredPageRouteMatch } from "@molis-ai/molis-work-plugin-sdk";
import { GOALS_PLUGIN_ID } from "./identity.js";

export type GoalDocumentCollection = "current" | "archive" | "trash";

/** A match of Goals' own declared routes (`GOALS_PAGE_ROUTES`), or null for anyone else's. */
function ownMatch(match: DeclaredPageRouteMatch | null): DeclaredPageRouteMatch | null {
  return match && match.plugin_id === GOALS_PLUGIN_ID ? match : null;
}

export type GoalsReadRoute =
  | { kind: "refresh"; collection: GoalDocumentCollection; goal_id?: string }
  | { kind: "momentum"; collection: "current" | "archive"; goal_id: string }
  | { kind: "document"; collection: GoalDocumentCollection; goal_id: string };
export interface GoalsRouteError { status: 400 | 404; error: string }

/** What the Host's match of a fragment route (`board-refresh`, `board-momentum`, `goal-document`) asks for, or the refusal; null when it is another route. */
export function goalsReadRouteOf(declared: DeclaredPageRouteMatch | null): { route: GoalsReadRoute } | GoalsRouteError | null {
  const match = ownMatch(declared);
  const refresh = match?.route_id === "board-refresh", momentum = match?.route_id === "board-momentum", document = match?.route_id === "goal-document";
  if (!match || !(refresh || momentum || document)) return null;
  if (match.rejected) return document ? { status: 404, error: "Goal 内容不存在" } : { status: 400, error: "Goal 请求参数无效" };
  const collection = match.params.view ?? "current";
  if (momentum) {
    if (collection !== "current" && collection !== "archive") return { status: 400, error: "Goal 推进态势集合无效" };
    return { route: { kind: "momentum", collection, goal_id: match.params.goal_id?.trim() || "" } };
  }
  if (collection !== "current" && collection !== "archive" && collection !== "trash") return { status: 400, error: "Goal 正文集合无效" };
  if (refresh) return { route: { kind: "refresh", collection, goal_id: match.params.goal_id?.trim() || undefined } };
  return { route: { kind: "document", collection, goal_id: match.params.goal_id ?? "" } };
}

export function goalsReadRouteNotFound(route: GoalsReadRoute): string {
  switch (route.kind) {
    case "momentum": return "Goal 推进态势不存在";
    default: return `找不到这个 Goal: ${route.goal_id}`;
  }
}

export interface GoalsPageRoute { collection: GoalDocumentCollection; goal_id?: string }
export interface GoalsPageCollections<TItem extends { goal: { goal_id: string } } = { goal: { goal_id: string } }> {
  goals: readonly TItem[];
  archived_goals: readonly TItem[];
  trashed_goals: readonly TItem[];
}

export interface GoalsFragmentItem {
  goal: { goal_id: string; archived_at: string | null; trashed_at: string | null };
}
export function goalsReadCollection<TItem extends { goal: { goal_id: string } }>(
  view: GoalsPageCollections<TItem>, collection: GoalDocumentCollection,
): readonly TItem[] {
  return collection === "trash" ? view.trashed_goals : collection === "archive" ? view.archived_goals : view.goals;
}
export function findGoalsFragmentItem<TItem extends GoalsFragmentItem>(
  view: GoalsPageCollections<TItem>, goalId: string, collection: GoalDocumentCollection,
): TItem | null {
  const item = goalsReadCollection(view, collection).find(candidate => candidate.goal.goal_id === goalId);
  return item ?? null;
}

/** Keep a direct Goal URL readable after archive/trash; this is presentation selection, not authority. */
export function resolveGoalsPageCollection(route: GoalsPageRoute, view: GoalsPageCollections): { route: GoalsPageRoute } | GoalsRouteError {
  const goalId = route.goal_id;
  const requestedArchived = goalId ? view.archived_goals.some(item => item.goal.goal_id === goalId) : false;
  const requestedTrashed = goalId ? view.trashed_goals.some(item => item.goal.goal_id === goalId) : false;
  const trashView = route.collection === "trash" || requestedTrashed;
  const archiveView = !trashView && (route.collection === "archive" || requestedArchived);
  const collection = trashView ? view.trashed_goals : archiveView ? view.archived_goals : view.goals;
  if (goalId && !collection.some(item => item.goal.goal_id === goalId)) {
    return { status: 404, error: `找不到这个 Goal: ${goalId}` };
  }
  return { route: { ...route, collection: trashView ? "trash" : archiveView ? "archive" : "current" } };
}

const PAGE_ROUTE_COLLECTIONS: Readonly<Record<string, GoalDocumentCollection>> = { "project-page": "current", "goal-page": "current", "archive-page": "archive", "archive-goal-page": "archive", "trash-page": "trash", "trash-goal-page": "trash" };

/** What the Host's match of a page route (the project, archive and trash pages and a Goal's page in each) asks for, or the refusal; null when it is another route. */
export function goalsPageRouteOf(declared: DeclaredPageRouteMatch | null): { route: GoalsPageRoute } | GoalsRouteError | null {
  const match = ownMatch(declared);
  const collection = match ? PAGE_ROUTE_COLLECTIONS[match.route_id] : undefined;
  if (!match || !collection) return null;
  if (match.rejected) return { status: 404, error: "Goal 页面不存在" };
  return { route: match.params.goal_id === undefined ? { collection } : { collection, goal_id: match.params.goal_id } };
}

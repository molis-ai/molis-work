import type { UiPageRouteDeclaration } from "@molis-ai/molis-work-contracts/platform/ui";

/**
 * The GET pages Goals answers, declared as data in its Manifest (`ui.page_routes`, T-116 / PG-060). The Host matches a request with
 * one matcher over every plugin's declarations and hands Goals the match; Goals reads what the route means (`goalsReadRouteOf`,
 * `goalsPageRouteOf`) and refuses what it does not accept. The fragment routes keep the paths the page's scripts
 * fetch; the page routes are the project's Goal pages.
 */
export const GOALS_PAGE_ROUTES: UiPageRouteDeclaration[] = [
  { route_id: "board-refresh", path: "/api/board/refresh", query: ["view", "goal_id"] },
  { route_id: "board-momentum", path: "/api/board/momentum", query: ["view", "goal_id"] },
  { route_id: "goal-document", path: "/api/goals/:goal_id/document", query: ["view"] },
  { route_id: "project-page", path: "/", params: { collection: "current" } },
  { route_id: "archive-page", path: "/archive", params: { collection: "archive" } },
  { route_id: "trash-page", path: "/trash", params: { collection: "trash" } },
  { route_id: "goal-page", path: "/goals/:goal_id", params: { collection: "current" } },
  { route_id: "archive-goal-page", path: "/archive/goals/:goal_id", params: { collection: "archive" } },
  { route_id: "trash-goal-page", path: "/trash/goals/:goal_id", params: { collection: "trash" } },
];

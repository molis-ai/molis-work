import type { UiPageRouteDeclaration } from "@molis-ai/molis-work-contracts/platform/ui";

/**
 * The GET pages Goals answers, declared as data in its Manifest (`ui.page_routes`, T-116 / PG-060). The Host matches a request with
 * one matcher over every plugin's declarations and dispatches page vs fragment / refresh_document generically without importing Goals.
 */
export const GOALS_PAGE_ROUTES: UiPageRouteDeclaration[] = [
  { route_id: "board-refresh", kind: "refresh_document", path: "/api/board/refresh", query: ["view", "goal_id", "projection"], params: { route_kind: "refresh" } },
  { route_id: "board-momentum", kind: "fragment", path: "/api/board/momentum", query: ["view", "goal_id"], params: { route_kind: "momentum" } },
  { route_id: "goal-document", kind: "fragment", path: "/api/goals/:goal_id/document", query: ["view"], params: { route_kind: "document" } },
  { route_id: "project-page", path: "/", params: { collection: "current" } },
  { route_id: "archive-page", path: "/archive", params: { collection: "archive" } },
  { route_id: "trash-page", path: "/trash", params: { collection: "trash" } },
  { route_id: "goal-page", path: "/goals/:goal_id", params: { collection: "current" } },
  { route_id: "archive-goal-page", path: "/archive/goals/:goal_id", params: { collection: "archive" } },
  { route_id: "trash-goal-page", path: "/trash/goals/:goal_id", params: { collection: "trash" } },
];

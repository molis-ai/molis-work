import type { PlanningMethodPack } from "@molis-ai/molis-work-contracts/modules/goals";

export type GoalsPlanningRoute =
  | { kind: "library" }
  | { kind: "method"; method_id: string; mode: "detail" | "edit" | "new" };

/** Host removes the Project prefix before matching; identifiers are decoded once. */
export function matchGoalsPlanningRoute(pathname: string, scope: "personal" | "project"): GoalsPlanningRoute | null {
  if (pathname === "/settings/planning") return { kind: "library" };
  const match = scope === "personal"
    ? pathname.match(/^\/settings\/planning(?:\/([^/]+))?(?:\/(edit))?$/)
    : pathname.match(/^\/settings\/planning\/([^/]+)(?:\/(edit))?$/);
  if (!match) return null;
  const method_id = decodeURIComponent(match[1]!);
  return { kind: "method", method_id, mode: method_id === "new" ? "new" : match[2] ? "edit" : "detail" };
}

/** Select within the Host's already-resolved methods; this is not a method authorization query. */
export function selectGoalsPlanningPageMethod(
  route: Extract<GoalsPlanningRoute, { kind: "method" }>, methods: readonly PlanningMethodPack[],
  scope: "personal" | "project", translate: (text: string) => string,
): { method: PlanningMethodPack | null } | { status: 404; error: string } {
  const method = route.method_id === "new" ? null : methods.find(item =>
    item.method_id === route.method_id && (scope === "personal" || item.scope === "project")) ?? null;
  if (route.method_id !== "new" && !method) {
    return { status: 404, error: translate(scope === "project" ? "找不到这个项目方法" : "找不到这套规划方法") };
  }
  return { method };
}

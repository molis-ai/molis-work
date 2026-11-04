import type { DeclaredPageRouteMatch } from "@molis-ai/molis-work-plugin-sdk";
import type { PlanningMethodPack } from "./contract/goals.js";
import { GOALS_PLUGIN_ID } from "./identity.js";

export type GoalsPlanningRoute =
  | { kind: "library" }
  | { kind: "method"; method_id: string; mode: "detail" | "edit" | "new" };

/** What the Host's match of a planning route (`planning-library`, `planning-method`, `planning-method-edit`) asks for; null when it is another route. A rejected identifier is a method that is not there. */
export function goalsPlanningRouteOf(declared: DeclaredPageRouteMatch | null): GoalsPlanningRoute | { rejected: true } | null {
  if (!declared || declared.plugin_id !== GOALS_PLUGIN_ID) return null;
  if (declared.route_id === "planning-library") return { kind: "library" };
  if (declared.route_id !== "planning-method" && declared.route_id !== "planning-method-edit") return null;
  const method_id = declared.params.method_id;
  if (declared.rejected || method_id === undefined) return { rejected: true };
  return { kind: "method", method_id, mode: method_id === "new" ? "new" : declared.route_id === "planning-method-edit" ? "edit" : "detail" };
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
